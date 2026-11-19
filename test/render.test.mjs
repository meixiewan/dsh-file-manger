/**
 * Render smoke tests for the client half.
 *
 * These use the real React renderer, so they catch the mistakes a plain module
 * load cannot: missing hook imports, invalid element trees, and broken state
 * transitions in the manager UI. React is a development dependency; if it is
 * not installed, the suite reports one skipped test instead of failing.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

import test from 'node:test';

let React;
let TestRenderer;
let act;
try {
  React = (await import('react')).default;
  ({ default: TestRenderer, act } = await import('react-test-renderer'));
} catch {
  React = undefined;
}

const CLIENT_PATH = new URL('../client.js', import.meta.url);
const CLIENT_CODE = await readFile(CLIENT_PATH, 'utf8');

/** Build the fake browser and Cordis services around one client module. */
function createHarness(api) {
  const dictionaries = new Map();
  const registrations = [];
  const styles = [];

  const document = {
    activeElement: null,
    getElementById: (id) => styles.find((style) => style.id === id) ?? null,
    createElement: () => ({
      id: '',
      textContent: '',
      isConnected: true,
      remove() { this.isConnected = false; },
    }),
    head: { appendChild: (node) => styles.push(node) },
    addEventListener() {},
    removeEventListener() {},
  };
  class HTMLElement {}
  class Element extends HTMLElement {
    closest() { return null; }
  }

  const translate = (ns, key, params) => {
    const table = dictionaries.get(ns)?.zh ?? {};
    let template = table[key] ?? key;
    if (params) template = template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
    return template;
  };

  const ctx = {
    locale: {
      bind: (ns) => (key, params) => translate(ns, key, params),
      register(ns, dicts) {
        dictionaries.set(ns, dicts);
        return () => dictionaries.delete(ns);
      },
    },
    effect(fn) { fn(); },
    sidebarRightTabs: { register: () => () => {} },
    slots: {
      inject(name, register) {
        registrations.push({ name, registration: register() });
        return () => {};
      },
      register(options, component) {
        return { options, component };
      },
    },
    sidebarRight: { openTab() {} },
  };

  class FakeXHR {
    constructor() {
      this.upload = {};
      this.status = 0;
      this.responseText = '';
    }
    open(method, url) {
      this.method = method;
      this.url = url;
    }
    setRequestHeader() {}
    send(file) {
      api.uploadCount += 1;
      setTimeout(() => {
        this.upload.onprogress?.({ lengthComputable: true, total: file.size, loaded: file.size });
        this.status = 200;
        this.responseText = JSON.stringify({
          ok: true,
          value: { path: `docs/${file.name}`, name: file.name, size: file.size },
        });
        this.onload?.();
      }, 0);
    }
    abort() { this.onabort?.(); }
  }

  let captured;
  const window = { __ModuleLoader__: { load(entry) { captured = entry; } } };
  const context = vm.createContext({
    window,
    document,
    HTMLElement,
    Element,
    console,
    Intl,
    URLSearchParams,
    AbortController,
    setTimeout,
    clearTimeout,
    fetch: api.fetch,
    Response,
    XMLHttpRequest: FakeXHR,
  });
  new vm.Script(CLIENT_CODE, { filename: 'client.js' }).runInContext(context);
  const exports = captured.factory((id) => {
    if (id === 'react') return React;
    throw new Error(`unexpected module request: ${id}`);
  });
  exports.apply(ctx);

  const body = registrations.find((entry) => entry.name === 'sidebar.right.pane.tab').registration;
  return { Body: body.component, t: ctx.locale.bind('fileManager'), styles };
}

