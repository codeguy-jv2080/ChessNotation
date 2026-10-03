const assert = require('node:assert/strict');
const test = require('node:test');
const { html, savedState, startApp } = require('./helpers/app.cjs');

const pieceNames = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

function tapMove(app, from, to) {
  app.click(`sq-${from}`);
  app.click(`sq-${to}`);
}

function history(app) { return Array.from(app.evaluate('game.history()')); }
function fen(app) { return app.evaluate('game.fen()'); }

function position(fenString) {
  const app = startApp();
  assert.equal(app.evaluate(`game.load(${JSON.stringify(fenString)})`), true, 'Valid fixture');
  app.evaluate('updateAll()');
  return app;
}

function assertBoardMatchesGame(app) {
  for (const square of app.evaluate('game.SQUARES')) {
    const node = app.elements.get(`sq-${square}`);
    assert.ok(node, `Square ${square} is present`);
    const label = node.getAttribute('aria-label');
    assert.ok(label.includes(square), `Square ${square} is identified accessibly`);
    const piece = app.evaluate(`game.get(${JSON.stringify(square)})`);
    if (piece) {
      assert.match(label, new RegExp(piece.color === 'w' ? 'white' : 'black', 'i'), square);
      assert.match(label, new RegExp(pieceNames[piece.type], 'i'), square);
      assert.match(node.innerHTML, /<svg\b/, `Piece drawn on ${square}`);
    } else {
      assert.doesNotMatch(node.innerHTML, /<svg\b/, `Empty square ${square}`);
    }
  }
}

test('fresh board has 64 accessible squares in the correct starting position', () => {
  const app = startApp();
  assert.equal([...app.elements.keys()].filter(id => /^sq-[a-h][1-8]$/.test(id)).length, 64);
  assertBoardMatchesGame(app);
  assert.equal(app.elements.get('turnLabel').textContent, 'White to move');
  assert.match(app.elements.get('boardStatus').textContent, /tap.*piece/i);
  assert.equal(app.elements.get('promotionPanel').hidden, true);
  assert.equal(app.gameWrites().length, 0);
});

test('tapping a piece then its legal destination records and saves PGN', () => {
  const app = startApp();
  app.click('sq-e2');
  assert.equal(app.evaluate('selectedSquare'), 'e2');
  assert.equal(app.elements.get('sq-e2').getAttribute('aria-pressed'), 'true');
  assert.equal(app.gameWrites().length, 0, 'Selection alone is not a move');
  app.click('sq-e4');
  tapMove(app, 'e7', 'e5');
  assert.deepEqual(history(app), ['e4', 'e5']);
  assert.equal(app.elements.get('moves').textContent, '1. e4   e5\n');
  assert.match(app.elements.get('pgnOut').value, /1\. e4 e5 \*$/);
  assert.equal(app.gameWrites().length, 2);
  assert.equal(app.evaluate('selectedSquare'), null);
  assertBoardMatchesGame(app);
  assert.match(JSON.parse(app.storage.get('cn-game')).pgn, /1\. e4 e5 \*$/);
});

test('move list keeps paired move columns and requests scrolling to the latest entry', () => {
  const app = startApp(JSON.stringify(savedState(['e4', 'e5', 'Nf3'], { buf: '' })));
  const moves = app.elements.get('moves');
  // Simulate an overflowing move panel; this harness has no layout engine.
  moves.scrollHeight = 640;
  moves.scrollTop = 0;
  tapMove(app, 'b8', 'c6');
  const rows = [...moves.innerHTML.matchAll(/<div class="move-row">([\s\S]*?)<\/div>/g)];
  assert.equal(rows.length, 2);
  const columns = rows.map(([, row]) => [...row.matchAll(/<span(?: [^>]*)?>([^<]*)<\/span>/g)]
    .map(([, value]) => value.trim()));
  assert.deepEqual(columns, [['1.', 'e4', 'e5'], ['2.', 'Nf3', 'Nc6']]);
  assert.equal(moves.textContent, '1. e4   e5\n2. Nf3   Nc6\n');
  assert.equal(moves.scrollTop, 640, 'Rendering the move requests the bottom of the panel');
});

