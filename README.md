# NesTAb

> Save, manage and restore your browser tab sessions

NesTAb is a lightweight Chrome/Opera extension for people who live with too many tabs open. Save your tabs into named sessions, close them to free up RAM, and restore them anytime with one click — nothing lost, nothing forgotten.

---

## Features

- **Save sessions** — save all or selected tabs into a named session with one click
- **Selective saving** — choose exactly which tabs to save before closing; unchecked tabs stay open
- **Restore sessions** — reopen every tab from a saved session instantly
- **Edit sessions** — rename a session or remove individual tabs without deleting it
- **Close matching tabs** — close open tabs that belong to a saved session
- **Close all tabs** — clear the entire window, open a fresh tab, and see how much RAM was freed
- **Safe deletions** — every destructive action asks for confirmation first
- **Persistent storage** — sessions survive popup close and browser restarts

---

## Install

### Chrome
1. Go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select the `nestab` folder

### Opera
1. Go to `opera://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select the `nestab` folder

---

## How to use

1. Click the **NesTAb** icon in your toolbar
2. Click **Save Session** → name it → select tabs → confirm
3. Your session appears in the list

Each session card has four actions:

| Button | Action |
|--------|--------|
| ✏️ Pencil | Edit session name and tabs |
| ↗️ Restore | Reopen all saved tabs |
| X | Close open tabs matching this session |
| 🗑️ Trash | Delete the session permanently |

---

## Tech stack

- HTML · CSS · JavaScript
- Chrome Extension Manifest V3
- `localStorage` for persistence
- Google Material Symbols (outline) via CDN

---

## License

MIT © 2026 — built for personal use, free for everyone
