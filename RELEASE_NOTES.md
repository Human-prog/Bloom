## Bloom Notch Desktop Overlay v1.0.0

### Included
- **Bloom-Notch-Setup-1.0.0.exe** — NSIS per-user installer (Start Menu + desktop shortcuts)
- **Bloom-Notch-Portable-1.0.0.exe** — Portable (no install required)

### Features
- Spotify Connect (embedded Client ID, PKCE OAuth, one-click)
- Notion DB integration (internal token)
- Custom integration plugin (HTTPS-only, injection-guarded, `registerApp` helper)
- Quick-notes (offline AES-256 encrypted)
- Timer / Pomodoro (local only)
- System stats (native Electron)
- Google Calendar preset + media control + launcher confirmation gate
- Dark mode toggle
- Emergency halt = full process exit

### Security
- 41/41 security tests pass
- sandbox: true, contextIsolation: true, nodeIntegration: false
- AES-256-GCM local token vault (machine-bound)
- HTTPS-only custom plugin URLs
- Zero video retention

Built with Electron 45.1.0, x64, Windows.
