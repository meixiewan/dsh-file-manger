/**
 * Exact Fetch routes for the workspace file manager.
 *
 * `op` is a small JSON request, `upload` streams raw bytes, and `download`
 * streams a file back. The browser never supplies a root: it names the
 * Session, and the Session's workspace root is resolved for each request.
 */
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

import { ERROR_CODES, FileManagerError, asFileManagerError, fail, wireError } from './errors.js';
import { MAX_INLINE_IMAGE_PIXELS, isSafeInlineImage, readImageDimensions } from './image.js';
import { contentTypeFor, contentDisposition, isInlineImage } from './mime.js';
import { FileOps } from './ops.js';
import { assertRelativePath } from './paths.js';
import { resolveSessionRoot } from './session-root.js';

/** Exact routes owned by this plugin. */
export const ROUTES = Object.freeze({
  op: '/api/dsh-file-manager/op',
  upload: '/api/dsh-file-manager/upload',
  download: '/api/dsh-file-manager/download',
});

const CUSTOM_HEADER = 'x-dsh-file-manager';
const CUSTOM_HEADER_VALUE = '1';
const MAX_OP_BYTES = 1024 * 1024;

/** JSON response with no-store. */
function jsonResponse(value, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders,
    },
  });
}

/** Wire error body. */
function errorBody(code, message) {
  return { ok: false, error: { code, message } };
}

/** Success body. */
function success(value) {
  return { ok: true, value };
}

/** Domain failure, normally HTTP 200 with `ok:false`. */
function failure(error, status = 200) {
  return jsonResponse({ ok: false, error: wireError(error) }, status);
}

/** Method guard. */
function allowOnly(request, method) {
  if (request.method === method) return null;
  return jsonResponse(errorBody(ERROR_CODES.badMethod, `Use ${method} for this route.`), 405, {
    allow: method,
  });
}

/** Custom-header guard, used on body-changing and body-reading JSON routes. */
function requireManagerHeader(request) {
  if (request.headers.get(CUSTOM_HEADER) === CUSTOM_HEADER_VALUE) return null;
  return jsonResponse(errorBody(ERROR_CODES.forbidden, 'The file manager request header is missing.'), 403);
}

