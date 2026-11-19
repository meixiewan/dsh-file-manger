/**
 * Path and name rules for the workspace file manager.
 *
 * Wire paths are POSIX-shaped strings relative to one workspace root. They are
 * validated lexically here and checked again against real paths by the
 * operation layer, so `..`, absolute input, NULs, control characters, and
 * symlink escapes never reach `fs`.
 */
import path from 'node:path';

import { ERROR_CODES, fail } from './errors.js';

/** Longest accepted relative path in bytes. */
export const MAX_PATH_BYTES = 4096;
/** Longest accepted single name in bytes. */
export const MAX_NAME_BYTES = 255;
/** Longest accepted batch. */
export const MAX_BATCH = 2000;

const CONTROL = /[\u0000-\u001f\u007f]/;
const WINDOWS_RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

/**
 * Validate a relative path received from the browser.
 * @param {unknown} value - candidate.
 * @param {{allowRoot?: boolean, label?: string}} [options] - `''` is the root when allowed.
 * @returns {string} the same path, validated.
 */
export function assertRelativePath(value, options = {}) {
  const { allowRoot = true, label = 'path' } = options;
  if (typeof value !== 'string') fail(ERROR_CODES.invalidPath, `The ${label} must be a string.`);
  if (value.includes('\u0000') || CONTROL.test(value)) {
    fail(ERROR_CODES.invalidPath, `The ${label} contains a control character.`);
  }
  if (value.includes('\\')) fail(ERROR_CODES.invalidPath, `The ${label} must use "/" separators.`);
  if (path.posix.isAbsolute(value)) fail(ERROR_CODES.invalidPath, `The ${label} must be relative.`);
  if (value === '') {
    if (allowRoot) return '';
    fail(ERROR_CODES.invalidPath, `The ${label} must not be the workspace root.`);
  }
  if (Buffer.byteLength(value, 'utf8') > MAX_PATH_BYTES) fail(ERROR_CODES.invalidPath, `The ${label} is too long.`);
  for (const segment of value.split('/')) {
    if (segment === '' || segment === '.' || segment === '..') {
      fail(ERROR_CODES.invalidPath, `The ${label} contains an invalid segment.`);
    }
    if (Buffer.byteLength(segment, 'utf8') > MAX_NAME_BYTES) fail(ERROR_CODES.invalidName, 'A name is too long.');
  }
  return value;
}

/**
 * Validate one new file or folder name.
 * @param {unknown} value - candidate.
 * @returns {string} the same name, validated.
 */
export function assertName(value) {
  if (typeof value !== 'string') fail(ERROR_CODES.invalidName, 'The name must be a string.');
  if (value === '') fail(ERROR_CODES.invalidName, 'The name must not be empty.');
  if (Buffer.byteLength(value, 'utf8') > MAX_NAME_BYTES) fail(ERROR_CODES.invalidName, 'The name is too long.');
  if (value === '.' || value === '..') fail(ERROR_CODES.invalidName, 'That name is reserved.');
  if (value.includes('/') || value.includes('\\')) fail(ERROR_CODES.invalidName, 'The name must not contain a separator.');
  if (value.includes('\u0000') || CONTROL.test(value)) fail(ERROR_CODES.invalidName, 'The name contains a control character.');
  if (value.endsWith(' ') || value.endsWith('.')) fail(ERROR_CODES.invalidName, 'The name must not end with a space or dot.');
  if (WINDOWS_RESERVED.test(value)) fail(ERROR_CODES.invalidName, 'That name is reserved by the operating system.');
  return value;
}

/**
 * Resolve a validated relative path under a (real) root.
 * @param {string} root - real absolute workspace root.
 * @param {string} rel - validated relative path; `''` is the root.
 * @returns {string} absolute path.
 */
export function resolveInside(root, rel) {
  const absolute = path.resolve(root, rel);
  if (!isContained(root, absolute)) fail(ERROR_CODES.invalidPath, 'The path leaves the workspace.');
  return absolute;
}

/**
 * Whether an absolute path is the root or sits below it.
 * @param {string} root - real absolute root.
 * @param {string} candidate - absolute path.
 * @returns {boolean}
 */
export function isContained(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

/**
 * Convert an absolute path inside the root to wire shape.
 * @param {string} root - real absolute root.
 * @param {string} absolute - candidate.
 * @returns {string} POSIX-shaped relative path.
 */
export function relativeToRoot(root, absolute) {
  if (!isContained(root, absolute)) fail(ERROR_CODES.invalidPath, 'The path leaves the workspace.');
  const relative = path.relative(root, absolute);
  return relative === '' ? '' : relative.split(path.sep).join('/');
}

/**
 * Parent of a wire path; root's parent stays root.
 * @param {string} rel - validated relative path.
 * @returns {string}
 */
export function parentOf(rel) {
  const index = rel.lastIndexOf('/');
  return index < 0 ? '' : rel.slice(0, index);
}

/**
 * Final segment of a wire path.
 * @param {string} rel - validated relative path.
 * @returns {string}
 */
export function baseName(rel) {
  const index = rel.lastIndexOf('/');
  return index < 0 ? rel : rel.slice(index + 1);
}

/**
 * Join a directory wire path and a validated name.
 * @param {string} dir - directory wire path, `''` for root.
 * @param {string} name - validated name.
 * @returns {string}
 */
export function joinWire(dir, name) {
  return dir === '' ? name : `${dir}/${name}`;
}

/**
 * Pick the first free `name`, `name (1)`, `name (2)`… candidate.
 * @param {string} name - validated base name.
 * @param {Set<string>} taken - names already present in the directory.
 * @returns {string}
 */
export function uniqueName(name, taken) {
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf('.');
  const hasExtension = dot > 0;
  const stem = hasExtension ? name.slice(0, dot) : name;
  const extension = hasExtension ? name.slice(dot) : '';
  for (let index = 1; index < 10_000; index += 1) {
    const candidate = `${stem} (${index})${extension}`;
    if (Buffer.byteLength(candidate, 'utf8') > MAX_NAME_BYTES) break;
    if (!taken.has(candidate)) return candidate;
  }
  // Extremely long names can exhaust the counter; fall back to a short suffix.
  for (;;) {
    const candidate = `${stem.slice(0, 120)}-${Math.random().toString(36).slice(2, 8)}${extension}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Reject moving or copying a folder into itself or one of its descendants.
 * @param {string} destination - absolute destination directory.
 * @param {string} source - absolute source item.
 */
export function assertNotInsideSource(destination, source) {
  if (destination === source || isContained(source, destination)) {
    fail(ERROR_CODES.invalidPath, 'A folder cannot be moved or copied into itself.');
  }
}
