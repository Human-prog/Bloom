/**
 * UI verification with mocked integration IPC.
 * Renders connected Spotify + Notion states, captures screenshots, and checks text.
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

app.disableHardwareAcceleration();
app.setPath('userData', path.join(app.getPath('temp'), 'bloom-feature-verify-' + Date.now()));

const now = new Date();
const y = now.getFullYear();
const m = now.getMonth();
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const day = now.getDate();

const mockEvents = [
  {
    id: 'event-1',
    title: 'Design review',
    start: ymd(new Date(y, m, day)),
    end: '',
    allDay: true,
    location: 'Studio',
    url: '',
    source: 'notion',
  },
  {
    id: 'event-2',
    title: 'Team standup',
    start: new Date(y, m, day, 9, 30).toISOString(),
    end: '',
    allDay: false,
    location: 'Zoom',
    url: '',
    source: 'notion',
  },
];

ipcMain.handle('integration-status', () => ({
  ok: true,
  spotify: {
    configured: true,
    connected: true,
    clientId: '0123456789abcdef0123456789abcdef',
    redirectUri: 'http://127.0.0.1:8765/callback',
  },
  notion: {
    connected: true,
    databaseId: '01234567-89ab-cdef-0123-456789abcdef',
    databaseTitle: 'Bloom Events',
    dateProperty: 'Date',
    titleProperty: 'Name',
  },
  autoLaunch: { supported: true, enabled: false },
  app: { version: '1.0.0', packaged: true },
}));

ipcMain.handle('spotify-now-playing', () => ({
  ok: true,
  playback: {
    connected: true,
    active: true,
    playing: true,
    title: 'Blinding Lights',
    artists: 'The Weeknd',
    album: 'After Hours',
    progress: 62000,
    duration: 200040,
    device: 'Arega PC',
    deviceId: 'device123',
    updatedAt: Date.now(),
  },
}));

ipcMain.handle('spotify-control', () => ({ ok: true }));
ipcMain.handle('notion-events', () => ({ ok: true, events: mockEvents }));
ipcMain.handle('retention-state', () => 'idle');
ipcMain.handle('retention-inventory', () => []);
ipcMain.handle('retention-clear', () => ({ cleared: true }));
ipcMain.handle('signal-handle', () => ({ success: false, stage: 'PERMISSION', reason: 'Blocked in verification', cleaned: true }));

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 480,
    height: 460,
    x: 0,
    y: 0,
    show: true,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    skipTaskbar: true,
    focusable: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.loadFile(path.join(__dirname, 'bloom-notch.html'));

  win.webContents.once('did-finish-load', async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    await sleep(800);

    await win.webContents.executeJavaScript(`
      document.getElementById('bloom-notch').classList.add('expanded');
      document.getElementById('bloom-notch').classList.remove('collapsed');
      true;
    `);
    await sleep(400);

    const results = {};

    await win.webContents.executeJavaScript("document.getElementById('tab-music').click(); true;");
    await sleep(600);
    results.music = await win.webContents.executeJavaScript(`(() => ({
      title: document.getElementById('sp-title').textContent,
      artist: document.getElementById('sp-artist').textContent,
      source: document.getElementById('sp-source').textContent,
      progress: document.getElementById('sp-progress').style.width,
      disconnectVisible: getComputedStyle(document.getElementById('sp-disconnect')).display !== 'none',
    }))()`);
    fs.writeFileSync(path.join(__dirname, 'preview-music.png'), (await win.webContents.capturePage()).toPNG());

    await win.webContents.executeJavaScript(`
      document.getElementById('tab-prefs').click();
      document.querySelector('.tab-content').scrollTop = 150;
      true;
    `);
    await sleep(400);
    results.prefs = await win.webContents.executeJavaScript(`(() => ({
      spotifyBadge: document.getElementById('conn-spotify-badge').textContent,
      spotifyHint: document.getElementById('conn-spotify-hint').textContent,
      notionBadge: document.getElementById('conn-notion-badge').textContent,
      notionHint: document.getElementById('conn-notion-hint').textContent,
      clientId: document.getElementById('spotify-client-id').value,
      database: document.getElementById('notion-database').value,
      autoHint: document.getElementById('auto-launch-hint').textContent,
    }))()`);
    fs.writeFileSync(path.join(__dirname, 'preview-prefs.png'), (await win.webContents.capturePage()).toPNG());

    await win.webContents.executeJavaScript(`
      document.getElementById('tab-cal').click();
      document.querySelector('.tab-content').scrollTop = 0;
      true;
    `);
    await sleep(600);
    results.calendar = await win.webContents.executeJavaScript(`(() => ({
      sub: document.getElementById('cal-sub').textContent,
      events: Array.from(document.querySelectorAll('#cal-events .event-title')).map(e => e.textContent),
      metas: Array.from(document.querySelectorAll('#cal-events .event-meta')).map(e => e.textContent),
      times: Array.from(document.querySelectorAll('#cal-events .event-time')).map(e => e.textContent),
    }))()`);
    fs.writeFileSync(path.join(__dirname, 'preview-cal.png'), (await win.webContents.capturePage()).toPNG());

    console.log('FEATURE_JSON_START');
    console.log(JSON.stringify(results, null, 2));
    console.log('FEATURE_JSON_END');
    app.exit(0);
  });
});

setTimeout(() => {
  console.log('FEATURE_TIMEOUT');
  app.exit(1);
}, 25000);