test('illegal destinations preserve the position, move list and saved game', () => {
  const app = startApp();
  const original = fen(app);
  tapMove(app, 'e2', 'e5');
  assert.equal(fen(app), original);
  assert.deepEqual(history(app), []);
  assert.equal(app.gameWrites().length, 0);
  assert.equal(app.evaluate('selectedSquare'), 'e2');
  assertBoardMatchesGame(app);
  app.click('sq-e4');
  assert.deepEqual(history(app), ['e4'], 'A legal destination can still complete the selection');
});

test('selection rejects the other side, switches friendly pieces and toggles off', () => {
  const app = startApp();
  app.click('sq-e7');
  assert.equal(app.evaluate('selectedSquare'), null);
  app.click('sq-e2');
  app.click('sq-g1');
  assert.equal(app.evaluate('selectedSquare'), 'g1');
  app.click('sq-g1');
  assert.equal(app.evaluate('selectedSquare'), null);
  assert.equal(app.gameWrites().length, 0);
});

test('legal destination hints distinguish empty moves and captures', () => {
  const app = startApp();
  app.click('sq-e2');
  for (const square of ['e3', 'e4']) {
    assert.equal(app.elements.get(`sq-${square}`).classList.contains('legal-move'), true);
    assert.match(app.elements.get(`sq-${square}`).getAttribute('aria-label'), /legal destination/);
  }
  assert.equal(app.elements.get('sq-e5').classList.contains('legal-move'), false);
  app.click('sq-e4');
  tapMove(app, 'd7', 'd5');
  app.click('sq-e4');
  assert.equal(app.elements.get('sq-d5').classList.contains('legal-capture'), true);
  assert.equal(app.elements.get('sq-d5').classList.contains('legal-move'), false);
});

test('keyboard arrows keep one board tab stop, stay inside edges and Escape cancels', () => {
  const app = startApp();
  const tabStops = () => [...app.elements].filter(([id, node]) => id.startsWith('sq-') && node.tabIndex === 0);
  assert.equal(tabStops().length, 1);
  app.keydown('ArrowUp', 'sq-e2');
  assert.equal(app.document.activeElement, app.elements.get('sq-e3'));
  assert.equal(tabStops().length, 1);
  app.keydown('ArrowRight', 'sq-h8');
  assert.equal(app.document.activeElement, app.elements.get('sq-h8'));
  app.keydown('ArrowDown', 'sq-a1');
  assert.equal(app.document.activeElement, app.elements.get('sq-a1'));
  app.click('sq-e2');
  app.keydown('Escape');
  assert.equal(app.evaluate('selectedSquare'), null);
  assert.equal(app.document.activeElement, app.elements.get('sq-e2'));
  assert.equal(app.gameWrites().length, 0);

  const promoting = position('4k3/P6p/8/8/8/8/8/4K3 w - - 0 1');
  const original = fen(promoting);
  tapMove(promoting, 'a7', 'a8');
  assert.equal(promoting.document.activeElement, promoting.elements.get('promote-q'));
  promoting.keydown('Escape');
  assert.equal(promoting.elements.get('promotionPanel').hidden, true);
  assert.equal(promoting.evaluate('pendingPromotion'), null);
  assert.equal(promoting.document.activeElement, promoting.elements.get('sq-a7'));
  assert.equal(fen(promoting), original);
  assert.equal(promoting.gameWrites().length, 0);
});

test('board squares retain native button activation for Enter and Space', () => {
  for (const key of ['Enter', ' ']) {
    const app = startApp();
    for (const square of ['e2', 'e4']) {
      const button = app.elements.get(`sq-${square}`);
      assert.equal(button.tagName, 'BUTTON');
      assert.equal(button.getAttribute('type'), 'button');
      const event = button.dispatch('keydown', { key });
      assert.equal(event.defaultPrevented, false, 'Do not intercept native button activation');
      // A browser activates a native button with a click for Enter/Space.
      // Dispatch that default action explicitly in this non-browser harness.
      button.click();
    }
    assert.deepEqual(history(app), ['e4']);
    assertBoardMatchesGame(app);
  }
});

