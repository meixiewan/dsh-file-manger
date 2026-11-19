/**
 * Stable error codes and wire encoding for the workspace file manager.
 *
 * The browser only ever sees a code plus a short, non-sensitive message. The
 * original filesystem error (with its path) stays in the Host log.
 */

/** Every failure the manager reports to the browser. */
export const ERROR_CODES = Object.freeze({
  badMethod: 'bad-method',
  unsupportedMediaType: 'unsupported-media-type',
  forbidden: 'forbidden',
  requestTooLarge: 'request-too-large',
  invalidSession: 'invalid-session',
  sessionNotFound: 'session-not-found',
  noWorkspace: 'no-workspace',
  rootUnavailable: 'root-unavailable',
  invalidPath: 'invalid-path',
  invalidName: 'invalid-name',
  invalidBody: 'invalid-body',
  unsupportedAction: 'unsupported-action',
  notFound: 'not-found',
  exists: 'exists',
  notDirectory: 'not-directory',
  isDirectory: 'is-directory',
  permissionDenied: 'permission-denied',
  tooLarge: 'too-large',
  noSpace: 'no-space',
  crossDevice: 'cross-device',
  notText: 'not-text',
  unsupported: 'unsupported',
  aborted: 'aborted',
  busy: 'busy',
  internal: 'internal',
});

/** One domain failure with a stable code and optional structured details. */
export class FileManagerError extends Error {
  /**
   * @param {string} code - one of {@link ERROR_CODES}.
   * @param {string} message - short diagnostic safe to show to the owner.
   * @param {unknown} [details] - optional JSON-shaped context.
   */
  constructor(code, message, details) {
    super(message);
    this.name = 'FileManagerError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Throw a domain failure.
 * @param {string} code - stable code.
 * @param {string} [message] - short message; defaults to the code.
 * @param {unknown} [details] - optional JSON-shaped context.
 * @returns {never}
 */
export function fail(code, message = code, details) {
  throw new FileManagerError(code, message, details);
}

const ERRNO_CODES = new Map([
  ['ENOENT', ERROR_CODES.notFound],
  ['EEXIST', ERROR_CODES.exists],
  ['ENOTDIR', ERROR_CODES.notDirectory],
  ['EISDIR', ERROR_CODES.isDirectory],
  ['EACCES', ERROR_CODES.permissionDenied],
  ['EPERM', ERROR_CODES.permissionDenied],
  ['EROFS', ERROR_CODES.permissionDenied],
  ['ENOSPC', ERROR_CODES.noSpace],
  ['EXDEV', ERROR_CODES.crossDevice],
  ['ENAMETOOLONG', ERROR_CODES.invalidName],
  ['ELOOP', ERROR_CODES.invalidPath],
  ['EFBIG', ERROR_CODES.tooLarge],
  ['EMFILE', ERROR_CODES.internal],
  ['ENFILE', ERROR_CODES.internal],
]);

const ERRNO_MESSAGES = {
  [ERROR_CODES.notFound]: 'The file or folder no longer exists.',
  [ERROR_CODES.exists]: 'An item with that name already exists.',
  [ERROR_CODES.notDirectory]: 'That path is not a folder.',
  [ERROR_CODES.isDirectory]: 'That path is a folder.',
  [ERROR_CODES.permissionDenied]: 'The operating system denied this operation.',
  [ERROR_CODES.noSpace]: 'There is not enough free space.',
  [ERROR_CODES.crossDevice]: 'The operation crosses two filesystems.',
  [ERROR_CODES.invalidName]: 'The name is not valid.',
  [ERROR_CODES.invalidPath]: 'The path is not valid.',
  [ERROR_CODES.tooLarge]: 'The file is too large.',
  [ERROR_CODES.busy]: 'Another file operation is still running in this workspace.',
  [ERROR_CODES.internal]: 'The operation failed.',
};

/**
 * Translate a raw Node filesystem error into a domain failure, preserving an
 * already-domain error untouched.
 * @param {unknown} error - thrown value.
 * @param {string} [fallback] - code to use when errno is unknown.
 * @returns {FileManagerError}
 */
export function asFileManagerError(error, fallback = ERROR_CODES.internal) {
  if (error instanceof FileManagerError) return error;
  const errno = typeof error === 'object' && error !== null && typeof error.code === 'string' ? error.code : '';
  const code = ERRNO_CODES.get(errno) ?? fallback;
  return new FileManagerError(code, ERRNO_MESSAGES[code] ?? 'The operation failed.', {
    errno: errno === '' ? undefined : errno,
  });
}

/**
 * Encode a thrown value as the wire error object.
 * @param {unknown} error - thrown value.
 * @returns {{code: string, message: string, details?: unknown}}
 */
export function wireError(error) {
  const failure = asFileManagerError(error);
  const wire = { code: failure.code, message: failure.message };
  if (failure.details !== undefined) wire.details = failure.details;
  return wire;
}