/** The Host API shape the UI consumes, with deterministic in-memory answers. */
function createApi() {
  const api = {
    calls: [],
    uploadCount: 0,
    failList: false,
    entries: [
      { name: 'docs', path: 'docs', kind: 'directory', size: 0, mtimeMs: 1700000000000 },
      { name: 'note.txt', path: 'note.txt', kind: 'file', size: 12, mtimeMs: 1700000000000 },
    ],
    imageMeta: { previewable: true, width: 1, height: 1, pixels: 1 },
  };
  const ok = (value) => new Response(JSON.stringify({ ok: true, value }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
  api.fetch = async (_url, options) => {
    const payload = JSON.parse(options.body);
    api.calls.push(payload);
    if (payload.action === 'list') {
      if (api.failList) {
        api.failList = false;
        return new Response(JSON.stringify({
          ok: false,
          error: { code: 'permission-denied', message: 'denied' },
        }), { status: 200 });
      }
      const query = String(payload.query ?? '').toLowerCase();
      const matching = query
        ? api.entries.filter((entry) => entry.name.toLowerCase().includes(query))
        : api.entries;
      const offset = Number.isSafeInteger(payload.offset) ? payload.offset : 0;
      const size = Number.isSafeInteger(api.pageSize) ? api.pageSize : (payload.limit ?? matching.length);
      const page = matching.slice(offset, offset + size);
      return ok({
        root: '/workspace',
        path: payload.path ?? '',
        parent: '',
        entries: page,
        offset,
        limit: size,
        total: matching.length,
        nextOffset: offset + page.length,
        hasMore: offset + page.length < matching.length,
        truncated: offset + page.length < matching.length,
        scanTruncated: false,
        scanLimit: 50000,
        skipped: 0,
      });
    }
    if (payload.action === 'read') return ok({ text: 'hello preview', truncated: false });
    if (payload.action === 'image-meta') return ok({ path: payload.path, ...api.imageMeta });
    if (payload.action === 'mkdir') return ok({ path: 'new-folder', name: 'new-folder' });
    if (payload.action === 'rename') return ok({ path: 'renamed.txt', name: 'renamed.txt', kind: 'file' });
    if (payload.action === 'delete') {
      return ok({ results: payload.paths.map((path) => ({ path, ok: true })), succeeded: payload.paths.length, failed: 0 });
    }
    if (payload.action === 'move' || payload.action === 'copy') {
      return ok({
        results: payload.paths.map((path) => ({ path, ok: true, to: `${payload.dest}/${path}` })),
        succeeded: payload.paths.length,
        failed: 0,
      });
    }
    throw new Error(`unexpected action: ${payload.action}`);
  };
  return api;
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function byClass(renderer, type, className) {
  return renderer.root.findAllByType(type).filter((node) => String(node.props.className ?? '').includes(className));
}

function buttonByText(renderer, text, className = '') {
  return renderer.root.findAllByType('button').find((node) => (
    String(node.props.className ?? '').includes(className)
    && node.children.some((child) => child === text)
  ));
}

async function mount(api, { cwd = '/workspace' } = {}) {
  const harness = createHarness(api);
  const sessionId = 'session-test';
  const useSessions = (selector) => selector({ byId: { [sessionId]: { cwd } } });
  const tab = { title: 'workspace files', actions: { bindCommands: () => () => {} } };
  const useTabInfo = () => ({ tab });
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(harness.Body, {
      sessionId,
      useSessions,
      useTabInfo,
      t: harness.t,
    }));
  });
  await settle();
  return { ...harness, renderer, sessionId };
}

