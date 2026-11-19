import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { ERROR_CODES } from '../lib/errors.js';
import { createHandlers, registerRoutes } from '../lib/routes.js';
import { resolveSessionRoot } from '../lib/session-root.js';

async function setup(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-fm-routes-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const deps = {
    sessions: { get: (id) => (id === 's1' ? { id: 's1', header: { cwd: root } } : undefined) },
    workingDirectory: { get: () => root },
    limits: { maxUploadBytes: 1024, maxEntries: 50, maxBatch: 10, maxTextBytes: 1024 },
  };
  return { root, deps, handlers: createHandlers(deps) };
}

function opRequest(body, headers = {}) {
  return new Request('http://localhost/api/dsh-file-manager/op', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dsh-file-manager': '1', ...headers },
    body: JSON.stringify(body),
  });
}

test('op lists a workspace and rejects missing guards', async (t) => {
  const { root, handlers } = await setup(t);
  await writeFile(path.join(root, 'a.txt'), 'hello');

  const listed = await handlers.op(opRequest({ sessionId: 's1', action: 'list', path: '' }));
  assert.equal(listed.status, 200);
  const payload = await listed.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.value.entries[0].name, 'a.txt');

  const forbidden = await handlers.op(opRequest({ sessionId: 's1', action: 'list' }, { 'x-dsh-file-manager': '' }));
  assert.equal(forbidden.status, 403);

  const wrongMethod = await handlers.op(new Request('http://localhost/api/dsh-file-manager/op', { method: 'GET' }));
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get('allow'), 'POST');

  const wrongMedia = await handlers.op(opRequest({ sessionId: 's1' }, { 'content-type': 'text/plain' }));
  assert.equal(wrongMedia.status, 415);

  const missing = await handlers.op(opRequest({ sessionId: 'nope', action: 'list' }));
  assert.equal(missing.status, 200);
  assert.equal((await missing.json()).error.code, ERROR_CODES.sessionNotFound);

  const traversal = await handlers.op(opRequest({ sessionId: 's1', action: 'list', path: '../etc' }));
  assert.equal(traversal.status, 200);
  assert.equal((await traversal.json()).error.code, ERROR_CODES.invalidPath);
});

test('upload writes a streamed file and download returns it', async (t) => {
  const { root, handlers } = await setup(t);
  const upload = new Request(
    'http://localhost/api/dsh-file-manager/upload?sessionId=s1&name=note.txt',
    {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream', 'x-dsh-file-manager': '1' },
      body: Buffer.from('streamed'),
    },
  );
  const uploaded = await handlers.upload(upload);
  assert.equal(uploaded.status, 200);
  const uploadedBody = await uploaded.json();
  assert.equal(uploadedBody.ok, true);
  assert.equal(uploadedBody.value.name, 'note.txt');
  assert.equal(await readFile(path.join(root, 'note.txt'), 'utf8'), 'streamed');

  const download = await handlers.download(
    new Request('http://localhost/api/dsh-file-manager/download?sessionId=s1&path=note.txt'),
  );
  assert.equal(download.status, 200);
  assert.equal(await download.text(), 'streamed');
  assert.match(download.headers.get('content-disposition'), /^attachment;/);
  assert.equal(download.headers.get('x-content-type-options'), 'nosniff');
});

test('upload enforces its size limit before reading', async (t) => {
  const { handlers } = await setup(t);
  const upload = new Request(
    'http://localhost/api/dsh-file-manager/upload?sessionId=s1&name=big.bin',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/octet-stream',
        'x-dsh-file-manager': '1',
        'content-length': '2000',
      },
      body: Buffer.alloc(2000),
    },
  );
  const response = await handlers.upload(upload);
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error.code, ERROR_CODES.tooLarge);
});

