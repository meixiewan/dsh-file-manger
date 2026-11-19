import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readdir, readFile, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough, Readable } from 'node:stream';

import { DEFAULT_LIMITS, FileOps } from '../lib/ops.js';
import { assertName, assertRelativePath, uniqueName } from '../lib/paths.js';
import { ERROR_CODES, FileManagerError } from '../lib/errors.js';

async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-fm-test-'));
  return {
    root,
    ops: new FileOps({ realRoot: root, displayRoot: root }),
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof FileManagerError, `expected FileManagerError, got ${error}`);
    assert.equal(error.code, code);
    return true;
  });
}

test('path validation rejects traversal, absolute paths, and escapes', () => {
  assert.equal(assertRelativePath(''), '');
  assert.equal(assertRelativePath('docs/a.txt'), 'docs/a.txt');
  for (const bad of ['..', '../x', 'a/../b', '/etc/passwd', 'a\\b', 'a//b', 'a/./b', 'a\u0000b']) {
    assert.throws(() => assertRelativePath(bad), (error) => error.code === ERROR_CODES.invalidPath);
  }
  assert.throws(() => assertRelativePath('', { allowRoot: false }), (error) => error.code === ERROR_CODES.invalidPath);
  assert.equal(assertName('hello world.txt'), 'hello world.txt');
  for (const bad of ['', '.', '..', 'a/b', 'a\\b', 'a\u0001b', 'name ', 'name.', 'CON', 'com1.txt']) {
    assert.throws(() => assertName(bad), (error) => error.code === ERROR_CODES.invalidName);
  }
  assert.equal(uniqueName('a.txt', new Set(['a.txt'])), 'a (1).txt');
  assert.equal(uniqueName('.env', new Set(['.env'])), '.env (1)');
});

test('list sorts folders first and reports file metadata', async (t) => {
  const { root, ops, cleanup } = await setup();
  t.after(cleanup);
  await mkdir(path.join(root, 'z-dir'));
  await mkdir(path.join(root, 'a-dir'));
  await writeFile(path.join(root, 'b.txt'), 'hello');
  const listing = await ops.list('');
  assert.equal(listing.path, '');
  assert.equal(listing.parent, null);
  assert.deepEqual(listing.entries.map((entry) => entry.name), ['a-dir', 'z-dir', 'b.txt']);
  assert.equal(listing.entries[2].kind, 'file');
  assert.equal(listing.entries[2].size, 5);
  assert.equal(listing.entries[0].kind, 'directory');
  assert.equal(listing.truncated, false);
});

test('mkdir, rename, move, copy, delete, and read', async (t) => {
  const { root, ops, cleanup } = await setup();
  t.after(cleanup);
  await ops.mkdir('', 'docs');
  await writeFile(path.join(root, 'docs', 'a.txt'), 'alpha');
  await writeFile(path.join(root, 'b.txt'), 'bravo');

  const renamed = await ops.rename('docs/a.txt', 'b.txt');
  assert.equal(renamed.path, 'docs/b.txt');
  assert.equal(await readFile(path.join(root, 'docs/b.txt'), 'utf8'), 'alpha');

  await expectCode(ops.rename('b.txt', 'docs'), ERROR_CODES.exists);
  const caseOnly = await ops.rename('b.txt', 'B.txt');
  assert.equal(caseOnly.path, 'B.txt');
  assert.equal(await readFile(path.join(root, 'B.txt'), 'utf8'), 'bravo');

  await mkdir(path.join(root, 'archive'));
  const copied = await ops.copy(['B.txt', 'docs'], 'archive');
  assert.equal(copied.failed, 0);
  assert.equal(copied.succeeded, 2);
  assert.equal(await readFile(path.join(root, 'archive', 'B.txt'), 'utf8'), 'bravo');
  assert.equal(await readFile(path.join(root, 'archive', 'docs', 'b.txt'), 'utf8'), 'alpha');

  const sameDir = await ops.copy(['B.txt'], '');
  assert.equal(sameDir.succeeded, 1);
  assert.equal(sameDir.results[0].to, 'B (1).txt');
  assert.equal(await readFile(path.join(root, 'B (1).txt'), 'utf8'), 'bravo');

  await mkdir(path.join(root, 'moved'));
  const moved = await ops.move(['B.txt'], 'moved');
  assert.equal(moved.succeeded, 1);
  assert.equal(await readFile(path.join(root, 'moved', 'B.txt'), 'utf8'), 'bravo');

  const listing = await ops.list('moved');
  assert.deepEqual(listing.entries.map((entry) => entry.name), ['B.txt']);

  const text = await ops.read('moved/B.txt');
  assert.equal(text.text, 'bravo');
  assert.equal(text.truncated, false);

  const deleted = await ops.delete(['archive/B.txt', 'archive/docs', 'archive', 'docs', 'moved/B.txt']);
  assert.equal(deleted.succeeded, 5);
  assert.equal(deleted.failed, 0);
  await expectCode(ops.list('archive'), ERROR_CODES.notFound);
});

