# Chess Notation

A single-file, offline browser application for recording chess games by moving
pieces on a board and exporting the game as PGN.

The repository centers on:

`chess-notation-paper-style-keyboard-entry.html`

## Features

- Tap or click a piece, then a highlighted destination to record a move
- Cream-and-brown board with embedded Cburnett SVG pieces
- Legal destination, last-move, and check highlighting
- Promotion picker with queen, rook, bishop, and knight choices
- Navigate board squares with arrow keys, activate with Enter/Space, and cancel
  selection or promotion with Escape
- Supports standard chess notation including:
  - Piece moves
  - Captures
  - Castling
  - Promotions
  - Check and checkmate
  - En passant notation
- Enforces legal moves
- Displays the move list as the game is entered
- Game information fields for:
  - Event
  - Site
  - White
  - Black
  - Round
  - Date
  - Time Control
  - Result
- Automatically converts a time control such as `90+30` to PGN format `5400+30`
- Detects checkmate and draw conditions
- Resign and draw controls
- Undo and reset controls
- Copy PGN to the clipboard
- Download the completed game as a `.pgn` file
- Saves the current game in browser local storage
- Visible Light and Dark buttons; board and piece colors stay the same in both
- Responsive layout with a compact move list beside the board on desktop and
  below the board on smaller screens

## Usage

No installation or build process is required.

Open the HTML file directly in a web browser:

```text
chess-notation-paper-style-keyboard-entry.html
```

Enter the game information, then tap or click a piece belonging to the side to
move. Legal destinations are highlighted. Tap or click a destination to make the
move and automatically update the move list and PGN.

To castle, select the king and its castling destination. When a pawn reaches the
last rank, choose its promotion piece. Tap the selected piece again, or press
Escape, to cancel a selection. Use **Undo** to undo a recorded move.

The application validates every move. It records both sides of the game; it does
not supply a computer opponent. Board entry uses two taps/clicks, not dragging.

## PGN Export

The generated PGN includes the entered game headers and move notation.

Example:

```pgn
[Event "Saturday Club Game"]
[Site "Springfield"]
[Date "2026.08.15"]
[Round "3"]
[White "Alex Carter"]
[Black "Michael Reed"]
[Result "1-0"]
[TimeControl "5400+30"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 ...
1-0
```

Use **Download PGN** to save the game or **Copy PGN** to copy it to the clipboard.

## Local Storage

The current game is automatically saved in the browser's local storage so it can be restored after the page is closed or refreshed.

Using **Reset** clears the saved game.

Existing saves from the earlier keypad version restore directly to the board.
Keep using the same HTML file location and browser profile to retain access to
that browser's saved game and theme. No migration or storage reset is needed.

If a saved game cannot be restored, its original data is preserved and a warning
explains that autosaving is paused. Reset requires confirmation before discarding
that unreadable save. Valid saves are not rewritten during startup.

## Requirements

A modern web browser with JavaScript enabled.

The application is self-contained in a single HTML file and does not require a server or external installation.

## License

Chess Notation is licensed under GPL-3.0-or-later. See `LICENSE`.
The embedded chess.js code remains under its BSD 2-Clause license; see
`THIRD_PARTY_NOTICES.md` and the preserved notice inside the HTML file.
The Cburnett pieces are by Colin M. L. Burnett and are included under the GPL
license option; see `THIRD_PARTY_NOTICES.md` for artwork sources and attribution.

## Development checks

With Node.js installed, run the background regression tests:

```text
node --test tests/*.test.cjs
```

Tests use simulated page elements and storage, including fresh defaults, board
input, special moves, undo/reset, theme switching, and recovery protection. They
do not access real browser profiles or saved games. Node.js is needed only for
these development checks, not to use the HTML app.