if (!React) {
  test('client render smoke tests', { skip: 'React is not installed; run npm install' }, () => {});
} else {
  test('renders the workspace list, filters it, and tracks selection', async () => {
    const api = createApi();
    const { renderer, t, styles } = await mount(api);
    assert.equal(styles.length, 1);
    assert.equal(api.calls.filter((call) => call.action === 'list').length, 1);

    let text = JSON.stringify(renderer.toJSON());
    assert.match(text, /note\.txt/);
    assert.match(text, /docs/);
    assert.match(text, /\/workspace/);

    const search = byClass(renderer, 'input', 'dfm-searchInput')[0];
    assert.ok(search);
    await act(async () => { search.props.onChange({ target: { value: 'docs' } }); });
    text = JSON.stringify(renderer.toJSON());
    assert.match(text, /docs/);
    assert.doesNotMatch(text, /note\.txt/);

    await act(async () => { search.props.onChange({ target: { value: '' } }); });
    const checkboxes = renderer.root.findAllByType('input').filter((node) => node.props.type === 'checkbox');
    assert.ok(checkboxes.length >= 3);
    await act(async () => { checkboxes[2].props.onChange(); });
    text = JSON.stringify(renderer.toJSON());
    assert.match(text, new RegExp(t('selection.count', { count: 1 })));
    assert.ok(buttonByText(renderer, t('selection.rename')));

    await act(async () => { renderer.unmount(); });
  });

  test('creates a folder and renames a file through their modals', async () => {
    const api = createApi();
    const { renderer, t } = await mount(api);

    const newFolder = renderer.root.findAllByType('button')
      .find((node) => node.props['aria-label'] === t('header.newFolder'));
    assert.ok(newFolder);
    await act(async () => { newFolder.props.onClick(); });
    const folderInput = byClass(renderer, 'input', 'dfm-input')[0];
    assert.ok(folderInput);
    await act(async () => { folderInput.props.onChange({ target: { value: 'new-folder' } }); });
    await act(async () => { renderer.root.findAllByType('form')[0].props.onSubmit({ preventDefault() {} }); });
    await settle();
    assert.ok(api.calls.some((call) => call.action === 'mkdir' && call.name === 'new-folder'));
    assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /dfm-overlay/);

    const more = byClass(renderer, 'button', 'dfm-moreButton')[1];
    await act(async () => { more.props.onClick(); });
    const rename = buttonByText(renderer, t('row.rename'), 'dfm-inlineButton');
    assert.ok(rename);
    await act(async () => { rename.props.onClick(); });
    const input = byClass(renderer, 'input', 'dfm-input')[0];
    assert.ok(input);
    assert.equal(input.props.value, 'note.txt');
    await act(async () => { input.props.onChange({ target: { value: 'renamed.txt' } }); });
    await act(async () => { renderer.root.findAllByType('form')[0].props.onSubmit({ preventDefault() {} }); });
    await settle();
    assert.ok(api.calls.some((call) => call.action === 'rename' && call.name === 'renamed.txt'));

    await act(async () => { renderer.unmount(); });
  });

  test('copies, moves, and deletes through the row actions', async () => {
    const api = createApi();
    const { renderer, t } = await mount(api);

    await act(async () => { byClass(renderer, 'button', 'dfm-moreButton')[1].props.onClick(); });
    await act(async () => { buttonByText(renderer, t('row.copy'), 'dfm-inlineButton').props.onClick(); });
    await settle();
    const chooseCopy = renderer.root.findAllByType('button')
      .find((node) => String(node.props.className ?? '').includes('primary') && node.children.includes(t('picker.here')));
    assert.ok(chooseCopy);
    await act(async () => { chooseCopy.props.onClick(); });
    await settle();
    assert.ok(api.calls.some((call) => call.action === 'copy'));

    await act(async () => { byClass(renderer, 'button', 'dfm-moreButton')[1].props.onClick(); });
    await act(async () => { buttonByText(renderer, t('row.move'), 'dfm-inlineButton').props.onClick(); });
    await settle();
    const folder = byClass(renderer, 'button', 'dfm-dirRow').find((node) => !node.props.disabled);
    assert.ok(folder);
    await act(async () => { folder.props.onClick(); });
    await settle();
    const chooseMove = renderer.root.findAllByType('button')
      .find((node) => String(node.props.className ?? '').includes('primary') && node.children.includes(t('picker.here')));
    assert.ok(chooseMove);
    await act(async () => { chooseMove.props.onClick(); });
    await settle();
    assert.ok(api.calls.some((call) => call.action === 'move' && call.dest === 'docs'));

    await act(async () => { byClass(renderer, 'button', 'dfm-moreButton')[1].props.onClick(); });
    await act(async () => { buttonByText(renderer, t('row.delete'), 'dfm-inlineButton').props.onClick(); });
    const confirm = byClass(renderer, 'button', 'dangerSolid')[0];
    assert.ok(confirm);
    await act(async () => { confirm.props.onClick(); });
    await settle();
    assert.ok(api.calls.some((call) => call.action === 'delete'));

    await act(async () => { renderer.unmount(); });
  });

  test('previews a text file and offers the raw download', async () => {
    const api = createApi();
    const { renderer, t } = await mount(api);

    const fileName = renderer.root.findAllByType('button')
      .find((node) => String(node.props.className ?? '').includes('dfm-rowName') && node.props.title === 'note.txt');
    assert.ok(fileName);
    await act(async () => { fileName.props.onClick(); });
    await settle();

    const text = JSON.stringify(renderer.toJSON());
    assert.match(text, /hello preview/);
    assert.match(text, new RegExp(t('preview.title')));
    const download = renderer.root.findAllByType('a')
      .find((node) => String(node.props.className ?? '').includes('dfm-btn'));
    assert.ok(download);
    assert.match(download.props.href, /\/api\/dsh-file-manager\/download/);
    assert.match(download.props.href, /note\.txt/);

    const close = renderer.root.findAllByType('button')
      .find((node) => node.props['aria-label'] === t('common.close'));
    assert.ok(close);
    await act(async () => { close.props.onClick(); });
    await act(async () => { renderer.unmount(); });
  });

  test('uploads a file, then reports a list failure', async () => {
    const api = createApi();
    const { renderer, t } = await mount(api);

    const fileInput = renderer.root.findAllByType('input').find((node) => node.props.type === 'file');
    assert.ok(fileInput);
    await act(async () => {
      fileInput.props.onChange({ target: { files: [{ name: 'up.txt', size: 5 }], value: '' } });
    });
    await settle();
    assert.equal(api.uploadCount, 1);
    assert.match(JSON.stringify(renderer.toJSON()), /up\.txt/);

    api.failList = true;
    const refresh = renderer.root.findAllByType('button')
      .find((node) => node.props['aria-label'] === t('header.refresh'));
    assert.ok(refresh);
    await act(async () => { refresh.props.onClick(); });
    await settle();
    assert.match(JSON.stringify(renderer.toJSON()), new RegExp(t('error.permission-denied')));

    await act(async () => { renderer.unmount(); });
  });

  test('loads the next directory page without replacing earlier rows', async () => {
    const api = createApi();
    api.pageSize = 1;
    const { renderer, t } = await mount(api);
    let text = JSON.stringify(renderer.toJSON());
    assert.match(text, /docs/);
    assert.doesNotMatch(text, /note\.txt/);

    const more = buttonByText(renderer, t('list.loadMore'), 'dfm-inlineButton');
    assert.ok(more);
    await act(async () => { more.props.onClick(); });
    await settle();
    text = JSON.stringify(renderer.toJSON());
    assert.match(text, /docs/);
    assert.match(text, /note\.txt/);
    assert.ok(api.calls.some((call) => call.action === 'list' && call.offset === 1));
    await act(async () => { renderer.unmount(); });
  });

  test('sends the search term to the Host and shows matching rows', async () => {
    const api = createApi();
    const { renderer, t } = await mount(api);
    const search = renderer.root.findAllByType('input')
      .find((node) => node.props.className === 'dfm-searchInput');
    assert.ok(search);
    await act(async () => { search.props.onChange({ target: { value: 'note' } }); });
    await settle();
    assert.match(JSON.stringify(renderer.toJSON()), /note\.txt/);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });
    assert.ok(api.calls.some((call) => call.action === 'list' && call.query === 'note'));
    assert.equal(t('search.placeholder'), '搜索当前目录');
    await act(async () => { renderer.unmount(); });
  });

  test('does not keep stale rows after a directory request fails', async () => {
    const api = createApi();
    const { renderer, t } = await mount(api);
    api.failList = true;
    const docs = renderer.root.findAllByType('button')
      .find((node) => String(node.props.className ?? '').includes('dfm-rowName') && node.props.title === 'docs');
    assert.ok(docs);
    await act(async () => { docs.props.onClick(); });
    await settle();
    const text = JSON.stringify(renderer.toJSON());
    assert.doesNotMatch(text, /note\.txt/);
    assert.match(text, new RegExp(t('error.permission-denied')));
    await act(async () => { renderer.unmount(); });
  });

  test('refuses an oversized upload batch before starting an XHR', async () => {
    const api = createApi();
    const { renderer, t } = await mount(api);
    const fileInput = renderer.root.findAllByType('input').find((node) => node.props.type === 'file');
    assert.ok(fileInput);
    const files = Array.from({ length: 201 }, (_, index) => ({ name: `f-${index}.txt`, size: 1 }));
    await act(async () => {
      fileInput.props.onChange({ target: { files, value: '' } });
    });
    await settle();
    assert.equal(api.uploadCount, 0);
    assert.match(JSON.stringify(renderer.toJSON()), new RegExp(t('upload.tooMany')));
    await act(async () => { renderer.unmount(); });
  });

  test('accepts a file at the 8 GiB cap and rejects a batch over 8 GiB', async () => {
    const api = createApi();
    const { renderer, t } = await mount(api);
    const fileInput = renderer.root.findAllByType('input').find((node) => node.props.type === 'file');
    assert.ok(fileInput);
    const huge = { name: 'huge.bin', size: 8 * 1024 * 1024 * 1024 };
    await act(async () => {
      fileInput.props.onChange({ target: { files: [huge], value: '' } });
    });
    await settle();
    assert.equal(api.uploadCount, 1);
    await act(async () => {
      fileInput.props.onChange({
        target: { files: [huge, huge, { name: 'one-more.bin', size: 1 }], value: '' },
      });
    });
    await settle();
    assert.equal(api.uploadCount, 1);
    assert.match(JSON.stringify(renderer.toJSON()), new RegExp(t('upload.totalTooLarge')));
    await act(async () => { renderer.unmount(); });
  });

  test('does not render an image when metadata says it is unsafe', async () => {
    const api = createApi();
    api.entries = [
      ...api.entries,
      { name: 'bomb.png', path: 'bomb.png', kind: 'file', size: 64, mtimeMs: 1700000000000 },
    ];
    api.imageMeta = { previewable: false, reason: 'too-large' };
    const { renderer, t } = await mount(api);
    const imageRow = renderer.root.findAllByType('button')
      .find((node) => String(node.props.className ?? '').includes('dfm-rowName') && node.props.title === 'bomb.png');
    assert.ok(imageRow);
    await act(async () => { imageRow.props.onClick(); });
    await settle();
    assert.equal(renderer.root.findAllByType('img').length, 0);
    assert.match(JSON.stringify(renderer.toJSON()), new RegExp(t('preview.tooLarge')));
    await act(async () => { renderer.unmount(); });
  });

  test('explains the missing workspace without calling the API', async () => {
    const api = createApi();
    const { renderer, t } = await mount(api, { cwd: null });
    const text = JSON.stringify(renderer.toJSON());
    assert.match(text, new RegExp(t('noWorkspace')));
    assert.equal(api.calls.length, 0);
    await act(async () => { renderer.unmount(); });
  });
}
