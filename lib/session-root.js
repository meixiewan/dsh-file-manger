/**
 * Resolve a live Session to the workspace root its file manager may touch.
 *
 * The root is the Session's workspace root: the immutable project directory
 * recorded in its header. That is the same boundary DSH itself uses for the
 * Session (the `workspace-write` sandbox root and the `workspaceFiles` API),
 * so a Session that changed its working directory — `cd`, or a worktree
 * created next to the checkout — keeps the project as its file-manager root;
 * only the effective working directory moves. Sessions without a recorded
 * project directory fall back to their effective working directory.
 *
 * The root is never supplied by the browser and never stored by this plugin:
 * the browser only names the Session, and every request re-resolves the root.
 */
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';

import { ERROR_CODES, fail } from './errors.js';

const SESSION_ID_MAX = 256;

/**
 * Validate the Session id sent by the browser.
 * @param {unknown} value - candidate.
 * @returns {string}
 */
export function assertSessionId(value) {
  if (typeof value !== 'string' || value === '' || value.length > SESSION_ID_MAX) {
    fail(ERROR_CODES.invalidSession, 'A valid sessionId is required.');
  }
  if (/[\u0000-\u001f\u007f]/.test(value)) fail(ERROR_CODES.invalidSession, 'The sessionId is not valid.');
  return value;
}

/**
 * Read the immutable project directory a Session was created in.
 * @param {unknown} session - live Session.
 * @returns {string | undefined} recorded workspace root, when the Session has one.
 */
function recordedRoot(session) {
  const cwd = session?.header?.cwd;
  return typeof cwd === 'string' && cwd !== '' && path.isAbsolute(cwd) ? cwd : undefined;
}

/**
 * Read the Session's effective working directory, used only as a fallback.
 * @param {{workingDirectory?: {get(session: unknown): unknown}}} deps - Host services.
 * @param {unknown} session - live Session.
 * @returns {unknown}
 */
async function effectiveDirectory(deps, session) {
  if (typeof deps?.workingDirectory?.get !== 'function') {
    fail(ERROR_CODES.internal, 'The workspace services are unavailable.');
  }
  return deps.workingDirectory.get(session);
}

/**
 * Resolve the live Session and its real workspace root.
 * @param {{sessions: {get(id: string): unknown}, workingDirectory?: {get(session: unknown): unknown}}} deps - Host services.
 * @param {unknown} rawSessionId - Session id from the request.
 * @returns {Promise<{sessionId: string, session: unknown, displayRoot: string, realRoot: string}>}
 */
export async function resolveSessionRoot(deps, rawSessionId) {
  const sessionId = assertSessionId(rawSessionId);
  if (typeof deps?.sessions?.get !== 'function') {
    fail(ERROR_CODES.internal, 'The workspace services are unavailable.');
  }

  const session = await deps.sessions.get(sessionId);
  if (session === undefined || session === null) fail(ERROR_CODES.sessionNotFound, 'That session is no longer open.');

  const display = recordedRoot(session) ?? await effectiveDirectory(deps, session);
  if (typeof display !== 'string' || display === '' || !path.isAbsolute(display)) {
    fail(ERROR_CODES.noWorkspace, 'This session has no workspace directory.');
  }

  let realRoot;
  try {
    realRoot = await realpath(display);
  } catch (error) {
    if (error?.code === 'EACCES' || error?.code === 'EPERM') {
      fail(ERROR_CODES.permissionDenied, 'The workspace directory cannot be reached.');
    }
    fail(ERROR_CODES.rootUnavailable, 'The workspace directory is missing or unreadable.');
  }

  let info;
  try {
    info = await stat(realRoot);
  } catch {
    fail(ERROR_CODES.rootUnavailable, 'The workspace directory is missing or unreadable.');
  }
  if (!info.isDirectory()) fail(ERROR_CODES.rootUnavailable, 'The workspace path is not a directory.');

  return { sessionId, session, displayRoot: path.resolve(display), realRoot };
}