test('move rejects a directory into itself', async (t) => {
  const { root, ops, cleanup } = await setup();
  t.after(cleanup);
  await mkdir(path.join(root, 'outer'));
  await mkdir(path.join(root, 'outer', 'inner'));
  const result = await ops.move(['outer'], 'outer/inner');
  assert.equal(result.succeeded, 0);
  assert.equal(result.results[0].error.code, ERROR_CODES.invalidPath);
  assert.equal((await ops.list('outer/inner')).entries.length, 0);
});

test('symlink escape is rejected for navigation and reads, but can be unlinked', async (t) => {
  const { root, ops, cleanup } = await setup();
  const outside = await mkdtemp(path.join(os.tmpdir(), 'dsh-fm-outside-'));
  t.after(async () => {
    await cleanup();
    await rm(outside, { recursive: true, force: true });
  });
  await writeFile(path.join(outside, 'secret.txt'), 'secret');
  await symlink(outside, path.join(root, 'escape'));
  await expectCode(ops.list('escape'), ERROR_CODES.notDirectory);
  await expectCode(ops.read('escape/secret.txt'), ERROR_CODES.invalidPath);
  const copied = await ops.copy(['escape'], '');
  assert.equal(copied.failed, 1);
  assert.equal(copied.results[0].error.code, ERROR_CODES.unsupported);
  const deleted = await ops.delete(['escape']);
  assert.equal(deleted.succeeded, 1);
  assert.equal(await readFile(path.join(outside, 'secret.txt'), 'utf8'), 'secret');
});

test('upload places unique names, handles zero bytes, and enforces the limit', async (t) => {
  const { root, ops, cleanup } = await setup();
  t.after(cleanup);
  await mkdir(path.join(root, 'uploads'));
  const first = await ops.upload('uploads', 'note.txt', Readable.from([Buffer.from('one')]));
  assert.equal(first.name, 'note.txt');
  assert.equal(await readFile(path.join(root, 'uploads', 'note.txt'), 'utf8'), 'one');
  const second = await ops.upload('uploads', 'note.txt', Readable.from([Buffer.from('two')]));
  assert.equal(second.name, 'note (1).txt');
  assert.equal(await readFile(path.join(root, 'uploads', 'note (1).txt'), 'utf8'), 'two');
  const empty = await ops.upload('uploads', 'empty.bin', null);
  assert.equal(empty.size, 0);
  assert.equal((await ops.list('uploads')).entries.length, 3);

  const limited = new FileOps({ realRoot: root, displayRoot: root, limits: { maxUploadBytes: 4 } });
  await expectCode(
    limited.upload('uploads', 'five-copy.bin', Readable.from([Buffer.from('12345')])),
    ERROR_CODES.tooLarge,
  );
});

