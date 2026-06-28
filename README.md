# NesTAb

**Save, manage and restore your browser tab sessions**

NesTAb is a lightweight Chrome/Opera extension that saves your open tabs into named sessions and restores them later. Pick which tabs to save, name your session, and close the rest — all with a few clicks.

## Features

- **Save sessions** — save all or selected tabs from the current window into a named session
- **Selective tab saving** — check/uncheck individual tabs before saving; unchecked tabs stay open
- **Restore sessions** — reopen every tab from a saved session in new tabs
- **Edit sessions** — rename a session or remove specific tabs from it without deleting the session
- **Close matching tabs** — close all currently open tabs whose URLs match a saved session
- **Close all tabs** — close every tab in the current window, open a fresh blank tab, and see how much RAM was freed (~150 MB per tab)
- **Confirmation dialogs** — no accidental deletions; all destructive actions ask first
- **Session persistence** — sessions are stored in `localStorage` and survive popup close

## How to install

### Chrome
1. Open `chrome://extensions`
2. Enable **Developer mode** (toggle top-right)
3. Click **Load unpacked**
4. Select the `nesTab` extension folder

### Opera
1. Open `opera://extensions`
2. Enable **Developer mode** (toggle top-right)
3. Click **Load unpacked**
4. Select the `nesTab` extension folder

## How to use

1. Click the NesTAb icon in the toolbar to open the popup
2. Click **Save Session**, give it a name (or leave blank for auto-name), select the tabs you want to save, and confirm
3. Saved sessions appear in the list below the buttons
4. Hover a session card to reveal four action buttons:
   - **Pencil** — edit the session name and which tabs it contains
   - **Restore** — reopen all saved tabs in new tabs
   - **X** — close any currently open tabs that match this session's URLs
   - **Trash** — delete the session permanently

## Tech stack

- HTML, CSS, JavaScript
- Chrome Extension Manifest V3
- `localStorage` for session persistence
- Google Material Symbols (outline) via CDN
- Python PIL (icons generation)

## License

MIT
