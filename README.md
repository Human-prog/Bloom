# Bloom Notch Desktop Overlay

Always-on-top notch overlay (180×32 collapsed / 440×440 expanded) for Spotify playback, Notion events, and custom integrations — built with Electron, Apple HIG, offline-first, zero video retention.

[![GitHub release](https://img.shields.io/github/v/release/Human-prog/Bloom?include_prereleases)](https://github.com/Human-prog/Bloom/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Download

| Asset | Description |
|-------|-------------|
| **Bloom-Notch-Setup-1.0.0.exe** | NSIS per-user installer (Start Menu + desktop shortcuts) |
| **Bloom-Notch-Portable-1.0.0.exe** | Portable — no install required |

👉 **[Releases page](https://github.com/Human-prog/Bloom/releases/latest)**

## Features

### Spotify Connect
- Embedded Client ID (public identifier, PKCE-safe) — no secret needed
- One-click Connect: browser opens → log in → done
- Now playing, playback control, device selection

### Notion Integration
- Internal integration token + database ID
- Query calendar events by date range
- No public Calendar API needed

### Custom Integration Plugin
- Configure any HTTPS API via `custom-integrations.json` or `registerApp()`
- OAuth (PKCE) or static token auth
- Injection-guarded: `sanitizeConfig` whitelist, `isSafeUrl` (HTTPS only), regex-locked endpoint paths, no `eval`/shell execution
- Presets included: Discord, GitHub, Obsidian, Todoist, Figma, Google Calendar

### Offline Tools
- **Quick-notes** — AES-256 encrypted notes, zero retention on quit/halt
- **Timer / Pomodoro** — local only, no API
- **System stats** — CPU/memory via native Electron (no external calls)
- **Media control** — native session metadata + play/pause
- **Launcher confirmation gate** — explicit user approval before opening external apps
- **Dark mode toggle**

### Privacy
- AES-256-GCM local token vault (machine-bound)
- Zero video retention
- No child processes, no `remote` module, no `eval`
- `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`

## Install

**Per-user installer** (recommended):
1. Download `Bloom-Notch-Setup-1.0.0.exe` from [Releases](https://github.com/Human-prog/Bloom/releases/latest)
2. Run it — installs per-user, creates Start Menu + desktop shortcuts
3. Launch from search: "Bloom Notch"

> ⚠️ **Windows SmartScreen warning:** The installer is not code-signed (no publisher certificate yet). Windows may show *"Windows protected your PC"*. Click **"More info"** → **"Run anyway"** to proceed. The app is open source and contains no malicious code — see the source on GitHub.

**Portable:**
1. Download `Bloom-Notch-Portable-1.0.0.exe`
2. Run directly — no installation required

> ⚠️ **Same SmartScreen note applies** — click "More info" → "Run anyway".

## Build from Source

```powershell
# Clone
git clone https://github.com/Human-prog/Bloom.git
cd Bloom/bloom-notch-app

# Install dependencies
npm install

# Build packages
npm run dist          # NSIS installer + portable
npm run pack          # directory output only
```

Requires Node.js ≥18.

## Security

41/41 automated security tests pass (`npm test`). See `security-test.js` for the full audit.

```
PASS: CSP meta present
PASS: nodeIntegration false
PASS: contextIsolation true
PASS: sandbox true
PASS: no eval()
PASS: no document.write
PASS: no child_process
PASS: no remote module
...
All security checks clean.
```

## Adding a New App

Use `registerApp()` from `integrations/custom.js`:

```js
const custom = require('./integrations/custom');
custom.registerApp({
  name: 'MyApp',
  id: 'myapp',
  baseUrl: 'https://api.myapp.com',
  authType: 'token',   // or 'oauth'
  endpoints: {
    status: { method: 'GET', path: '/status' }
  }
});
```

Only `name`, `id`, `baseUrl`, `authType`, and `endpoints` are required — `sanitizeConfig` handles validation, HTTPS enforcement, and path locking.

## License

MIT License — see `LICENSE` for details.

---

Built with Electron. Not affiliated with Spotify, Notion, or any other service.
