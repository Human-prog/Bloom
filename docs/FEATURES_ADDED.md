# Features Added (All 7)

1. **Quick-notes** (`notes.js`) — offline AES-256 notes, `saveNotes`/`getNotes`
2. **Timer** (`timer.js`) — local Pomodoro, `start`/`stop`/`status`
3. **System stats** (`system-stats.js`) — Electron native OS module, no external API
4. **Calendar expand** (`custom-presets.json`) — Google Calendar preset added
5. **Media control native** (`preload.js`) — `mediaControl` (metadata, play/pause) via `ipcRenderer`
6. **Quick-launch dock** (`launcher.js`) — `openApp` for approved apps (Spotify, Notion, Chrome, Code)
7. **Dark mode** (`theme.js`) — toggle function + CSS vars (`--bg`, `--fg`)

All offline-safe except Calendar/OAuth (user-controlled endpoint). Security: HTTPS-only preserved, no eval, sanitizeConfig applies to presets.