function tinyPng(width = 1, height = 1) {
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

test('inline preview is limited to raster images', async (t) => {
  const { root, handlers } = await setup(t);
  await writeFile(path.join(root, 'pic.png'), tinyPng());
  await writeFile(path.join(root, 'draw.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>');

  const png = await handlers.download(
    new Request('http://localhost/api/dsh-file-manager/download?sessionId=s1&path=pic.png&inline=1'),
  );
  assert.equal(png.status, 200);
  assert.match(png.headers.get('content-disposition'), /^inline;/);
  assert.equal(png.headers.get('content-type'), 'image/png');
  assert.match(png.headers.get('content-security-policy'), /default-src 'none'/);

  const svg = await handlers.download(
    new Request('http://localhost/api/dsh-file-manager/download?sessionId=s1&path=draw.svg&inline=1'),
  );
  assert.match(svg.headers.get('content-disposition'), /^attachment;/);
});

test('session root resolution reports missing session, no workspace, and missing directory', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-fm-session-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sessions = { get: (id) => (id === 's1' ? { id: 's1' } : undefined) };
  const missing = await resolveSessionRoot({ sessions, workingDirectory: { get: () => root } }, 'nope').then(
    () => null,
    (error) => error,
  );
  assert.equal(missing.code, ERROR_CODES.sessionNotFound);

  const noWorkspace = await resolveSessionRoot(
    { sessions, workingDirectory: { get: () => undefined } },
    's1',
  ).then(() => null, (error) => error);
  assert.equal(noWorkspace.code, ERROR_CODES.noWorkspace);

  const deleted = path.join(root, 'gone');
  await mkdir(deleted);
  await rm(deleted, { recursive: true });
  const unavailable = await resolveSessionRoot(
    { sessions, workingDirectory: { get: () => deleted } },
    's1',
  ).then(() => null, (error) => error);
  assert.equal(unavailable.code, ERROR_CODES.rootUnavailable);

  const resolved = await resolveSessionRoot({ sessions, workingDirectory: { get: () => root } }, 's1');
  assert.equal(resolved.realRoot, await realpath(root));
});

test('the root is the session header project, not a changed working directory', async (t) => {
  const repo = await realpath(await mkdtemp(path.join(os.tmpdir(), 'dsh-fm-workspace-')));
  t.after(() => rm(repo, { recursive: true, force: true }));
  const worktree = path.join(repo, '.agents', 'worktrees', 'release-market-bulk');
  await mkdir(worktree, { recursive: true });
  await writeFile(path.join(repo, 'main.txt'), 'main');
  await writeFile(path.join(worktree, 'branch.txt'), 'branch');

  const deps = {
    sessions: { get: (id) => (id === 's1' ? { id: 's1', header: { cwd: repo } } : undefined) },
    workingDirectory: { get: () => worktree },
    limits: { maxUploadBytes: 1024, maxEntries: 50, maxBatch: 10, maxTextBytes: 1024 },
  };

  const resolved = await resolveSessionRoot(deps, 's1');
  assert.equal(resolved.realRoot, repo);
  assert.equal(resolved.displayRoot, repo);

  const listed = await createHandlers(deps).op(opRequest({ sessionId: 's1', action: 'list', path: '' }));
  const payload = await listed.json();
  assert.equal(payload.value.root, repo);
  assert.deepEqual(
    payload.value.entries.map((entry) => entry.name).sort(),
    ['.agents', 'main.txt'],
  );
});

test('a session without a recorded project falls back to its working directory', async (t) => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'dsh-fm-fallback-')));
  t.after(() => rm(root, { recursive: true, force: true }));

  const resolved = await resolveSessionRoot(
    { sessions: { get: () => ({ id: 's1' }) }, workingDirectory: { get: () => root } },
    's1',
  );
  assert.equal(resolved.realRoot, root);
});


test('op exposes page/search fields and image metadata', async (t) => {
  const { root, handlers } = await setup(t);
  for (let index = 0; index < 5; index += 1) await writeFile(path.join(root, `item-${index}.txt`), 'x');
  await writeFile(path.join(root, 'photo.png'), tinyPng(12, 8));

  const page = await handlers.op(opRequest({
    sessionId: 's1',
    action: 'list',
    path: '',
    query: 'item-',
    offset: 1,
    limit: 2,
  }));
  const pageBody = await page.json();
  assert.equal(pageBody.ok, true);
  assert.equal(pageBody.value.total, 5);
  assert.equal(pageBody.value.offset, 1);
  assert.equal(pageBody.value.hasMore, true);
  assert.equal(pageBody.value.entries.length, 2);

  const meta = await handlers.op(opRequest({ sessionId: 's1', action: 'image-meta', path: 'photo.png' }));
  const metaBody = await meta.json();
  assert.equal(metaBody.ok, true);
  assert.equal(metaBody.value.previewable, true);
  assert.equal(metaBody.value.width, 12);
  assert.equal(metaBody.value.height, 8);
});

test('oversized image dimensions stay a download instead of an inline preview', async (t) => {
  const { root, handlers } = await setup(t);
  await writeFile(path.join(root, 'huge.png'), tinyPng(10000, 10000));

  const meta = await handlers.op(opRequest({ sessionId: 's1', action: 'image-meta', path: 'huge.png' }));
  const metaBody = await meta.json();
  assert.equal(metaBody.value.previewable, false);
  assert.equal(metaBody.value.reason, 'too-large');

  const download = await handlers.download(
    new Request('http://localhost/api/dsh-file-manager/download?sessionId=s1&path=huge.png&inline=1'),
  );
  assert.equal(download.status, 200);
  assert.match(download.headers.get('content-disposition'), /^attachment;/);
});

test('op is registered in streaming mode; upload is streaming too', async (t) => {
  const { deps } = await setup(t);
  const registrations = [];
  registerRoutes({
    effect(fn) { fn(); },
    connection: {
      fetch: {
        register(options) {
          registrations.push(options);
          return () => {};
        },
      },
    },
  }, deps);
  const op = registrations.find((entry) => entry.path.endsWith('/op'));
  const upload = registrations.find((entry) => entry.path.endsWith('/upload'));
  assert.equal(op.requestBody, 'streaming');
  assert.equal(upload.requestBody, 'streaming');
});


test('op rejects JSON bodies that are not objects', async (t) => {
  const { handlers } = await setup(t);
  for (const body of ['null', '[]']) {
    const request = new Request('http://localhost/api/dsh-file-manager/op', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dsh-file-manager': '1' },
      body,
    });
    const response = await handlers.op(request);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).error.code, ERROR_CODES.invalidBody);
  }
});
