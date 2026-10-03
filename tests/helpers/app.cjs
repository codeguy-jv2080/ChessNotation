const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Execute the shipped, embedded scripts against a small DOM and in-memory
// storage. These checks never open a browser or access a user's saved games.
const html = fs.readFileSync(path.join(__dirname, '..', '..',
  'chess-notation-paper-style-keyboard-entry.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]);
const engineContext = vm.createContext({});
vm.runInContext(scripts[0], engineContext);

function savedState(moves = ['e4', 'e5', 'Nf3'], overrides = {}) {
  const chess = new engineContext.Chess();
  for (const move of moves) assert.ok(chess.move(move), `Fixture move: ${move}`);
  chess.header('Event', 'Example event', 'Result', '*');
  return {
    pgn: chess.pgn(),
    headers: {
      event: 'Example event', site: 'Example site', round: '2',
      white: 'White player', black: 'Black player', date: '2026-01-02',
      dateUserSet: true, timeControl: '5+3', result: '*'
    },
    ended: false,
    buf: 'Nc',
    ...overrides
  };
}

function startApp(raw = null, storageErrors = {}, options = {}) {
  const elements = new Map();
  const documentListeners = new Map();
  function element(markup = '') {
    const listeners = new Map();
    let contents = '';
    const attrs = new Map([...markup.matchAll(/([\w-]+)="([^"]*)"/g)]
      .map(match => [match[1], match[2]]));
    const classes = new Set((attrs.get('class') || '').split(/\s+/).filter(Boolean));
    const node = {
      value: attrs.get('value') || '', scrollTop: 0, scrollHeight: 0,
      tagName: (markup.match(/^<([a-z][a-z0-9]*)/i)?.[1] || '').toUpperCase(),
      hidden: /\bhidden\b/.test(markup), disabled: /\bdisabled\b/.test(markup),
      dataset: Object.fromEntries([...attrs].filter(([name]) => name.startsWith('data-'))
        .map(([name, value]) => [name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase()), value])),
      children: [], style: {},
      addEventListener(type, callback) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(callback);
      },
      dispatch(type, event = {}) {
        const dispatched = {
          target: node, currentTarget: node, defaultPrevented: false,
          preventDefault() { this.defaultPrevented = true; }, ...event
        };
        for (const callback of listeners.get(type) || []) {
          callback(dispatched);
        }
        return dispatched;
      },
      setAttribute(name, value) {
        attrs.set(name, String(value));
        if (name === 'class') this.className = value;
      },
      getAttribute(name) { return attrs.get(name) ?? null; },
      removeAttribute(name) { attrs.delete(name); },
      focus() { document.activeElement = node; }, setSelectionRange() {}, select() {},
      scrollIntoView() {},
      appendChild(child) { this.children.push(child); return child; },
      click() { if (!this.disabled) this.dispatch('click'); },
      classList: {
        add(...tokens) { for (const token of tokens) classes.add(token); },
        remove(...tokens) { for (const token of tokens) classes.delete(token); },
        contains(token) { return classes.has(token); },
        toggle(token, force) {
          const add = force === undefined ? !classes.has(token) : force;
          if (add) classes.add(token); else classes.delete(token);
          return add;
        }
      }
    };
    Object.defineProperties(node, {
      innerHTML: {
        get() { return contents; },
        set(value) { contents = String(value); }
      },
      textContent: {
        get() {
          const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
          return contents.replace(/<!--[\s\S]*?-->|<[^>]*>/g, '')
            .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, name) => {
              if (name[0] !== '#') return entities[name.toLowerCase()];
              const hex = name[1].toLowerCase() === 'x';
              return String.fromCodePoint(parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10));
            });
        },
        set(value) {
          contents = String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }
      }
    });
    Object.defineProperty(node, 'className', {
      get() { return [...classes].join(' '); },
      set(value) {
        classes.clear();
        for (const token of String(value).split(/\s+/).filter(Boolean)) classes.add(token);
      }
    });
    return node;
  }
  for (const match of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    const node = element(match[0]);
    node.textContent = html.slice(match.index + match[0].length).match(/^[^<]*/)[0];
    elements.set(match[1], node);
  }
  elements.get('result').value = '*';
  const storage = new Map(raw === null ? [] : [['cn-game', raw]]);
  if (options.theme) storage.set('cn-theme', options.theme);
  const writes = [];
  const removals = [];
  const warnings = [];
  const confirmations = [];
  let confirmResult = false;
  const document = {
    documentElement: element(), activeElement: null,
    getElementById(id) {
      assert.ok(elements.has(id), `Unknown element #${id}`);
      return elements.get(id);
    },
    querySelectorAll(selector) {
      if (selector.includes('[data-square]') || selector.includes('.square')) {
        return [...elements.values()].filter(node => node.dataset.square);
      }
      return [];
    },
    createElement() { return element(); },
    addEventListener(type, callback) {
      if (!documentListeners.has(type)) documentListeners.set(type, []);
      documentListeners.get(type).push(callback);
    }
  };
  const context = vm.createContext({
    document,
    window: { matchMedia() { return { matches: false }; } },
    localStorage: {
      getItem(key) {
        if (key === 'cn-game' && storageErrors.read) throw storageErrors.read;
        return storage.get(key) ?? null;
      },
      setItem(key, value) {
        if (key === 'cn-game' && storageErrors.write) throw storageErrors.write;
        writes.push([key, value]);
        storage.set(key, String(value));
      },
      removeItem(key) {
        if (key === 'cn-game' && storageErrors.remove) throw storageErrors.remove;
        removals.push(key);
        storage.delete(key);
      }
    },
    confirm(message) { confirmations.push(message); return confirmResult; },
    console: { warn(...args) { warnings.push(args); } }
  });
  for (const script of scripts) vm.runInContext(script, context);
  return {
    elements, storage, removals, warnings, confirmations, document,
    gameWrites() { return writes.filter(([key]) => key === 'cn-game'); },
    input(id, value) {
      elements.get(id).value = value;
      elements.get(id).dispatch('input');
    },
    click(id) {
      assert.ok(elements.has(id), `Unknown element #${id}`);
      elements.get(id).click();
    },
    keydown(key, id = null) {
      if (id) elements.get(id).dispatch('keydown', { key });
      else for (const callback of documentListeners.get('keydown') || []) {
        callback({ key, preventDefault() {} });
      }
    },
    evaluate(source) { return vm.runInContext(source, context); },
    confirmWith(value) { confirmResult = value; }
  };
}

module.exports = { html, Chess: engineContext.Chess, savedState, startApp };