test('read marks oversized text as truncated and rejects binary', async (t) => {
  const { root, ops, cleanup } = await setup();
  t.after(cleanup);
  await writeFile(path.join(root, 'small.txt'), 'hello');
  await writeFile(path.join(root, 'binary.bin'), Buffer.from([0x61, 0x00, 0x62]));
  await writeFile(path.join(root, 'large.txt'), 'abcdefghij');
  const limited = new FileOps({ realRoot: root, displayRoot: root, limits: { maxTextBytes: 4 } });
  const text = await limited.read('large.txt');
  assert.equal(text.text, 'abcd');
  assert.equal(text.truncated, true);
  await expectCode(limited.read('binary.bin'), ERROR_CODES.notText);
  assert.equal((await ops.read('small.txt')).text, 'hello');
});

test('list truncates at maxEntries', async (t) => {
  const { root, ops, cleanup } = await setup();
  t.after(cleanup);
  for (let index = 0; index < 6; index += 1) await writeFile(path.join(root, `f${index}.txt`), 'x');
  const limited = new FileOps({ realRoot: root, displayRoot: root, limits: { maxEntries: 3 } });
  const listing = await limited.list('');
  assert.equal(listing.entries.length, 3);
  assert.equal(listing.truncated, true);
});


test('case-only rename never overwrites a distinct case-variant target', async (t) => {
  const { root, ops, cleanup } = await setup();
  t.after(cleanup);
  await writeFile(path.join(root, 'foo'), 'LOWER');
  await writeFile(path.join(root, 'FOO'), 'UPPER');

  await expectCode(ops.rename('foo', 'FOO'), ERROR_CODES.exists);
  assert.equal(await readFile(path.join(root, 'foo'), 'utf8'), 'LOWER');
  assert.equal(await readFile(path.join(root, 'FOO'), 'utf8'), 'UPPER');
  assert.deepEqual((await readdir(root)).sort(), ['FOO', 'foo']);
});

test('list paginates, filters, and bounds the directory scan', async (t) => {
  const { root, ops, cleanup } = await setup();
  t.after(cleanup);
  for (let index = 0; index < 7; index += 1) await writeFile(path.join(root, `file-${index}.txt`), 'x');
  const first = await ops.list('', { limit: 2 });
  assert.equal(first.entries.length, 2);
  assert.equal(first.total, 7);
  assert.equal(first.hasMore, true);
  assert.equal(first.nextOffset, 2);
  const second = await ops.list('', { limit: 2, offset: first.nextOffset });
  assert.equal(second.offset, 2);
  assert.equal(second.entries.length, 2);
  assert.equal(second.hasMore, true);
  const filtered = await ops.list('', { query: 'file-4', limit: 10 });
  assert.deepEqual(filtered.entries.map((entry) => entry.name), ['file-4.txt']);

  const bounded = new FileOps({ realRoot: root, displayRoot: root, limits: { maxScanEntries: 3 } });
  const truncated = await bounded.list('', { limit: 10 });
  assert.equal(truncated.scanTruncated, true);
  assert.equal(truncated.total, 3);
});

test('temporary workspace files are hidden and stale staging files are reclaimed', async (t) => {
  const { root, ops, cleanup } = await setup();
  t.after(cleanup);
  const staleName = `.dsh-fm-tmp-${'a'.repeat(24)}`;
  const liveName = `.dsh-fm-tmp-${'b'.repeat(24)}`;
  const stale = path.join(root, staleName);
  await writeFile(stale, 'internal');
  const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
  await utimes(stale, old, old);
  const staleDirName = `.dsh-fm-tmp-${'c'.repeat(24)}`;
  const staleDir = path.join(root, staleDirName);
  await mkdir(staleDir);
  await utimes(staleDir, old, old);
  await writeFile(path.join(root, liveName), 'internal');
  await writeFile(path.join(root, 'visible.txt'), 'yes');
  const listing = await ops.list('');
  assert.deepEqual(listing.entries.map((entry) => entry.name), ['visible.txt']);
  assert.equal(listing.scanLimit, 50000);
  assert.equal((await readdir(root)).includes(liveName), true);
  assert.equal((await readdir(root)).includes(staleName), false);
  assert.equal((await readdir(root)).includes(staleDirName), false);
});

