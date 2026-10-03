const assert = require('node:assert/strict');
const test = require('node:test');
const { Chess, savedState, startApp } = require('./helpers/app.cjs');

function assertProtected(app, raw) {
  assert.equal(app.storage.get('cn-game'), raw, 'Saved bytes remain unchanged');
  assert.equal(app.gameWrites().length, 0, 'No game save replaces the original');
  assert.deepEqual(app.removals, []);
  assert.equal(app.elements.get('recoveryWarning').hidden, false);
  assert.ok(app.elements.get('recoveryWarning').textContent.trim());
}

function tapMove(app, from, to) {
  app.click(`sq-${from}`);
  app.click(`sq-${to}`);
}

test('fresh startup creates no saved game and hides the recovery warning', () => {
  const app = startApp();
  assert.equal(app.elements.get('moves').textContent, 'No moves yet');
  assert.equal(app.elements.get('result').value, '*');
  assert.equal(app.elements.get('recoveryWarning').hidden, true);
  assert.equal(app.gameWrites().length, 0);
  assert.equal(app.storage.has('cn-game'), false);
  assert.deepEqual(app.warnings, []);
});

test('valid saved moves and metadata restore while an old notation draft stays preserved', () => {
  const state = savedState();
  const raw = JSON.stringify(state);
  const app = startApp(raw);
  assert.equal(app.elements.get('moves').textContent, '1. e4   e5\n2. Nf3\n');
  for (const [id, value] of Object.entries(state.headers)) {
    if (id !== 'dateUserSet') assert.equal(app.elements.get(id).value, value, id);
  }
  assert.equal(app.elements.get('recoveryWarning').hidden, true);
  assert.equal(app.storage.get('cn-game'), raw);
  assert.equal(app.gameWrites().length, 0);
  assert.deepEqual(app.warnings, []);

  // Black can continue the fully restored position, and ordinary saving works.
  tapMove(app, 'b8', 'c6');
  assert.equal(app.elements.get('moves').textContent, '1. e4   e5\n2. Nf3   Nc6\n');
  assert.equal(app.gameWrites().length, 1);
  assert.equal(JSON.parse(app.storage.get('cn-game')).buf, 'Nc');
  app.input('event', 'Updated event');
  assert.equal(JSON.parse(app.storage.get('cn-game')).buf, 'Nc');
  const reloaded = startApp(app.storage.get('cn-game'));
  tapMove(reloaded, 'f1', 'b5');
  assert.equal(JSON.parse(reloaded.storage.get('cn-game')).buf, 'Nc');
  assert.equal(reloaded.elements.has('current'), false);
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
  tapMove(app, 'g1', 'f3');
  assert.equal(app.elements.get('moves').textContent, '1. e4   e5\n');
  assert.equal(app.elements.get('error').textContent, 'Game over');
  assert.equal(app.storage.get('cn-game'), raw);
  assert.equal(app.gameWrites().length, 0);
});

test('finished games with no moves restore each saved result', () => {
  for (const result of ['1-0', '0-1', '1/2-1/2']) {
    const chess = new Chess();
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
    tapMove(app, 'e2', 'e4');
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
    assert.equal(app.elements.get('event').value, '');
  }
});

test('edits and game actions after failed recovery preserve the original and warning', () => {
  const raw = JSON.stringify(savedState([], { pgn: '1. e4 broken' }));
  const app = startApp(raw);
  const warning = app.elements.get('recoveryWarning').textContent;
  app.input('event', 'New event');
  app.input('date', '2026-02-03');
  tapMove(app, 'd2', 'd4');
  app.click('undo');
  app.confirmWith(true);
  app.click('draw');
  app.click('undo');
  app.click('resign');
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
  tapMove(app, 'd2', 'd4');
  assertProtected(app, raw);
});

test('an unreadable saved value is protected from replacement by subsequent edits', () => {
  const raw = JSON.stringify(savedState());
  const app = startApp(raw, { read: new Error('Storage is unavailable') });
  app.input('event', 'Unsaved event');
  tapMove(app, 'd2', 'd4');
  assertProtected(app, raw);
});

test('a failed Reset storage removal keeps the original and recovery protection', () => {
  const raw = JSON.stringify(savedState([], { pgn: '1. e4 broken' }));
  const app = startApp(raw, { remove: new Error('Storage removal failed') });
  app.confirmWith(true);
  assert.throws(() => app.click('reset'), /Storage removal failed/);
  app.input('event', 'Still protected');
  tapMove(app, 'd2', 'd4');
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
  tapMove(app, 'd2', 'd4');
  assert.equal(app.gameWrites().length, 1);
  assert.match(JSON.parse(app.storage.get('cn-game')).pgn, /1\. d4/);
  const reloaded = startApp(app.storage.get('cn-game'));
  assert.equal(reloaded.elements.get('moves').textContent, '1. d4\n');
  assert.equal(reloaded.elements.get('recoveryWarning').hidden, true);
});

test('an old notation draft survives a cancelled Reset and clears only after confirmed Reset', () => {
  const raw = JSON.stringify(savedState());
  const app = startApp(raw);
  app.confirmWith(false);
  app.click('reset');
  assert.equal(app.storage.get('cn-game'), raw);
  app.input('site', 'Updated site');
  assert.equal(JSON.parse(app.storage.get('cn-game')).buf, 'Nc');
  app.confirmWith(true);
  app.click('reset');
  assert.equal(app.storage.has('cn-game'), false);
  tapMove(app, 'd2', 'd4');
  assert.equal(JSON.parse(app.storage.get('cn-game')).buf, '');
});
