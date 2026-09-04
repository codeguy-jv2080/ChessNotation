# Chess Notation

A single-file browser application for entering chess game notation and exporting the finished game as PGN.

The repository centers on:

`chess-notation-paper-style-keyboard-entry.html`

## Features

- Enter moves with the on-screen notation buttons or a physical keyboard
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
- Light and dark themes

## Usage

No installation or build process is required.

Open the HTML file directly in a web browser:

```text
chess-notation-paper-style-keyboard-entry.html
```

Enter the game information, then enter each move and press **Enter Move** or press **Enter** on the keyboard.

The application validates each move before adding it to the game.

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

## Requirements

A modern web browser with JavaScript enabled.

The application is self-contained in a single HTML file and does not require a server or external installation.