test('concurrent uploads are bounded per workspace', async (t) => {
  const { root, ops, cleanup } = await setup();
  t.after(cleanup);
  const bodies = [new PassThrough(), new PassThrough(), new PassThrough()];
  const pending = ['one.txt', 'two.txt', 'three.txt'].map((name, index) => ops.upload('', name, bodies[index]));
  // The first two slots have created staging files; the third is still queued.
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const staging = (await readdir(root)).filter((name) => name.startsWith('.dsh-fm-tmp-'));
    if (staging.length === 2) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal((await readdir(root)).filter((name) => name.startsWith('.dsh-fm-tmp-')).length, 2);
  for (const body of bodies) body.end('payload');
  const results = await Promise.all(pending);
  assert.deepEqual(results.map((result) => result.name), ['one.txt', 'two.txt', 'three.txt']);
  assert.equal(await readFile(path.join(root, 'three.txt'), 'utf8'), 'payload');
});

test('a failed upload leaves neither a target nor a temporary file', async (t) => {
  const { root, ops, cleanup } = await setup();
  t.after(cleanup);
  async function* broken() {
    yield Buffer.from('partial');
    throw new Error('simulated stream failure');
  }
  await expectCode(ops.upload('', 'upload.txt', Readable.from(broken())), ERROR_CODES.internal);
  assert.deepEqual(await readdir(root), []);
});

test('copy stages files and cleans temporary entries', async (t) => {
  const { root, ops, cleanup } = await setup();
  t.after(cleanup);
  await writeFile(path.join(root, 'source.txt'), 'copy me');
  await mkdir(path.join(root, 'dest'));
  const copied = await ops.copy(['source.txt'], 'dest');
  assert.equal(copied.succeeded, 1);
  assert.deepEqual((await readdir(path.join(root, 'dest'))).sort(), ['source.txt']);
  assert.deepEqual((await readdir(root)).sort(), ['dest', 'source.txt']);
});

test('copies a directory through hidden staging without leaving residue', async (t) => {
  const { root, ops, cleanup } = await setup();
  t.after(cleanup);
  await mkdir(path.join(root, 'src', 'nested'), { recursive: true });
  await writeFile(path.join(root, 'src', 'nested', 'note.txt'), 'copied');
  await mkdir(path.join(root, 'dest'));
  const result = await ops.copy(['src'], 'dest');
  assert.equal(result.results[0].ok, true);
  assert.equal(await readFile(path.join(root, 'dest', 'src', 'nested', 'note.txt'), 'utf8'), 'copied');
  assert.deepEqual((await readdir(path.join(root, 'dest'))).filter((name) => name.startsWith('.dsh-fm-tmp-')), []);
});

test('copy rejects a symlink-intermediate destination inside its source', async (t) => {
  const { root, ops, cleanup } = await setup();
  t.after(cleanup);
  await mkdir(path.join(root, 'src', 'sub'), { recursive: true });
  await writeFile(path.join(root, 'src', 'sub', 'inside.txt'), 'inside');
  await symlink(path.join(root, 'src'), path.join(root, 'alias'));
  const result = await ops.copy(['src'], 'alias/sub');
  assert.equal(result.succeeded, 0);
  assert.equal(result.results[0].error.code, ERROR_CODES.invalidPath);
  assert.equal((await readdir(path.join(root, 'src', 'sub'))).includes('src'), false);
});

test('aborted batches stop before starting another item', async (t) => {
  const { root, ops, cleanup } = await setup();
  t.after(cleanup);
  await writeFile(path.join(root, 'one.txt'), 'one');
  await writeFile(path.join(root, 'two.txt'), 'two');
  await mkdir(path.join(root, 'dest'));
  const controller = new AbortController();
  controller.abort();
  const result = await ops.copy(['one.txt', 'two.txt'], 'dest', { signal: controller.signal });
  assert.equal(result.succeeded, 0);
  assert.equal(result.failed, 2);
  assert.equal(result.results[0].error.code, ERROR_CODES.aborted);
  assert.deepEqual(await readdir(path.join(root, 'dest')), []);
});


test('default upload limit is 8 GiB', () => {
  assert.equal(DEFAULT_LIMITS.maxUploadBytes, 8 * 1024 * 1024 * 1024);
});
