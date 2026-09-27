const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// Run the actual embedded scripts without a browser or any real user storage.
const html = fs.readFileSync(path.join(__dirname, '..',
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

function startApp(raw = null, storageErrors = {}) {
  const elements = new Map();
  function element(attributes = '') {
    const listeners = new Map();
    const attrs = new Map();
    return {
      value: '', textContent: '', hidden: /\bhidden\b/.test(attributes),
      dataset: {},
      addEventListener(type, callback) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(callback);
      },
      dispatch(type, event = {}) {
        for (const callback of listeners.get(type) || []) {
          callback({ preventDefault() {}, ...event });
        }
      },
      setAttribute(name, value) { attrs.set(name, value); },
      getAttribute(name) { return attrs.get(name) ?? null; },
      focus() {}, setSelectionRange() {}, select() {},
      click() { this.dispatch('click'); }
    };
  }
  for (const match of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    const node = element(match[0]);
    node.textContent = html.slice(match.index + match[0].length).match(/^[^<]*/)[0];
    elements.set(match[1], node);
  }
  elements.get('result').value = '*';
  const storage = new Map(raw === null ? [] : [['cn-game', raw]]);
  const writes = [];
  const removals = [];
  const warnings = [];
  const confirmations = [];
  let confirmResult = false;
  const context = vm.createContext({
    document: {
      documentElement: element(),
      getElementById(id) {
        assert.ok(elements.has(id), `Unknown element #${id}`);
        return elements.get(id);
      },
      querySelectorAll() { return []; },
      createElement() { return element(); }
    },
    window: { matchMedia() { return { matches: false }; } },
    localStorage: {
      getItem(key) {
        if (key === 'cn-game' && storageErrors.read) throw storageErrors.read;
        return storage.get(key) ?? null;
      },
      setItem(key, value) {
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
    elements, storage, removals, warnings, confirmations,
    gameWrites() { return writes.filter(([key]) => key === 'cn-game'); },
    input(id, value) {
      elements.get(id).value = value;
      elements.get(id).dispatch('input');
    },
    click(id) { elements.get(id).click(); },
    confirmWith(value) { confirmResult = value; }
  };
}

function assertProtected(app, raw) {
  assert.equal(app.storage.get('cn-game'), raw, 'Saved bytes remain unchanged');
  assert.equal(app.gameWrites().length, 0, 'No game save replaces the original');
  assert.deepEqual(app.removals, []);
  assert.equal(app.elements.get('recoveryWarning').hidden, false);
  assert.ok(app.elements.get('recoveryWarning').textContent.trim());
}

test('fresh startup creates no saved game and hides the recovery warning', () => {
  const app = startApp();
  assert.equal(app.elements.get('moves').textContent, 'No moves yet');
  assert.equal(app.elements.get('current').value, '');
  assert.equal(app.elements.get('result').value, '*');
  assert.equal(app.elements.get('recoveryWarning').hidden, true);
  assert.equal(app.gameWrites().length, 0);
  assert.equal(app.storage.has('cn-game'), false);
  assert.deepEqual(app.warnings, []);
});

test('valid saved moves, metadata and unfinished entry restore without a startup write', () => {
  const state = savedState();
  const raw = JSON.stringify(state);
  const app = startApp(raw);
  assert.equal(app.elements.get('moves').textContent, '1. e4   e5\n2. Nf3\n');
  for (const [id, value] of Object.entries(state.headers)) {
    if (id !== 'dateUserSet') assert.equal(app.elements.get(id).value, value, id);
  }
  assert.equal(app.elements.get('current').value, 'Nc');
  assert.equal(app.elements.get('recoveryWarning').hidden, true);
  assert.equal(app.storage.get('cn-game'), raw);
  assert.equal(app.gameWrites().length, 0);
  assert.deepEqual(app.warnings, []);

  // Black can continue the fully restored position, and ordinary saving works.
  app.input('current', 'Nc6');
  app.click('submit');
  assert.equal(app.elements.get('moves').textContent, '1. e4   e5\n2. Nf3   Nc6\n');
  assert.equal(app.gameWrites().length, 1);
});

test('valid saved games with no moves restore, including generated headers and result', () => {
  for (const pgn of ['', '*', savedState([]).pgn]) {
    const raw = JSON.stringify(savedState([], { pgn, buf: '' }));
    const app = startApp(raw);
    assert.equal(app.elements.get('moves').textContent, 'No moves yet', pgn);
    assert.equal(app.elements.get('event').value, 'Example event', pgn);
    assert.equal(app.elements.get('recoveryWarning').hidden, true, pgn);
    assert.equal(app.storage.get('cn-game'), raw);
    assert.equal(app.gameWrites().length, 0);
  }
});

test('older minimal saves can omit optional state fields', () => {
  const raw = JSON.stringify({ pgn: '1. e4 e5' });
  const app = startApp(raw);
  assert.equal(app.elements.get('moves').textContent, '1. e4   e5\n');
  assert.equal(app.elements.get('current').value, '');
  assert.equal(app.elements.get('event').value, '');
  assert.equal(app.elements.get('recoveryWarning').hidden, true);
  assert.equal(app.storage.get('cn-game'), raw);
  assert.equal(app.gameWrites().length, 0);
});

test('finished saved games keep their result and refuse additional moves', () => {
  const state = savedState(['e4', 'e5'], { ended: true, buf: '' });
  state.headers.result = '1/2-1/2';
  const raw = JSON.stringify(state);
  const app = startApp(raw);
  assert.equal(app.elements.get('result').value, '1/2-1/2');
  assert.equal(app.elements.get('recoveryWarning').hidden, true);
  app.input('current', 'Nf3');
  app.click('submit');
  assert.equal(app.elements.get('moves').textContent, '1. e4   e5\n');
  assert.equal(app.elements.get('error').textContent, 'Game over');
  assert.equal(app.storage.get('cn-game'), raw);
  assert.equal(app.gameWrites().length, 0);
});

test('finished games with no moves restore each saved result', () => {
  for (const result of ['1-0', '0-1', '1/2-1/2']) {
    const chess = new engineContext.Chess();
    chess.header('Event', 'Example event', 'Result', result);
    const state = savedState([], { pgn: chess.pgn(), ended: true, buf: '' });
    state.headers.result = result;
    const raw = JSON.stringify(state);
    const app = startApp(raw);
    assert.equal(app.elements.get('moves').textContent, 'No moves yet', result);
    assert.equal(app.elements.get('result').value, result);
    assert.equal(app.elements.get('event').value, 'Example event');
    assert.equal(app.elements.get('recoveryWarning').hidden, true, result);
    assert.equal(app.storage.get('cn-game'), raw);
    assert.equal(app.gameWrites().length, 0);
    app.input('current', 'e4');
    app.click('submit');
    assert.equal(app.elements.get('error').textContent, 'Game over');
    assert.equal(app.gameWrites().length, 0);
  }
});

test('a damaged PGN with legal leading moves never becomes a live partial game', () => {
  const raw = JSON.stringify(savedState([], { pgn: '1. e4 e5 2. definitely-invalid' }));
  const app = startApp(raw);
  assertProtected(app, raw);
  assert.equal(app.elements.get('moves').textContent, 'No moves yet');
  assert.equal(app.elements.get('event').value, '');
  assert.equal(app.elements.get('current').value, '');
});

test('malformed JSON and invalid state shapes preserve the complete saved value', () => {
  const invalidStates = [
    null, [], 'invalid', {},
    savedState([], { pgn: 42 }),
    savedState([], { headers: [] }),
    savedState([], { buf: {} }),
    savedState([], { ended: 'false' }),
    savedState([], { headers: { ...savedState().headers, white: {} } }),
    savedState([], { headers: { ...savedState().headers, dateUserSet: 'true' } }),
    savedState([], { headers: { ...savedState().headers, result: 'invalid' } })
  ];
  for (const raw of ['{invalid JSON', '', ...invalidStates.map(JSON.stringify)]) {
    const app = startApp(raw);
    assertProtected(app, raw);
    assert.equal(app.elements.get('moves').textContent, 'No moves yet');
    assert.equal(app.elements.get('current').value, '');
    assert.equal(app.elements.get('event').value, '');
  }
});

test('edits and game actions after failed recovery preserve the original and warning', () => {
  const raw = JSON.stringify(savedState([], { pgn: '1. e4 broken' }));
  const app = startApp(raw);
  const warning = app.elements.get('recoveryWarning').textContent;
  app.input('event', 'New event');
  app.input('date', '2026-02-03');
  app.input('current', 'd4');
  app.click('submit');
  app.click('undo');
  app.confirmWith(true);
  app.click('draw');
  app.click('undo');
  app.click('resign');
  app.click('clearMove');
  assertProtected(app, raw);
  assert.equal(app.elements.get('recoveryWarning').textContent, warning);
});

test('cancelling Reset keeps failed-recovery protection in place', () => {
  const raw = JSON.stringify(savedState([], { pgn: '1. e4 broken' }));
  const app = startApp(raw);
  app.confirmWith(false);
  app.click('reset');
  assert.equal(app.confirmations.length, 1);
  assert.match(app.confirmations[0], /discard|delete|remove|replace/i);
  app.input('event', 'Still protected');
  app.input('current', 'd4');
  app.click('submit');
  assertProtected(app, raw);
});

test('an unreadable saved value is protected from replacement by subsequent edits', () => {
  const raw = JSON.stringify(savedState());
  const app = startApp(raw, { read: new Error('Storage is unavailable') });
  app.input('event', 'Unsaved event');
  app.input('current', 'd4');
  app.click('submit');
  assertProtected(app, raw);
});

test('a failed Reset storage removal keeps the original and recovery protection', () => {
  const raw = JSON.stringify(savedState([], { pgn: '1. e4 broken' }));
  const app = startApp(raw, { remove: new Error('Storage removal failed') });
  app.confirmWith(true);
  assert.throws(() => app.click('reset'), /Storage removal failed/);
  app.input('event', 'Still protected');
  app.input('current', 'd4');
  app.click('submit');
  assertProtected(app, raw);
});

test('confirmed Reset explicitly discards the invalid save and resumes ordinary saves', () => {
  const raw = JSON.stringify(savedState([], { pgn: '1. e4 broken' }));
  const app = startApp(raw);
  app.confirmWith(true);
  app.click('reset');
  assert.equal(app.confirmations.length, 1);
  assert.match(app.confirmations[0], /discard|delete|remove|replace/i);
  assert.equal(app.storage.has('cn-game'), false);
  assert.deepEqual(app.removals, ['cn-game']);
  assert.equal(app.elements.get('recoveryWarning').hidden, true);
  assert.equal(app.elements.get('moves').textContent, 'No moves yet');
  app.input('current', 'd4');
  app.click('submit');
  assert.equal(app.gameWrites().length, 1);
  assert.match(JSON.parse(app.storage.get('cn-game')).pgn, /1\. d4/);
  const reloaded = startApp(app.storage.get('cn-game'));
  assert.equal(reloaded.elements.get('moves').textContent, '1. d4\n');
  assert.equal(reloaded.elements.get('recoveryWarning').hidden, true);
});
