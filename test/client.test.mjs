import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

function createDocument() {
  const styles = [];
  return {
    styles,
    getElementById(id) {
      return styles.find((style) => style.id === id) ?? null;
    },
    createElement(tag) {
      return {
        tag,
        id: '',
        textContent: '',
        isConnected: true,
        remove() {
          this.isConnected = false;
          const index = styles.indexOf(this);
          if (index >= 0) styles.splice(index, 1);
        },
      };
    },
    head: {
      appendChild(node) {
        styles.push(node);
      },
    },
  };
}

function createContext() {
  const effects = [];
  const dictionaries = new Map();
  const slotRegistrations = [];
  const openedTabs = [];
  let activeLocale = 'zh';
  let tabDefinition = null;

  const document = createDocument();

  function translate(ns, key, params) {
    const locales = dictionaries.get(ns);
    const table = locales?.[activeLocale] ?? locales?.en ?? {};
    let template = table[key] ?? key;
    if (params) {
      template = template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
    }
    return template;
  }

  const ctx = {
    locale: {
      bind(ns) {
        return (key, params) => translate(ns, key, params);
      },
      register(ns, dicts) {
        dictionaries.set(ns, dicts);
        return () => dictionaries.delete(ns);
      },
    },
    effect(fn, label) {
      effects.push({ label, dispose: fn() });
    },
    sidebarRightTabs: {
      register(definition) {
        tabDefinition = definition;
        return () => {
          if (tabDefinition === definition) tabDefinition = null;
        };
      },
    },
    slots: {
      inject(name, register) {
        slotRegistrations.push({ name, registration: register() });
        return () => {};
      },
      register(options, component) {
        return { options, component };
      },
    },
    sidebarRight: {
      openTab(kind) {
        openedTabs.push(kind);
      },
    },
  };

  return {
    ctx,
    document,
    effects,
    dictionaries,
    slotRegistrations,
    openedTabs,
    get tabDefinition() {
      return tabDefinition;
    },
    set activeLocale(value) {
      activeLocale = value;
    },
  };
}

function createReact() {
  return {
    Fragment: 'Fragment',
    createElement(type, props, ...children) {
      return { type, props: props ?? {}, children };
    },
  };
}

async function loadClient() {
  const code = await readFile(new URL('../client.js', import.meta.url), 'utf8');
  const harness = createContext();
  let captured = null;
  const window = {
    __ModuleLoader__: {
      load(entry) {
        captured = entry;
      },
    },
  };
  const context = vm.createContext({
    window,
    document: harness.document,
    console,
    Intl,
    URLSearchParams,
    setTimeout,
    clearTimeout,
  });
  new vm.Script(code, { filename: 'client.js' }).runInContext(context);
  assert.ok(captured, 'the client module must call window.__ModuleLoader__.load');
  const exports = captured.factory((id) => {
    if (id === 'react') return createReact();
    throw new Error(`unexpected require: ${id}`);
  });
  return { exports, harness, id: captured.id };
}

test('client module loads and registers the tab, guide, and slots', async () => {
  const { exports, harness, id } = await loadClient();
  assert.equal(id, '@dsh-custom/dsh-file-manager');
  assert.deepEqual([...exports.inject], ['slots', 'locale', 'sidebarRightTabs', 'sidebarRight']);
  assert.equal(typeof exports.apply, 'function');

  exports.apply(harness.ctx);

  const definition = harness.tabDefinition;
  assert.ok(definition, 'a tab definition must be registered');
  assert.equal(definition.id, '@dsh-custom/dsh-file-manager');
  assert.equal(definition.kind, 'file-manager');
  assert.equal(definition.priority, 'extension');
  assert.equal(definition.title(), '工作区文件');
  assert.equal(definition.guide[0].title(), '工作区文件管理');
  assert.equal(typeof definition.guide[0].icon, 'function');

  const registrations = harness.slotRegistrations.map((entry) => entry.name).sort();
  assert.deepEqual(registrations, [
    'sidebar.right.pane.tab',
    'sidebar.right.pane.tab.title',
    'sidebar.right.tab.files.actions',
  ]);

  const body = harness.slotRegistrations.find((entry) => entry.name === 'sidebar.right.pane.tab');
  assert.equal(body.registration.options.key, '@dsh-custom/dsh-file-manager');
  assert.equal(body.registration.options.locale, 'fileManager');
  assert.equal(typeof body.registration.component, 'function');

  const action = harness.slotRegistrations.find((entry) => entry.name === 'sidebar.right.tab.files.actions');
  assert.equal(action.registration.options.id, 'workspace-file-manager');
  const element = action.registration.component({ t: (key) => key });
  assert.equal(element.type, 'button');
  element.props.onClick({ stopPropagation() {} });
  assert.deepEqual(harness.openedTabs, ['file-manager']);

  harness.activeLocale = 'en';
  assert.equal(definition.title(), 'Workspace Files');
  assert.equal(definition.guide[0].description(), "Manage this session's workspace files: upload, rename, move, copy, and delete.");
});

test('client dictionaries have matching key sets', async () => {
  const { exports, harness } = await loadClient();
  exports.apply(harness.ctx);
  const dicts = harness.dictionaries.get('fileManager');
  assert.ok(dicts?.zh && dicts?.en);
  const zhKeys = Object.keys(dicts.zh).sort();
  const enKeys = Object.keys(dicts.en).sort();
  assert.deepEqual(zhKeys, enKeys);
  assert.ok(zhKeys.length > 50);
});

test('style injection registers one stylesheet and cleans it up', async () => {
  const { exports, harness } = await loadClient();
  const document = harness.document;
  exports.apply(harness.ctx);
  assert.equal(document.styles.length, 1);
  assert.match(document.styles[0].textContent, /\.dfm-shell/);
  assert.match(document.styles[0].textContent, /--dsw-alias-label-primary/);
  const dispose = harness.effects.find((entry) => entry.label === 'dsh-file-manager: styles')?.dispose;
  assert.equal(typeof dispose, 'function');
  dispose();
  assert.equal(document.styles.length, 0);
});
