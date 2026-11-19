import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  MAX_INLINE_IMAGE_PIXELS,
  isSafeInlineImage,
  parseImageDimensions,
  readImageDimensions,
} from '../lib/image.js';

function png(width = 1, height = 1) {
  const buffer = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  buffer[24] = 8;
  buffer[25] = 6;
  return buffer;
}

test('parses supported image headers', () => {
  assert.deepEqual(parseImageDimensions(png(640, 480)), { width: 640, height: 480 });

  const gif = Buffer.alloc(10);
  gif.write('GIF89a', 0, 'ascii');
  gif.writeUInt16LE(320, 6);
  gif.writeUInt16LE(200, 8);
  assert.deepEqual(parseImageDimensions(gif), { width: 320, height: 200 });

  const bmp = Buffer.alloc(26);
  bmp.write('BM', 0, 'ascii');
  bmp.writeInt32LE(800, 18);
  bmp.writeInt32LE(-600, 22);
  assert.deepEqual(parseImageDimensions(bmp), { width: 800, height: 600 });

  const jpeg = Buffer.from([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x05, 0x00, 0x06,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
  ]);
  assert.deepEqual(parseImageDimensions(jpeg), { width: 6, height: 5 });

  const webp = Buffer.alloc(30);
  webp.write('RIFF', 0, 'ascii');
  webp.write('WEBP', 8, 'ascii');
  webp.write('VP8X', 12, 'ascii');
  webp.writeUIntLE(1023, 24, 3); // width - 1
  webp.writeUIntLE(767, 27, 3); // height - 1
  assert.deepEqual(parseImageDimensions(webp), { width: 1024, height: 768 });
});

test('unknown, malformed, and unsafe dimensions are not previewable', () => {
  assert.equal(parseImageDimensions(Buffer.from('not an image')), null);
  assert.equal(parseImageDimensions(png(0, 10)), null);
  assert.equal(isSafeInlineImage(null), false);
  assert.equal(isSafeInlineImage({ width: 1, height: 1 }), true);
  assert.equal(isSafeInlineImage({ width: 100_000, height: 100_000 }), false);
  assert.equal(MAX_INLINE_IMAGE_PIXELS, 40_000_000);
});

test('reads only the header from a real file', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-fm-image-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'image.png'), png(12, 34));
  assert.deepEqual(await readImageDimensions(path.join(root, 'image.png')), { width: 12, height: 34 });
  assert.equal(await readImageDimensions(path.join(root, 'missing.png')), null);
});