/** Parse a content length, tolerating absence. */
function contentLength(request) {
  const header = request.headers.get('content-length');
  if (header === null || header === '') return undefined;
  const value = Number(header);
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

/** Read a bounded UTF-8 request body. */
async function readJson(request, maxBytes) {
  if (request.body === null) return {};
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        fail(ERROR_CODES.requestTooLarge, 'The request body is too large.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (total === 0) return {};
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(concat(chunks, total));
  } catch {
    fail(ERROR_CODES.invalidBody, 'The request body is not valid UTF-8.');
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail(ERROR_CODES.invalidBody, 'The request body is not valid JSON.');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    fail(ERROR_CODES.invalidBody, 'The request body must be a JSON object.');
  }
  return parsed;
}

/** Concatenate Uint8Array chunks. */
function concat(chunks, total) {
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

/** Build one FileOps around a resolved Session. */
async function openOps(deps, sessionId) {
  const resolved = await resolveSessionRoot(deps, sessionId);
  return new FileOps({ realRoot: resolved.realRoot, displayRoot: resolved.displayRoot, limits: deps.limits });
}

/**
 * Create the three route handlers.
 * @param {{sessions: object, workingDirectory: object, limits?: object, logger?: object}} deps - Host services.
 * @returns {{op: Function, upload: Function, download: Function}}
 */
export function createHandlers(deps) {
  const logError = (message, error) => {
    if (typeof deps.logger?.error === 'function') deps.logger.error(message, error);
    else console.error(message, error);
  };

  async function op(request) {
    const methodError = allowOnly(request, 'POST');
    if (methodError !== null) return methodError;
    const headerError = requireManagerHeader(request);
    if (headerError !== null) return headerError;
    const media = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
    if (media !== 'application/json') {
      return jsonResponse(errorBody(ERROR_CODES.unsupportedMediaType, 'Use application/json.'), 415);
    }
    const length = contentLength(request);
    if (length !== undefined && length > MAX_OP_BYTES) {
      return jsonResponse(errorBody(ERROR_CODES.requestTooLarge, 'The request body is too large.'), 413);
    }

    let payload;
    try {
      payload = await readJson(request, MAX_OP_BYTES);
      if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
        fail(ERROR_CODES.invalidBody, 'The request body must be a JSON object.');
      }
      const ops = await openOps(deps, payload.sessionId);
      const action = payload.action;
      if (typeof action !== 'string') fail(ERROR_CODES.invalidBody, 'The action is required.');
      switch (action) {
        case 'list':
          return jsonResponse(success(await ops.list(assertRelativePath(payload.path ?? ''), {
            query: payload.query,
            offset: payload.offset,
            limit: payload.limit,
            signal: request.signal,
          })));
        case 'mkdir':
          return jsonResponse(success(await ops.mkdir(assertRelativePath(payload.path ?? ''), payload.name, { signal: request.signal })));
        case 'rename':
          return jsonResponse(success(await ops.rename(assertRelativePath(payload.path, { allowRoot: false }), payload.name, { signal: request.signal })));
        case 'move':
          return jsonResponse(success(await ops.move(payload.paths, assertRelativePath(payload.dest ?? ''), {
            signal: request.signal,
          })));
        case 'copy':
          return jsonResponse(success(await ops.copy(payload.paths, assertRelativePath(payload.dest ?? ''), {
            signal: request.signal,
          })));
        case 'delete':
          return jsonResponse(success(await ops.delete(payload.paths, { signal: request.signal })));
        case 'read':
          return jsonResponse(success(await ops.read(assertRelativePath(payload.path, { allowRoot: false }))));
        case 'image-meta':
          return jsonResponse(success(await ops.imageInfo(assertRelativePath(payload.path, { allowRoot: false }))));
        default:
          fail(ERROR_CODES.unsupportedAction, `Unsupported action: ${action}`);
      }
    } catch (error) {
      const failureError = asFileManagerError(error);
      if (failureError.code === ERROR_CODES.internal) logError('dsh-file-manager: op failed', error);
      return failure(failureError);
    }
  }

  async function upload(request) {
    const methodError = allowOnly(request, 'POST');
    if (methodError !== null) return methodError;
    const headerError = requireManagerHeader(request);
    if (headerError !== null) return headerError;
    const media = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
    if (media !== 'application/octet-stream') {
      return jsonResponse(errorBody(ERROR_CODES.unsupportedMediaType, 'Use application/octet-stream.'), 415);
    }
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('sessionId');
    const name = url.searchParams.get('name');
    const dir = url.searchParams.get('dir') ?? '';
    const onConflict = url.searchParams.get('onConflict') ?? 'rename';
    if (name === null || name === '') return jsonResponse(errorBody(ERROR_CODES.invalidName, 'The name is required.'), 400);
    if (onConflict !== 'rename' && onConflict !== 'error') {
      return jsonResponse(errorBody(ERROR_CODES.invalidBody, 'onConflict must be "rename" or "error".'), 400);
    }
    const length = contentLength(request);
    const maxUploadBytes = deps.limits?.maxUploadBytes ?? 8 * 1024 * 1024 * 1024;
    if (length !== undefined && length > maxUploadBytes) {
      return jsonResponse(errorBody(ERROR_CODES.tooLarge, 'The upload is too large.'), 413);
    }
    if (sessionId === null || sessionId === '') {
      return jsonResponse(errorBody(ERROR_CODES.invalidSession, 'sessionId is required.'), 400);
    }

    try {
      const ops = await openOps(deps, sessionId);
      const value = await ops.upload(assertRelativePath(dir), name, request.body, {
        signal: request.signal,
        onConflict,
        expectedBytes: length,
      });
      return jsonResponse(success(value));
    } catch (error) {
      const failureError = asFileManagerError(error);
      if (failureError.code === ERROR_CODES.tooLarge) {
        return failure(failureError, 413);
      }
      if (failureError.code === ERROR_CODES.internal) logError('dsh-file-manager: upload failed', error);
      return failure(failureError);
    }
  }

  async function download(request) {
    const methodError = allowOnly(request, 'GET');
    if (methodError !== null) return methodError;
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('sessionId');
    const rel = url.searchParams.get('path');
    if (sessionId === null || sessionId === '') {
      return jsonResponse(errorBody(ERROR_CODES.invalidSession, 'sessionId is required.'), 400);
    }
    if (rel === null) return jsonResponse(errorBody(ERROR_CODES.invalidPath, 'path is required.'), 400);
    const inlineRequested = url.searchParams.get('inline') === '1';

    let descriptor;
    try {
      const ops = await openOps(deps, sessionId);
      descriptor = await ops.download(assertRelativePath(rel, { allowRoot: false }));
    } catch (error) {
      const failureError = asFileManagerError(error);
      if (failureError.code === ERROR_CODES.internal) logError('dsh-file-manager: download failed', error);
      return failure(failureError);
    }

    let inline = false;
    if (inlineRequested && isInlineImage(descriptor.name)) {
      const maxInlineBytes = deps.limits?.maxInlineImageBytes ?? 32 * 1024 * 1024;
      const maxPixels = deps.limits?.maxImagePixels ?? MAX_INLINE_IMAGE_PIXELS;
      const dimensions = descriptor.size <= maxInlineBytes
        ? await readImageDimensions(descriptor.absolute)
        : null;
      inline = isSafeInlineImage(dimensions) && dimensions.width * dimensions.height <= maxPixels;
    }
    const headers = {
      'content-type': contentTypeFor(descriptor.name),
      'content-length': String(descriptor.size),
      'content-disposition': contentDisposition(descriptor.name, inline),
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'accept-ranges': 'none',
    };
    if (inline) headers['content-security-policy'] = "default-src 'none'; sandbox";
    const stream = createReadStream(descriptor.absolute);
    stream.on('error', () => {});
    const onAbort = () => stream.destroy();
    request.signal.addEventListener('abort', onAbort, { once: true });
    stream.once('close', () => request.signal.removeEventListener('abort', onAbort));
    return new Response(Readable.toWeb(stream), { status: 200, headers });
  }

  return { op, upload, download };
}

/**
 * Register the routes on one Cordis Host context.
 * @param {object} ctx - Host plugin context.
 * @param {{sessions: object, workingDirectory: object, limits?: object, logger?: object}} deps - Host services.
 */
export function registerRoutes(ctx, deps) {
  const handlers = createHandlers(deps);
  ctx.effect(
    () => ctx.connection.fetch.register({
      path: ROUTES.op,
      methods: ['POST'],
      requestBody: 'streaming',
      fetch: handlers.op,
    }),
    'dsh-file-manager: op route',
  );
  ctx.effect(
    () => ctx.connection.fetch.register({
      path: ROUTES.upload,
      methods: ['POST'],
      requestBody: 'streaming',
      fetch: handlers.upload,
    }),
    'dsh-file-manager: upload route',
  );
  ctx.effect(
    () => ctx.connection.fetch.register({
      path: ROUTES.download,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: handlers.download,
    }),
    'dsh-file-manager: download route',
  );
}
