/**
 * Minimal, dependency-free raster image header parser.
 *
 * Inline previews must not hand an arbitrary image to the browser decoder: a
 * small compressed file can expand into a multi-gigabyte bitmap. Only the
 * formats listed by `mime.isInlineImage` are parsed here, and anything we do
 * not understand, or whose dimensions exceed the pixel budget, stays a normal
 * attachment download.
 */
import { open } from 'node:fs/promises';

/** Largest bitmap accepted for an inline preview (40 megapixels). */
export const MAX_INLINE_IMAGE_PIXELS = 40_000_000;

/** Only the beginning of a file is needed for all supported headers. */
const HEADER_BYTES = 1024 * 1024;

/**
 * Parse dimensions from a supported image header.
 * @param {Buffer} buffer - beginning of the file.
 * @returns {{width: number, height: number} | null} dimensions, or null when unknown.
 */
export function parseImageDimensions(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 10) return null;

  // PNG: 8-byte signature, then an IHDR chunk with big-endian dimensions.
  if (buffer.length >= 24
    && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
    && buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
    && buffer.toString('ascii', 12, 16) === 'IHDR') {
    return validDimensions(buffer.readUInt32BE(16), buffer.readUInt32BE(20));
  }

  // GIF: logical screen width/height are little-endian.
  const signature = buffer.toString('ascii', 0, 6);
  if ((signature === 'GIF87a' || signature === 'GIF89a') && buffer.length >= 10) {
    return validDimensions(buffer.readUInt16LE(6), buffer.readUInt16LE(8));
  }

  // BMP: DIB header starts at byte 14. Width and height are signed int32;
  // a negative height means a top-down bitmap.
  if (buffer.length >= 26 && buffer.toString('ascii', 0, 2) === 'BM') {
    const width = buffer.readInt32LE(18);
    const height = Math.abs(buffer.readInt32LE(22));
    return validDimensions(width, height);
  }

  // JPEG: walk marker segments until a start-of-frame marker.
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    const dimensions = parseJpegDimensions(buffer);
    if (dimensions) return dimensions;
  }

  // WebP: RIFF container. VP8X, VP8 (lossy), and VP8L are all supported.
  if (buffer.length >= 30
    && buffer.toString('ascii', 0, 4) === 'RIFF'
    && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return parseWebpDimensions(buffer);
  }

  return null;
}

/** Validate a parsed pair; reject zero, negative, and absurd values. */
function validDimensions(width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) return null;
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

/** JPEG SOF marker parser. */
function parseJpegDimensions(buffer) {
  const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    let marker = buffer[offset + 1];
    offset += 2;
    while (marker === 0xff && offset < buffer.length) {
      marker = buffer[offset];
      offset += 1;
    }
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue;
    if (offset + 2 > buffer.length) return null;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) return null;
    if (sof.has(marker)) {
      if (offset + 7 > buffer.length) return null;
      return validDimensions(buffer.readUInt16BE(offset + 5), buffer.readUInt16BE(offset + 3));
    }
    // Entropy-coded scan data may follow a SOS marker; dimensions must have
    // appeared before it or they are not safely known from this header.
    if (marker === 0xda) return null;
    offset += length;
  }
  return null;
}

/** WebP chunk parser. */
function parseWebpDimensions(buffer) {
  const chunk = buffer.toString('ascii', 12, 16);
  const data = 20;
  if (chunk === 'VP8X' && buffer.length >= data + 10) {
    const width = 1 + buffer.readUIntLE(data + 4, 3);
    const height = 1 + buffer.readUIntLE(data + 7, 3);
    return validDimensions(width, height);
  }
  if (chunk === 'VP8 ' && buffer.length >= data + 10) {
    if (buffer[data + 3] !== 0x9d || buffer[data + 4] !== 0x01 || buffer[data + 5] !== 0x2a) return null;
    return validDimensions(buffer.readUInt16LE(data + 6) & 0x3fff, buffer.readUInt16LE(data + 8) & 0x3fff);
  }
  if (chunk === 'VP8L' && buffer.length >= data + 5) {
    if (buffer[data] !== 0x2f) return null;
    const bits = buffer.readUInt32LE(data + 1);
    return validDimensions(1 + (bits & 0x3fff), 1 + ((bits >>> 14) & 0x3fff));
  }
  return null;
}

/**
 * Read only enough of a file to parse its image header.
 * @param {string} absolute - regular file path.
 * @returns {Promise<{width: number, height: number} | null>}
 */
export async function readImageDimensions(absolute) {
  let handle;
  try {
    handle = await open(absolute, 'r');
    const buffer = Buffer.alloc(HEADER_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return parseImageDimensions(buffer.subarray(0, bytesRead));
  } catch {
    return null;
  } finally {
    await handle?.close().catch(() => {});
  }
}

/**
 * Whether dimensions fit both the hard pixel budget and safe integer math.
 * @param {{width: number, height: number} | null} dimensions - parsed dimensions.
 * @returns {boolean}
 */
export function isSafeInlineImage(dimensions) {
  return Boolean(dimensions)
    && dimensions.width * dimensions.height > 0
    && dimensions.width * dimensions.height <= MAX_INLINE_IMAGE_PIXELS;
}