test('a board capture records standard algebraic capture notation', () => {
  const app = startApp();
  tapMove(app, 'e2', 'e4');
  tapMove(app, 'd7', 'd5');
  tapMove(app, 'e4', 'd5');
  assert.deepEqual(history(app), ['e4', 'd5', 'exd5']);
  assert.equal(app.evaluate('game.get("e4")'), null);
  assert.equal(app.evaluate('game.get("d5").color'), 'w');
  assertBoardMatchesGame(app);
});

test('both castles move the king and rook and record castling notation', () => {
  for (const [destination, rookSquare, oldRookSquare, notation] of [
    ['g1', 'f1', 'h1', 'O-O'], ['c1', 'd1', 'a1', 'O-O-O']
  ]) {
    const app = position('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    tapMove(app, 'e1', destination);
    assert.deepEqual(history(app), [notation]);
    assert.equal(app.evaluate(`game.get('${destination}').type`), 'k');
    assert.equal(app.evaluate(`game.get('${rookSquare}').type`), 'r');
    assert.equal(app.evaluate(`game.get('${oldRookSquare}')`), null);
    assertBoardMatchesGame(app);
  }
});

test('en passant removes the captured pawn and saves the legal capture', () => {
  const app = position('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2');
  tapMove(app, 'e5', 'd6');
  assert.deepEqual(history(app), ['exd6']);
  assert.equal(app.evaluate('game.get("d5")'), null);
  assert.equal(app.evaluate('game.get("d6").type'), 'p');
  assertBoardMatchesGame(app);
});

test('promotion waits for a choice and supports queen, rook, bishop and knight', () => {
  for (const piece of ['q', 'r', 'b', 'n']) {
    const app = position('4k3/P6p/8/8/8/8/8/4K3 w - - 0 1');
    const original = fen(app);
    tapMove(app, 'a7', 'a8');
    assert.equal(app.elements.get('promotionPanel').hidden, false);
    assert.equal(fen(app), original, 'The pawn does not move before a choice');
    assert.equal(app.gameWrites().length, 0);
    app.click(`promote-${piece}`);
    assert.equal(app.evaluate('game.get("a8").type'), piece);
    assert.equal(app.evaluate('game.get("a7")'), null);
    assert.match(history(app)[0], new RegExp(`^a8=${piece.toUpperCase()}`));
    assert.equal(app.elements.get('promotionPanel').hidden, true);
    assert.equal(app.gameWrites().length, 1);
    assertBoardMatchesGame(app);
  }
});

test('cancelling promotion leaves the position and storage unchanged', () => {
  const app = position('4k3/P6p/8/8/8/8/8/4K3 w - - 0 1');
  const original = fen(app);
  tapMove(app, 'a7', 'a8');
  app.click('cancelPromotion');
  assert.equal(app.elements.get('promotionPanel').hidden, true);
  assert.equal(app.evaluate('pendingPromotion'), null);
  assert.equal(fen(app), original);
  assert.deepEqual(history(app), []);
  assert.equal(app.gameWrites().length, 0);
  assertBoardMatchesGame(app);
});

test('undo, reset and reload synchronize board, history and pending selection', () => {
  const app = startApp();
  tapMove(app, 'e2', 'e4');
  tapMove(app, 'e7', 'e5');
  const reloaded = startApp(app.storage.get('cn-game'));
  assert.equal(fen(reloaded), fen(app));
  assert.deepEqual(history(reloaded), ['e4', 'e5']);
  assert.equal(reloaded.gameWrites().length, 0);
  assertBoardMatchesGame(reloaded);
  app.click('sq-g1');
  app.click('undo');
  assert.deepEqual(history(app), ['e4']);
  assert.equal(app.evaluate('selectedSquare'), null);
  assertBoardMatchesGame(app);
  app.confirmWith(true);
  app.click('reset');
  assert.deepEqual(history(app), []);
  assert.equal(app.storage.has('cn-game'), false);
  assertBoardMatchesGame(app);
});

test('old browser saves restore directly to the same board position', () => {
  const raw = JSON.stringify(savedState(['d4', 'd5', 'c4'], { buf: '' }));
  const app = startApp(raw);
  assert.deepEqual(history(app), ['d4', 'd5', 'c4']);
  assertBoardMatchesGame(app);
  assert.equal(app.storage.get('cn-game'), raw);
  assert.equal(app.gameWrites().length, 0);
  tapMove(app, 'e7', 'e6');
  assert.deepEqual(history(app), ['d4', 'd5', 'c4', 'e6']);
});

test('checkmate is logged with result and board input then refuses extra moves', () => {
  const app = startApp();
  for (const [from, to] of [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4']]) {
    tapMove(app, from, to);
  }
  assert.deepEqual(history(app), ['f3', 'e5', 'g4', 'Qh4#']);
  assert.equal(app.elements.get('result').value, '0-1');
  assert.match(app.elements.get('pgnOut').value, /Qh4# 0-1$/);
  assert.match(app.elements.get('boardStatus').textContent, /checkmate/i);
  const finalPosition = fen(app);
  const writes = app.gameWrites().length;
  tapMove(app, 'e2', 'e3');
  assert.equal(fen(app), finalPosition);
  assert.equal(app.gameWrites().length, writes);
  assertBoardMatchesGame(app);
});

test('a resigned or agreed drawn game cannot accept board moves until undo', () => {
  for (const action of ['resign', 'draw']) {
    const app = startApp();
    tapMove(app, 'e2', 'e4');
    app.click('sq-e7');
    app.confirmWith(true);
    app.click(action);
    assert.equal(app.evaluate('selectedSquare'), null);
    const finalPosition = fen(app);
    const writes = app.gameWrites().length;
    tapMove(app, 'e7', 'e5');
    assert.equal(fen(app), finalPosition);
    assert.equal(app.gameWrites().length, writes);
    app.click('undo');
    tapMove(app, 'e7', 'e5');
    assert.deepEqual(history(app), ['e4', 'e5']);
    assertBoardMatchesGame(app);
  }
});

test('notation entry controls are absent and the board remains the move input', () => {
  const app = startApp();
  for (const id of ['manualEntry', 'current', 'submit', 'backspace', 'clearMove']) {
    assert.equal(app.elements.has(id), false, `Removed notation control #${id}`);
  }
  tapMove(app, 'e2', 'e4');
  assert.deepEqual(history(app), ['e4']);
  assert.equal(app.evaluate('selectedSquare'), null);
  assertBoardMatchesGame(app);
});

test('Light and Dark controls preserve the board, selected piece and game data', () => {
  const app = startApp();
  tapMove(app, 'd2', 'd4');
  app.click('sq-g8');
  const original = fen(app);
  const saved = app.storage.get('cn-game');
  const artwork = [...app.elements].filter(([id]) => id.startsWith('sq-'))
    .map(([id, node]) => [id, node.innerHTML]);
  for (const theme of ['dark', 'light']) {
    app.click(`${theme}Theme`);
    assert.equal(app.document.documentElement.getAttribute('data-theme'), theme);
    assert.equal(app.elements.get(`${theme}Theme`).getAttribute('aria-pressed'), 'true');
    assert.equal(app.storage.get('cn-theme'), theme);
    assert.equal(fen(app), original);
    assert.equal(app.storage.get('cn-game'), saved);
    assert.equal(app.evaluate('selectedSquare'), 'g8');
    for (const [id, markup] of artwork) assert.equal(app.elements.get(id).innerHTML, markup, id);
  }
  assert.match(html, /#F0D9B5/i);
  assert.match(html, /#B58863/i);
});

test('board play after a failed recovery cannot overwrite the damaged saved game', () => {
  const raw = JSON.stringify(savedState([], { pgn: '1. e4 e5 2. invalid' }));
  const app = startApp(raw);
  tapMove(app, 'd2', 'd4');
  assert.deepEqual(history(app), ['d4']);
  assert.equal(app.storage.get('cn-game'), raw);
  assert.equal(app.gameWrites().length, 0);
  assert.equal(app.elements.get('recoveryWarning').hidden, false);
  assertBoardMatchesGame(app);
});
