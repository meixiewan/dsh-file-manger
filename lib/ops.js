/**
 * Workspace-scoped file operations.
 *
 * `FileOps` is constructed per request with the Session's real workspace root.
 * Every path is lexically contained by that root and every parent directory is
 * re-checked through `realpath`, so a symlink cannot move an operation outside
 * the workspace. Mutations are serialized per root to keep unique-name and
 * move/copy checks meaningful under concurrent requests.
 */
import { constants as fsConstants, createWriteStream } from 'node:fs';
import {
  copyFile,
  cp,
  link,
  lstat,
  mkdir,
  open,
  opendir,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { ERROR_CODES, FileManagerError, asFileManagerError, fail } from './errors.js';
import { MAX_INLINE_IMAGE_PIXELS, readImageDimensions } from './image.js';
import { isInlineImage } from './mime.js';
import {
  MAX_BATCH,
  assertName,
  assertNotInsideSource,
  assertRelativePath,
  baseName,
  isContained,
  joinWire,
  parentOf,
  resolveInside,
  uniqueName,
} from './paths.js';

/** Default safety limits; intentionally not user-configurable. */
export const DEFAULT_LIMITS = Object.freeze({
  maxUploadBytes: 8 * 1024 * 1024 * 1024,
  maxEntries: 2000,
  maxScanEntries: 50000,
  maxInlineImageBytes: 32 * 1024 * 1024,
  maxImagePixels: MAX_INLINE_IMAGE_PIXELS,
  maxBatch: MAX_BATCH,
  maxTextBytes: 256 * 1024,
});

/** Hidden prefix for temporary files created inside the workspace. */
export const INTERNAL_TEMP_PREFIX = '.dsh-fm-tmp-';

/** Exact staging name; a user file that merely starts with the prefix stays visible. */
const INTERNAL_TEMP_PATTERN = /^\.dsh-fm-tmp-[0-9a-f]{24}$/;

/** Crash-orphaned staging files older than this are safe to remove. */
const STALE_TEMP_MS = 24 * 60 * 60 * 1000;

/** Per-root mutation tails. */
const mutationTails = new Map();

/**
 * Serialize one mutation against every other mutation on the same workspace.
 * @template T
 * @param {string} root - real workspace root.
 * @param {() => Promise<T>} task - mutation.
 * @returns {Promise<T>}
 */
const MUTATION_LOCK_STALE_MS = 10 * 60 * 1000;

function withMutation(root, task) {
  const previous = mutationTails.get(root);
  if (previous && Date.now() - previous.startedAt > MUTATION_LOCK_STALE_MS) {
    // The lock holder is likely stuck in an uninterruptible filesystem call.
    // Refuse new work instead of queueing it behind an operation that may
    // never finish; the stuck request's own client can still time out.
    return Promise.reject(new FileManagerError(ERROR_CODES.busy, 'Another file operation is still running in this workspace.'));
  }
  const start = Date.now();
  const run = (previous?.tail ?? Promise.resolve()).then(task, task);
  const tail = run.then(() => {}, () => {});
  const entry = { tail, startedAt: start };
  mutationTails.set(root, entry);
  return run.finally(() => {
    if (mutationTails.get(root) === entry) mutationTails.delete(root);
  });
}

/** Run `worker` over items with at most `limit` in flight, preserving order. */
async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const count = Math.min(limit, items.length);
  const runners = Array.from({ length: count }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

/** Normalize a limit to a positive integer. */
function positiveInteger(value, fallback) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

/** Stop a long batch when the browser cancelled the request. */
function assertNotAborted(signal) {
  if (signal?.aborted) fail(ERROR_CODES.aborted, 'The operation was cancelled.');
}

/** Hidden sibling used to stage an upload or copy on the same filesystem. */
function temporaryPath(directory) {
  return path.join(directory, `${INTERNAL_TEMP_PREFIX}${randomBytes(12).toString('hex')}`);
}

/**
 * Link a staged file into place without replacing an existing target.
 * Falls back to an exclusive copy on filesystems that do not support links;
 * the caller receives a clean failure and no partially written target.
 * @param {string} staged - temporary file on the destination filesystem.
 * @param {string} target - final path that must not exist.
 */
async function linkOrCopy(staged, target) {
  try {
    await link(staged, target);
    return;
  } catch (error) {
    if (error?.code === 'EEXIST') throw error;
    if (!['EXDEV', 'EPERM', 'ENOTSUP', 'EOPNOTSUPP'].includes(error?.code)) throw error;
  }
  try {
    await copyFile(staged, target, fsConstants.COPYFILE_EXCL);
  } catch (error) {
    // EEXIST means another actor won the target race; never delete its file.
    if (error?.code !== 'EEXIST') await unlink(target).catch(() => {});
    throw error;
  }
}

/** Kind label shown in the browser. */
function kindOf(info) {
  if (info.isSymbolicLink()) return 'symlink';
  if (info.isDirectory()) return 'directory';
  if (info.isFile()) return 'file';
  return 'other';
}

const KIND_RANK = Object.freeze({ directory: 0, symlink: 1, file: 2, other: 3 });
const NAME_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Directory-first, case-insensitive natural ordering. */
function compareEntries(left, right) {
  const byKind = (KIND_RANK[left.kind] ?? 3) - (KIND_RANK[right.kind] ?? 3);
  if (byKind !== 0) return byKind;
  const byName = NAME_COLLATOR.compare(left.name, right.name);
  if (byName !== 0) return byName;
  return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
}

/** Deduplicate validated batch paths. */
function uniquePaths(list) {
  if (!Array.isArray(list) || list.length === 0) fail(ERROR_CODES.invalidBody, 'A non-empty paths array is required.');
  if (list.length > MAX_BATCH) fail(ERROR_CODES.tooLarge, 'Too many items in one request.');
  const seen = new Set();
  const paths = [];
  for (const item of list) {
    const rel = assertRelativePath(item, { allowRoot: false });
    if (seen.has(rel)) continue;
    seen.add(rel);
    paths.push(rel);
  }
  return paths;
}

/** One batch response. */
function batch(root, destination, results) {
  const succeeded = results.filter((result) => result.ok).length;
  return {
    root,
    ...(destination === undefined ? {} : { dest: destination }),
    results,
    total: results.length,
    succeeded,
    failed: results.length - succeeded,
  };
}

/** Turn a process signal error into the wire-level aborted code. */
function uploadError(error) {
  if (error instanceof FileManagerError) return error;
  if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') {
    return new FileManagerError(ERROR_CODES.aborted, 'The upload was cancelled.');
  }
  return asFileManagerError(error);
}

const MAX_CONCURRENT_UPLOADS = 2;
const uploadSlots = new Map();

/**
 * Limit concurrent uploads per real workspace root.
 *
 * Each upload stages a temporary file on the workspace filesystem. Without a
 * bound, several large parallel uploads can fill the disk before any single
 * request reaches its own size limit.
 * @param {string} root - real workspace root.
 * @param {() => Promise<unknown>} task - upload work.
 * @returns {Promise<unknown>}
 */
function withUploadSlot(root, task) {
  let state = uploadSlots.get(root);
  if (!state) {
    state = { active: 0, waiting: [] };
    uploadSlots.set(root, state);
  }
  const run = async () => {
    state.active += 1;
    try {
      return await task();
    } finally {
      state.active -= 1;
      const next = state.waiting.shift();
      if (next) next();
      else if (state.active === 0) uploadSlots.delete(root);
    }
  };
  if (state.active < MAX_CONCURRENT_UPLOADS) return run();
  return new Promise((resolve, reject) => {
    state.waiting.push(() => {
      run().then(resolve, reject);
    });
  });
}

/** File operations bound to one real workspace root. */
export class FileOps {
  /**
   * @param {{realRoot: string, displayRoot: string, limits?: object}} options - resolved root and limits.
   */
  constructor({ realRoot, displayRoot, limits }) {
    this.realRoot = realRoot;
    this.displayRoot = displayRoot;
    const source = limits ?? {};
    this.limits = {
      maxUploadBytes: positiveInteger(source.maxUploadBytes, DEFAULT_LIMITS.maxUploadBytes),
      maxEntries: positiveInteger(source.maxEntries, DEFAULT_LIMITS.maxEntries),
      maxScanEntries: positiveInteger(source.maxScanEntries, DEFAULT_LIMITS.maxScanEntries),
      maxInlineImageBytes: positiveInteger(source.maxInlineImageBytes, DEFAULT_LIMITS.maxInlineImageBytes),
      maxImagePixels: positiveInteger(source.maxImagePixels, DEFAULT_LIMITS.maxImagePixels),
      maxBatch: positiveInteger(source.maxBatch, DEFAULT_LIMITS.maxBatch),
      maxTextBytes: positiveInteger(source.maxTextBytes, DEFAULT_LIMITS.maxTextBytes),
    };
  }

  /**
   * Resolve one existing path and re-check its parent through realpath.
   * @param {string} rel - validated relative path.
   * @returns {Promise<{abs: string, info: import('node:fs').Stats}>}
   */
  async resolveExisting(rel) {
    const abs = resolveInside(this.realRoot, rel);
    let info;
    try {
      info = await lstat(abs);
    } catch (error) {
      throw asFileManagerError(error, ERROR_CODES.notFound);
    }
    if (rel !== '') {
      const parent = path.dirname(abs);
      let realParent;
      try {
        realParent = await realpath(parent);
      } catch (error) {
        throw asFileManagerError(error, ERROR_CODES.notFound);
      }
      if (!isContained(this.realRoot, realParent)) fail(ERROR_CODES.invalidPath, 'The path leaves the workspace.');
      let parentInfo;
      try {
        parentInfo = await stat(realParent);
      } catch (error) {
        throw asFileManagerError(error, ERROR_CODES.notFound);
      }
      if (!parentInfo.isDirectory()) fail(ERROR_CODES.notDirectory, 'The parent path is not a folder.');
    }
    return { abs, info };
  }

  /**
   * Resolve an existing directory, refusing a symlink as the final component.
   * @param {string} rel - validated relative path.
   * @returns {Promise<{abs: string, info: import('node:fs').Stats}>}
   */
  async resolveDirectory(rel) {
    const resolved = await this.resolveExisting(rel);
    if (resolved.info.isSymbolicLink() || !resolved.info.isDirectory()) {
      fail(ERROR_CODES.notDirectory, 'That path is not a folder.');
    }
    return resolved;
  }

  /**
   * List one directory with bounded scanning and a page of metadata.
   *
   * The directory is streamed with `opendir`; only the requested page gets an
   * `lstat`, so a directory with many files no longer creates one stat object
   * (or one unbounded promise queue) per entry. `query` filters names while
   * scanning, and `maxScanEntries` is a hard ceiling for pathological folders.
   *
   * @param {string} rel - validated relative path; `''` is the root.
   * @param {{query?: string, offset?: number, limit?: number, signal?: AbortSignal}} [options] - listing page.
   * @returns {Promise<object>}
   */
  async list(rel, options = {}) {
    const { abs } = await this.resolveDirectory(rel);
    const offset = Number.isSafeInteger(options.offset) && options.offset > 0 ? options.offset : 0;
    const limit = Math.min(positiveInteger(options.limit, this.limits.maxEntries), this.limits.maxEntries);
    const rawQuery = typeof options.query === 'string' ? options.query.trim() : '';
    if (rawQuery.length > 256) fail(ERROR_CODES.invalidBody, 'The search query is too long.');
    const needle = rawQuery.toLowerCase();
    const candidates = [];
    let scanned = 0;
    let scanTruncated = false;

    let directory;
    try {
      directory = await opendir(abs);
    } catch (error) {
      throw asFileManagerError(error, ERROR_CODES.internal);
    }
    try {
      for await (const dirent of directory) {
        if (options.signal?.aborted) fail(ERROR_CODES.aborted, 'The request was cancelled.');
        scanned += 1;
        if (scanned > this.limits.maxScanEntries) {
          scanTruncated = true;
          break;
        }
        if (INTERNAL_TEMP_PATTERN.test(dirent.name)) {
          // A crashed upload or copy may leave a hidden staging file. Only
          // reclaim one that is old enough not to belong to a live request.
          const stale = path.join(abs, dirent.name);
          try {
            const info = await lstat(stale);
            if (Date.now() - info.mtimeMs > STALE_TEMP_MS) await rm(stale, { recursive: true, force: true });
          } catch {
            /* another request may have cleaned it up already */
          }
          continue;
        }
        if (needle !== '' && !dirent.name.toLowerCase().includes(needle)) continue;
        candidates.push({ name: dirent.name, kind: kindOf(dirent) });
      }
    } catch (error) {
      if (error instanceof FileManagerError) throw error;
      throw asFileManagerError(error, ERROR_CODES.internal);
    } finally {
      await directory.close().catch(() => {});
    }

    candidates.sort(compareEntries);
    const total = candidates.length;
    const page = candidates.slice(offset, offset + limit);
    let skipped = 0;
    const entries = (await mapLimit(page, 16, async (candidate) => {
      try {
        const info = await lstat(path.join(abs, candidate.name));
        return {
          name: candidate.name,
          path: joinWire(rel, candidate.name),
          kind: kindOf(info),
          size: info.isFile() ? info.size : 0,
          mtimeMs: Number.isFinite(info.mtimeMs) ? info.mtimeMs : 0,
        };
      } catch {
        skipped += 1;
        return null;
      }
    })).filter((entry) => entry !== null);

    const pageEnd = Math.min(offset + limit, total);
    const nextOffset = pageEnd;
    const hasMore = pageEnd < total;
    return {
      root: this.displayRoot,
      path: rel,
      parent: rel === '' ? null : parentOf(rel),
      entries,
      query: rawQuery,
      offset,
      limit,
      total,
      nextOffset,
      hasMore,
      truncated: hasMore,
      scanTruncated,
      scanLimit: this.limits.maxScanEntries,
      skipped,
      limits: { ...this.limits },
    };
  }

  /**
   * Create one folder.
   * @param {string} dirRel - parent directory.
   * @param {string} name - new folder name.
   * @returns {Promise<object>}
   */
  async mkdir(dirRel, name, options = {}) {
    const clean = assertName(name);
    return withMutation(this.realRoot, async () => {
      assertNotAborted(options.signal);
      const parent = await this.resolveDirectory(dirRel);
      try {
        await mkdir(path.join(parent.abs, clean));
      } catch (error) {
        throw asFileManagerError(error);
      }
      return { path: joinWire(dirRel, clean), name: clean };
    });
  }

  /**
   * Rename one item in place.
   * @param {string} rel - existing item.
   * @param {string} name - new name.
   * @returns {Promise<object>}
   */
  async rename(rel, name, options = {}) {
    const clean = assertName(name);
    if (rel === '') fail(ERROR_CODES.invalidPath, 'The workspace root cannot be renamed.');
    return withMutation(this.realRoot, async () => {
      assertNotAborted(options.signal);
      const { abs, info: sourceInfo } = await this.resolveExisting(rel);
      const parent = path.dirname(abs);
      const oldName = path.basename(abs);
      if (oldName === clean) return { path: rel, name: clean, unchanged: true };
      const target = path.join(parent, clean);
      const caseOnly = oldName.toLowerCase() === clean.toLowerCase();
      const targetExists = async () => {
        try {
          await lstat(target);
          return true;
        } catch (error) {
          if (error?.code === 'ENOENT') return false;
          throw asFileManagerError(error);
        }
      };
      try {
        if (!caseOnly) {
          if (await targetExists()) fail(ERROR_CODES.exists, 'An item with that name already exists.');
          await rename(abs, target);
        } else if (!(await targetExists())) {
          // The common case-only rename has no distinct target, so a plain
          // rename is atomic and never exposes a second temporary name.
          await rename(abs, target);
        } else {
          // A distinct case-variant target exists. Move the source aside and
          // re-check before installing it so a second file is never silently
          // replaced. The hidden temporary is restored on every failure.
          const temporary = temporaryPath(parent);
          await rename(abs, temporary);
          try {
            if (await targetExists()) fail(ERROR_CODES.exists, 'An item with that name already exists.');
            await rename(temporary, target);
          } catch (error) {
            await rename(temporary, abs).catch(() => {});
            throw error;
          }
        }
      } catch (error) {
        throw asFileManagerError(error);
      }
      return {
        path: joinWire(parentOf(rel), clean),
        name: clean,
        kind: kindOf(sourceInfo),
      };
    });
  }

  /**
   * Move items into a destination folder.
   * @param {string[]} list - source paths.
   * @param {string} destination - destination directory.
   * @returns {Promise<object>}
   */
  async move(list, destination, options = {}) {
    const paths = uniquePaths(list);
    if (paths.length > this.limits.maxBatch) fail(ERROR_CODES.tooLarge, 'Too many items in one request.');
    const destRel = assertRelativePath(destination);
    return withMutation(this.realRoot, async () => {
      const dest = await this.resolveDirectory(destRel);
      const results = [];
      for (const rel of paths) {
        try {
          assertNotAborted(options.signal);
          const source = await this.resolveExisting(rel);
          if (rel === '') fail(ERROR_CODES.invalidPath, 'The workspace root cannot be moved.');
          if (source.info.isDirectory()) {
            const [realDestination, realSource] = await Promise.all([realpath(dest.abs), realpath(source.abs)]);
            assertNotInsideSource(realDestination, realSource);
          }
          if (path.dirname(source.abs) === dest.abs) {
            results.push({ path: rel, ok: true, unchanged: true });
            continue;
          }
          const target = path.join(dest.abs, baseName(rel));
          if (target === source.abs) {
            results.push({ path: rel, ok: true, unchanged: true });
            continue;
          }
          try {
            await lstat(target);
            fail(ERROR_CODES.exists, 'An item with that name already exists in the destination.');
          } catch (error) {
            if (error instanceof FileManagerError) throw error;
            if (error?.code !== 'ENOENT') throw asFileManagerError(error);
          }
          try {
            await rename(source.abs, target);
          } catch (error) {
            if (error?.code !== 'EXDEV') throw error;
            await this.moveAcrossDevice(source.abs, target);
          }
          results.push({ path: rel, ok: true, to: joinWire(destRel, baseName(rel)) });
        } catch (error) {
          results.push({ path: rel, ok: false, error: asFileManagerError(error) });
        }
      }
      return batch(this.displayRoot, destRel, results.map(cleanResult));
    });
  }

  /**
   * Copy items into a destination folder.
   * @param {string[]} list - source paths.
   * @param {string} destination - destination directory.
   * @returns {Promise<object>}
   */
  async copy(list, destination, options = {}) {
    const paths = uniquePaths(list);
    if (paths.length > this.limits.maxBatch) fail(ERROR_CODES.tooLarge, 'Too many items in one request.');
    const destRel = assertRelativePath(destination);
    return withMutation(this.realRoot, async () => {
      const dest = await this.resolveDirectory(destRel);
      const taken = new Set(await readdir(dest.abs));
      const results = [];
      for (const rel of paths) {
        try {
          assertNotAborted(options.signal);
          const source = await this.resolveExisting(rel);
          if (rel === '') fail(ERROR_CODES.invalidPath, 'The workspace root cannot be copied.');
          if (source.info.isSymbolicLink()) fail(ERROR_CODES.unsupported, 'Symbolic links cannot be copied.');
          if (!source.info.isDirectory() && !source.info.isFile()) {
            fail(ERROR_CODES.unsupported, 'Only files and folders can be copied.');
          }
          if (source.info.isDirectory()) {
            const [realDestination, realSource] = await Promise.all([realpath(dest.abs), realpath(source.abs)]);
            assertNotInsideSource(realDestination, realSource);
          }
          const originalName = baseName(rel);
          let targetName = originalName;
          let target = path.join(dest.abs, targetName);
          for (;;) {
            try {
              await lstat(target);
              taken.add(targetName);
              targetName = uniqueName(originalName, taken);
              target = path.join(dest.abs, targetName);
            } catch (error) {
              if (error?.code !== 'ENOENT') throw asFileManagerError(error);
              break;
            }
          }
          taken.add(targetName);
          if (source.info.isDirectory()) {
            // Stage the whole tree under a hidden name and rename it into
            // place, so a failed copy never leaves a partial destination and
            // cleanup can never remove a directory another process created.
            const temporary = temporaryPath(dest.abs);
            try {
              await cp(source.abs, temporary, {
                recursive: true,
                errorOnExist: true,
                force: false,
                dereference: false,
                preserveTimestamps: true,
              });
              try {
                await lstat(target);
                fail(ERROR_CODES.exists, 'An item with that name already exists in the destination.');
              } catch (error) {
                if (error instanceof FileManagerError) throw error;
                if (error?.code !== 'ENOENT') throw asFileManagerError(error);
              }
              await rename(temporary, target);
            } finally {
              await rm(temporary, { recursive: true, force: true }).catch(() => {});
            }
          } else {
            const temporary = temporaryPath(dest.abs);
            try {
              await copyFile(source.abs, temporary, fsConstants.COPYFILE_EXCL);
              await linkOrCopy(temporary, target);
            } finally {
              await unlink(temporary).catch(() => {});
            }
          }
          results.push({ path: rel, ok: true, to: joinWire(destRel, targetName) });
        } catch (error) {
          results.push({ path: rel, ok: false, error: asFileManagerError(error) });
        }
      }
      return batch(this.displayRoot, destRel, results.map(cleanResult));
    });
  }

  /**
   * Delete items; directories are removed recursively.
   * @param {string[]} list - source paths.
   * @returns {Promise<object>}
   */
  async delete(list, options = {}) {
    const paths = uniquePaths(list);
    if (paths.length > this.limits.maxBatch) fail(ERROR_CODES.tooLarge, 'Too many items in one request.');
    return withMutation(this.realRoot, async () => {
      const results = [];
      for (const rel of paths) {
        try {
          assertNotAborted(options.signal);
          if (rel === '') fail(ERROR_CODES.invalidPath, 'The workspace root cannot be deleted.');
          const source = await this.resolveExisting(rel);
          if (source.info.isSymbolicLink()) {
            await unlink(source.abs);
          } else if (source.info.isDirectory()) {
            await rm(source.abs, { recursive: true, force: false, maxRetries: 2 });
          } else if (source.info.isFile()) {
            await unlink(source.abs);
          } else {
            fail(ERROR_CODES.unsupported, 'That item type cannot be deleted.');
          }
          results.push({ path: rel, ok: true });
        } catch (error) {
          results.push({ path: rel, ok: false, error: asFileManagerError(error) });
        }
      }
      return batch(this.displayRoot, undefined, results.map(cleanResult));
    });
  }

  /**
   * Read a bounded UTF-8 text preview.
   * @param {string} rel - file path.
   * @returns {Promise<object>}
   */
  async read(rel) {
    const { abs, info } = await this.resolveExisting(rel);
    if (info.isSymbolicLink()) fail(ERROR_CODES.unsupported, 'Symbolic links cannot be read.');
    if (!info.isFile()) fail(ERROR_CODES.isDirectory, 'That path is not a file.');
    const length = Math.min(info.size, this.limits.maxTextBytes);
    const buffer = Buffer.alloc(length);
    let offset = 0;
    const handle = await open(abs, 'r');
    try {
      while (offset < length) {
        const { bytesRead } = await handle.read(buffer, offset, length - offset, offset);
        if (bytesRead === 0) break;
        offset += bytesRead;
      }
    } finally {
      await handle.close().catch(() => {});
    }
    const bytes = buffer.subarray(0, offset);
    if (bytes.includes(0)) fail(ERROR_CODES.notText, 'That file looks binary.');
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: offset === info.size }).decode(bytes);
    } catch {
      fail(ERROR_CODES.notText, 'That file is not valid UTF-8 text.');
    }
    return {
      path: rel,
      text,
      size: info.size,
      truncated: info.size > offset,
      mtimeMs: Number.isFinite(info.mtimeMs) ? info.mtimeMs : 0,
    };
  }

  /**
   * Open a download descriptor for a regular file.
   * @param {string} rel - file path.
   * @returns {Promise<{absolute: string, name: string, size: number, mtimeMs: number}>}
   */
  async download(rel) {
    const { abs, info } = await this.resolveExisting(rel);
    if (info.isSymbolicLink()) fail(ERROR_CODES.unsupported, 'Symbolic links cannot be downloaded.');
    if (!info.isFile()) fail(ERROR_CODES.isDirectory, 'That path is not a file.');
    return {
      absolute: abs,
      name: path.basename(abs),
      size: info.size,
      mtimeMs: Number.isFinite(info.mtimeMs) ? info.mtimeMs : 0,
    };
  }

  /**
   * Inspect an image before the client creates an `<img>` element.
   *
   * The browser decodes an image as soon as it receives it, so a disposition
   * header alone cannot protect against a decompression bomb. The preview UI
   * asks for dimensions first and only requests the inline URL when this method
   * says the bitmap is within budget.
   *
   * @param {string} rel - image path.
   * @returns {Promise<{path: string, width?: number, height?: number, pixels?: number, previewable: boolean, reason?: string}>}
   */
  async imageInfo(rel) {
    const descriptor = await this.download(rel);
    if (!isInlineImage(descriptor.name)) {
      return { path: rel, previewable: false, reason: 'unsupported' };
    }
    if (descriptor.size > this.limits.maxInlineImageBytes) {
      return { path: rel, size: descriptor.size, previewable: false, reason: 'too-large' };
    }
    const dimensions = await readImageDimensions(descriptor.absolute);
    if (!dimensions) {
      return { path: rel, previewable: false, reason: 'unsupported' };
    }
    const pixels = dimensions.width * dimensions.height;
    const previewable = pixels <= this.limits.maxImagePixels;
    return {
      path: rel,
      width: dimensions.width,
      height: dimensions.height,
      pixels,
      previewable,
      ...(previewable ? {} : { reason: 'too-large' }),
    };
  }

  /**
   * Receive one raw upload into a temporary file and place it in the workspace.
   * @param {string} dirRel - destination directory.
   * @param {string} name - requested name.
   * @param {ReadableStream|import('node:stream').Readable|null} body - raw body.
   * @param {{signal?: AbortSignal, onConflict?: 'rename'|'error', expectedBytes?: number}} [options] - upload options.
   * @returns {Promise<{path: string, name: string, size: number}>}
   */
  async upload(dirRel, name, body, options = {}) {
    const clean = assertName(name);
    const onConflict = options.onConflict ?? 'rename';
    if (onConflict !== 'rename' && onConflict !== 'error') fail(ERROR_CODES.invalidBody, 'onConflict must be "rename" or "error".');
    if (options.expectedBytes !== undefined && options.expectedBytes > this.limits.maxUploadBytes) {
      fail(ERROR_CODES.tooLarge, 'The upload is too large.');
    }
    const parent = await this.resolveDirectory(dirRel);
    if (options.signal?.aborted) fail(ERROR_CODES.aborted, 'The upload was cancelled.');

    return withUploadSlot(this.realRoot, async () => {
      assertNotAborted(options.signal);
      // Stage in the destination folder, not the system temp directory: a
      // tmpfs-backed /tmp can be far smaller than the workspace, and placing
      // the file on the same filesystem makes the final link atomic.
      const temporaryFile = temporaryPath(parent.abs);
      let received = 0;
      try {
        const max = this.limits.maxUploadBytes;
        const bound = new Transform({
          transform(chunk, _encoding, callback) {
            received += chunk.length;
            if (received > max) callback(new FileManagerError(ERROR_CODES.tooLarge, 'The upload is too large.'));
            else callback(null, chunk);
          },
        });
        if (body === null || body === undefined) {
          await writeFile(temporaryFile, Buffer.alloc(0), { flag: 'wx', mode: 0o600 });
        } else {
          const source = typeof body.getReader === 'function' ? Readable.fromWeb(body) : body;
          await pipeline(source, bound, createWriteStream(temporaryFile, { flags: 'wx', mode: 0o600 }), {
            signal: options.signal,
          });
        }

        const finalName = await withMutation(this.realRoot, async () => {
          assertNotAborted(options.signal);
          const taken = new Set(await readdir(parent.abs));
          let candidate = clean;
          if (onConflict === 'rename') candidate = uniqueName(clean, taken);
          for (let attempt = 0; attempt < 100; attempt += 1) {
            const target = path.join(parent.abs, candidate);
            try {
              await linkOrCopy(temporaryFile, target);
              return candidate;
            } catch (error) {
              if (error?.code === 'EEXIST' && onConflict === 'rename') {
                taken.add(candidate);
                candidate = uniqueName(clean, taken);
                continue;
              }
              throw asFileManagerError(error);
            }
          }
          fail(ERROR_CODES.exists, 'No free name was found for the upload.');
        });
        return { path: joinWire(dirRel, finalName), name: finalName, size: received };
      } catch (error) {
        throw uploadError(error);
      } finally {
        await unlink(temporaryFile).catch(() => {});
      }
    });
  }

  /**
   * Copy one item across filesystems, then remove the source.
   * @param {string} source - absolute source.
   * @param {string} target - absolute target.
   */
  async moveAcrossDevice(source, target) {
    const info = await lstat(source);
    if (info.isSymbolicLink()) fail(ERROR_CODES.unsupported, 'Symbolic links cannot be moved across filesystems.');
    if (info.isDirectory()) {
      const temporary = temporaryPath(path.dirname(target));
      try {
        await cp(source, temporary, {
          recursive: true,
          errorOnExist: true,
          force: false,
          dereference: false,
          preserveTimestamps: true,
        });
        try {
          await lstat(target);
          fail(ERROR_CODES.exists, 'An item with that name already exists in the destination.');
        } catch (error) {
          if (error instanceof FileManagerError) throw error;
          if (error?.code !== 'ENOENT') throw asFileManagerError(error);
        }
        await rename(temporary, target);
      } finally {
        await rm(temporary, { recursive: true, force: true }).catch(() => {});
      }
      await rm(source, { recursive: true, force: true });
    } else if (info.isFile()) {
      try {
        await copyFile(source, target, fsConstants.COPYFILE_EXCL);
      } catch (error) {
        if (error?.code !== 'EEXIST') await unlink(target).catch(() => {});
        throw error;
      }
      await unlink(source);
    } else {
      fail(ERROR_CODES.unsupported, 'That item type cannot be moved.');
    }
  }
}

/** Replace an Error in a batch result with its wire shape. */
function cleanResult(result) {
  if (result.ok) return result;
  const error = result.error;
  return {
    ...result,
    error: error instanceof FileManagerError
      ? { code: error.code, message: error.message, ...(error.details === undefined ? {} : { details: error.details }) }
      : { code: ERROR_CODES.internal, message: 'The operation failed.' },
  };
}

