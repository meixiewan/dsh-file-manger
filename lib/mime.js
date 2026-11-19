/**
 * Conservative content types and download headers.
 *
 * Only a fixed extension table is used, so a crafted file name cannot inject a
 * header or choose an arbitrary media type. SVG and HTML are always downloads.
 */
import path from 'node:path';

const TYPES = new Map(Object.entries({
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.css': 'text/css; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.log': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ts': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.xml': 'application/xml; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
  '.zip': 'application/zip',
}));

/** Extensions that may be shown inline, after an additional CSP + nosniff. */
const INLINE_IMAGES = new Set(['.bmp', '.gif', '.jpeg', '.jpg', '.png', '.webp']);

/**
 * Content type for a name; unknown extensions are octet-stream.
 * @param {string} name - file name.
 * @returns {string}
 */
export function contentTypeFor(name) {
  return TYPES.get(path.extname(name).toLowerCase()) ?? 'application/octet-stream';
}

/**
 * Whether an image may be rendered inline in the sidebar preview.
 * @param {string} name - file name.
 * @returns {boolean}
 */
export function isInlineImage(name) {
  return INLINE_IMAGES.has(path.extname(name).toLowerCase());
}

/** RFC 5987 percent encoding. */
function encodeRfc5987(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * Build a safe `Content-Disposition` value.
 * @param {string} name - file name.
 * @param {boolean} inline - whether the browser may render it inline.
 * @returns {string}
 */
export function contentDisposition(name, inline) {
  const fallback = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_').slice(0, 120) || 'download';
  const encoded = encodeRfc5987(name);
  return `${inline ? 'inline' : 'attachment'}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
