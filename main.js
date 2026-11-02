const { app, BrowserWindow, screen, ipcMain, shell } = require('electron');
const path = require('path');
const security = require('./privacy/security.js');
const spotify = require('./integrations/spotify');
const notion = require('./integrations/notion');

const CANVAS = { width: 480, height: 460 };
const COLLAPSED = { width: 180, height: 32 };
const EXPANDED = { width: 440, height: 440 };
const SHOULDER = 6;
const HIT_PAD = 2;

let mainWindow = null;
let pointerInside = false;
let pollTimer = null;
const uiState = { expanded: false };

function isUsableWindow() {
  return mainWindow && !mainWindow.isDestroyed();
}

function isFromNotch(event) {
  return isUsableWindow() && event.sender === mainWindow.webContents;
}

function cleanError(error) {
  const message = error && error.message ? String(error.message) : 'Something went wrong.';
  return message.replace(/\s+/g, ' ').slice(0, 240);
}

function canAutoLaunch() {
  return app.isPackaged && !process.env.PORTABLE_EXECUTABLE_FILE;
}

function autoLaunchState() {
  if (!canAutoLaunch()) {
    return { supported: false, enabled: false, reason: 'Available in the installed app.' };
  }
  try {
    const settings = app.getLoginItemSettings();
    return { supported: true, enabled: settings.openAtLogin === true };
  } catch (e) {
    return { supported: false, enabled: false, reason: 'Could not read login settings.' };
  }
}

function hotRect() {
  if (uiState.expanded) {
    return {
      x: Math.floor((CANVAS.width - EXPANDED.width) / 2) - HIT_PAD,
      y: 0,
      width: EXPANDED.width + HIT_PAD * 2,
      height: EXPANDED.height + HIT_PAD,
    };
  }
  const w = COLLAPSED.width + SHOULDER * 2;
  return {
    x: Math.floor((CANVAS.width - w) / 2),
    y: 0,
    width: w,
    height: COLLAPSED.height + HIT_PAD,
  };
}

function positionWindow() {
  if (!isUsableWindow()) return;
  const d = screen.getPrimaryDisplay();
  const { x, y, width } = d.bounds;
  mainWindow.setBounds({
    x: Math.round(x + (width - CANVAS.width) / 2),
    y: Math.round(y),
    width: CANVAS.width,
    height: CANVAS.height,
  });
}

function applyPanelLevel() {
  if (!isUsableWindow()) return;
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
}

function setPointerInside(inside) {
  if (!isUsableWindow() || inside === pointerInside) return;
  pointerInside = inside;
  mainWindow.setIgnoreMouseEvents(!inside, { forward: true });
  if (mainWindow.webContents) mainWindow.webContents.send('notch-pointer', inside);
}

function startPointerWatch() {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    if (!isUsableWindow() || !mainWindow.isVisible()) return;
    const cursor = screen.getCursorScreenPoint();
    const b = mainWindow.getBounds();
    const rect = hotRect();
    const x = cursor.x - b.x;
    const y = cursor.y - b.y;
    const inside = x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
    setPointerInside(inside);
  }, 32);
}

function stopPointerWatch() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

// Optional diagnostics: BLOOM_VERIFY=1 exercises the renderer/IPC path, prints
// one JSON line, then exits. Never runs in normal use.
async function runSelfCheck() {
  try {
    const data = await mainWindow.webContents.executeJavaScript(`(async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const notch = document.getElementById('bloom-notch');
      notch.classList.add('expanded');
      notch.classList.remove('collapsed');
      await sleep(350);
      const bridge = typeof window.electronAPI;
      const retention = await window.electronAPI.getRetentionState();
      const inventory = await window.electronAPI.getDataInventory();
      const gate = await window.electronAPI.handleSignal({ action: 'launch_app', executable: 'notepad.exe', arguments: [] });
      const cleared = await window.electronAPI.clearTransientData();
      await sleep(250);
      const integrations = await window.electronAPI.integrations.status();
      const spotifyProbe = await window.electronAPI.integrations.spotify.nowPlaying();
      const notionProbe = await window.electronAPI.integrations.notion.events(new Date().toISOString(), new Date(Date.now() + 86400000).toISOString());
      await sleep(250);
      const connectProbe = await window.electronAPI.integrations.spotify.connect('');
      await sleep(250);
      const notionConnectProbe = await window.electronAPI.integrations.notion.connect('bad', 'bad');
      await sleep(250);
      const notionNetworkProbe = await window.electronAPI.integrations.notion.connect(
        'secret_' + 'a'.repeat(43),
        '01234567-89ab-cdef-0123-456789abcdef'
      );
      await sleep(250);
      let autoProbe = null;
      if (integrations.autoLaunch && integrations.autoLaunch.supported) {
        const on = await window.electronAPI.autoLaunch.set(true);
        await sleep(250);
        const off = await window.electronAPI.autoLaunch.set(false);
        autoProbe = { on: on, off: off };
      }
      document.getElementById('tab-prefs').click();
      await sleep(250);
      const prefsProbe = {
        spotifyInput: !!document.getElementById('spotify-client-id'),
        notionToken: !!document.getElementById('notion-token'),
        notionDatabase: !!document.getElementById('notion-database'),
        autoSwitch: !!document.getElementById('sw-autolaunch'),
        spotifyBadge: document.getElementById('conn-spotify-badge').textContent,
        notionBadge: document.getElementById('conn-notion-badge').textContent,
        autoHint: document.getElementById('auto-launch-hint').textContent,
        panelHeight: document.getElementById('panel-prefs').scrollHeight,
      };
      document.getElementById('tab-music').click();
      await sleep(150);
      const musicProbe = {
        source: document.getElementById('sp-source').textContent,
        title: document.getElementById('sp-title').textContent,
        artist: document.getElementById('sp-artist').textContent,
        connectDisplay: getComputedStyle(document.getElementById('sp-connect')).display,
      };
      document.getElementById('tab-cal').click();
      await sleep(150);
      const calProbe = {
        sub: document.getElementById('cal-sub').textContent,
        empty: (document.getElementById('cal-events').textContent || '').trim(),
      };
      document.getElementById('tab-privacy').click();
      await sleep(250);
      return {
        bridge: bridge,
        retention: retention,
        inventoryCount: (inventory || []).length,
        inventoryNames: (inventory || []).map(f => f.name),
        gate: gate,
        cleared: cleared,
        integrations: integrations,
        spotifyProbe: spotifyProbe,
        notionProbe: notionProbe,
        connectProbe: connectProbe,
        notionConnectProbe: notionConnectProbe,
        notionNetworkProbe: notionNetworkProbe,
        autoProbe: autoProbe,
        prefsProbe: prefsProbe,
        musicProbe: musicProbe,
        calProbe: calProbe,
        privState: document.getElementById('priv-state').textContent,
        invRows: document.querySelectorAll('#priv-inventory .data-flow').length,
        qmarks: (document.body.innerText.match(/\\?\\?/g) || []).length,
      };
    })()`);
    console.log('BLOOM_VERIFY:' + JSON.stringify(data));
  } catch (e) {
    console.log('BLOOM_VERIFY_ERROR:' + (e && e.message));
  }
  setTimeout(() => app.exit(0), 200);
}

try {
  require('./privacy/retention-manager.js').retentionManager.clearAll();
} catch (e) { /* optional */ }

function createWindow() {
  mainWindow = new BrowserWindow({
    x: 0, y: 0, width: CANVAS.width, height: CANVAS.height,
    frame: false, transparent: true, backgroundColor: '#00000000',
    hasShadow: false, resizable: false, movable: false, minimizable: false,
    maximizable: false, fullscreenable: false, skipTaskbar: true,
    focusable: true, show: false,
    webPreferences: {
      nodeIntegration: false, contextIsolation: true, sandbox: true,
      backgroundThrottling: false, preload: path.join(__dirname, 'preload.js'),
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'bloom-notch.html'));
  mainWindow.once('ready-to-show', () => {
    positionWindow(); applyPanelLevel();
    mainWindow.showInactive();
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
    startPointerWatch();
  });
  mainWindow.webContents.on('did-finish-load', () => {
    pointerInside = false; uiState.expanded = false;
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
    if (process.env.BLOOM_VERIFY === '1') runSelfCheck();
  });
  if (process.argv.includes('--dev')) mainWindow.webContents.openDevTools({ mode: 'detach' });
  mainWindow.on('closed', () => { stopPointerWatch(); mainWindow = null; });
}

function watchDisplays() {
  const r = () => { positionWindow(); applyPanelLevel(); };
  screen.on('display-added', r); screen.on('display-removed', r);
  screen.on('display-metrics-changed', r);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }
else {
  app.on('second-instance', () => {
    if (!isUsableWindow()) return;
    positionWindow(); mainWindow.showInactive(); applyPanelLevel();
  });
  app.whenReady().then(() => {
    app.setAppUserModelId('com.bloom.notch');
    createWindow(); watchDisplays();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  try { require('./debug-halt').log('QUIT', 'window-all-closed event; platform=' + process.platform); } catch (e) {}
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', () => {
  try { require('./debug-halt').log('QUIT', 'before-quit event'); } catch (e) {}
  stopPointerWatch();
});

ipcMain.on('notch-state', (event, state) => {
  if (!security.rateLimiter.allow(event.sender.id)) { security.audit('throttle', 'notch-state'); return; }
  if (!isUsableWindow() || !isFromNotch(event)) { security.audit('reject', 'notch-state'); return; }
  if (!security.isSafeState(state)) { security.audit('reject', 'notch-state-invalid'); return; }
  uiState.expanded = state.expanded === true;
  security.audit('notch-state', state.expanded ? 'expanded' : 'collapsed');
});

ipcMain.on('app-quit', (event) => {
  if (!security.rateLimiter.allow(event.sender.id)) return;
  if (!isFromNotch(event)) return;
  security.audit('quit', 'requested');
  app.quit();
});

ipcMain.on('signal-launch', (event, payload) => {
  if (!security.rateLimiter.allow(event.sender.id)) { security.audit('throttle', 'signal-launch'); return; }
  if (!isFromNotch(event)) return;
  try {
    const sig = require('./signal-handler.js');
    const result = sig.signalHandler.handleSignal(payload);
    security.audit('signal-launch', result.success ? 'executed' : 'failed');
  } catch (e) { security.audit('signal-launch', 'error'); }
});

// ---- sandboxed preload bridge (invoke handlers) ----
ipcMain.handle('retention-clear', (event) => {
  if (!security.rateLimiter.allow(event.sender.id)) return { cleared: false, reason: 'throttled' };
  if (!isFromNotch(event)) return { cleared: false, reason: 'untrusted' };
  try {
    const rm = require('./privacy/retention-manager.js');
    security.audit('retention', 'clear-requested');
    return rm.retentionManager.clearAll();
  } catch (e) {
    return { cleared: false, reason: 'unavailable' };
  }
});

ipcMain.handle('retention-inventory', (event) => {
  if (!isFromNotch(event)) return [];
  try { return require('./privacy/retention-manager.js').DATA_FLOWS || []; }
  catch (e) { return []; }
});

ipcMain.handle('retention-state', (event) => {
  if (!isFromNotch(event)) return 'idle';
  try { return require('./privacy/retention-manager.js').retentionManager.state || 'idle'; }
  catch (e) { return 'idle'; }
});

ipcMain.handle('signal-handle', (event, payload) => {
  if (!security.rateLimiter.allow(event.sender.id)) {
    security.audit('throttle', 'signal-handle');
    return { success: false, stage: 'THROTTLE', reason: 'Rate limited', cleaned: true };
  }
  if (!isFromNotch(event)) {
    return { success: false, stage: 'REJECT', reason: 'Untrusted sender', cleaned: true };
  }
  try {
    const sig = require('./signal-handler.js');
    const result = sig.signalHandler.handleSignal(payload);
    security.audit('signal-handle', result.success ? 'executed' : 'failed');
    return result;
  } catch (e) {
    security.audit('signal-handle', 'error');
    return { success: false, stage: 'ERROR', reason: e.message, cleaned: true };
  }
});

// EMERGENCY HALT: if user says stop, kill everything immediately
ipcMain.on('emergency-stop', (event) => {
  try { require('./debug-halt').log('STOP', '=== HALT RECEIVED === sender=' + (event && event.sender ? event.sender.id : 'n/a') + ' rateLimit=' + (security.rateLimiter.allow(event.sender.id) ? 'allowed' : 'blocked')); } catch (e) {}
  // Emergency halt bypasses rate limit; always execute
  security.audit('emergency', 'halt-requested');
  try {
    const dbg = require('./debug-halt');
    dbg.log('STOP', 'pollTimer=' + (pollTimer ? 'set' : 'null'));
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; dbg.log('STOP', 'pollTimer cleared'); }
    const windows = BrowserWindow.getAllWindows();
    dbg.log('STOP', 'BrowserWindow count=' + windows.length);
    for (const win of windows) {
      dbg.log('STOP', 'destroying window isDestroyed=' + win.isDestroyed() + ' id=' + (win.id || 'n/a'));
      if (!win.isDestroyed()) win.destroy(); // synchronous destruction
    }
    mainWindow = null;
    dbg.log('STOP', 'mainWindow nulled');
    try {
      require('./privacy/retention-manager.js').retentionManager.triggerEmergencyStop();
      dbg.log('STOP', 'retention manager emergency stop triggered');
    } catch (e) { dbg.log('STOP', 'retention manager error=' + e.message); }
    dbg.log('STOP', 'calling app.exit(1)');
    try { app.exit(1); } catch (e) { dbg.log('STOP', 'app.exit error=' + e.message); }
  } catch (e) {
    try { require('./debug-halt').log('STOP', 'ERROR in halt: ' + (e && e.message ? e.message.substring(0, 200) : String(e))); } catch (e2) {}
  }
  // Nuclear fallback - kill this process tree on Windows
  try {
    const { exec } = require('child_process');
    exec('taskkill /F /PID ' + process.pid, () => {});
  } catch (e) {}
  try { process.exit(1); } catch (e) {}
  try { require('./debug-halt').log('STOP', 'process.kill+exit(1) executed'); } catch (e) {}
});

// ---- integrations (main-process only) ----
ipcMain.handle('integration-status', (event) => {
  if (!isFromNotch(event)) return { ok: false, error: 'Untrusted sender' };
  return {
    ok: true,
    spotify: spotify.status(),
    notion: notion.status(),
    autoLaunch: autoLaunchState(),
    app: { version: app.getVersion(), packaged: app.isPackaged },
  };
});

ipcMain.handle('spotify-set-client-id', (event, payload) => {
  if (!security.rateLimiter.allow(event.sender.id)) return { ok: false, error: 'Too many requests.' };
  if (!isFromNotch(event)) return { ok: false, error: 'Untrusted sender' };
  try {
    const clientId = payload && typeof payload.clientId === 'string' ? payload.clientId.slice(0, 128) : '';
    return { ok: true, status: spotify.setClientId(clientId) };
  } catch (e) {
    return { ok: false, error: cleanError(e) };
  }
});

ipcMain.handle('spotify-connect', async (event, payload) => {
  if (!security.rateLimiter.allow(event.sender.id)) return { ok: false, error: 'Too many requests.' };
  if (!isFromNotch(event)) return { ok: false, error: 'Untrusted sender' };
  try {
    const clientId = payload && typeof payload.clientId === 'string' ? payload.clientId.slice(0, 128) : '';
    const status = await spotify.connect({
      clientId: clientId,
      openExternal: (url) => shell.openExternal(url),
    });
    security.audit('integration', 'spotify-connected');
    return { ok: true, status: status };
  } catch (e) {
    security.audit('integration', 'spotify-connect-failed');
    return { ok: false, error: cleanError(e) };
  }
});

ipcMain.handle('spotify-disconnect', (event) => {
  if (!security.rateLimiter.allow(event.sender.id)) return { ok: false, error: 'Too many requests.' };
  if (!isFromNotch(event)) return { ok: false, error: 'Untrusted sender' };
  try {
    security.audit('integration', 'spotify-disconnected');
    return { ok: true, status: spotify.disconnect() };
  } catch (e) {
    return { ok: false, error: cleanError(e) };
  }
});

ipcMain.handle('spotify-now-playing', async (event) => {
  if (!security.rateLimiter.allow(event.sender.id)) return { ok: false, error: 'Too many requests.' };
  if (!isFromNotch(event)) return { ok: false, error: 'Untrusted sender' };
  try {
    return { ok: true, playback: await spotify.nowPlaying() };
  } catch (e) {
    return { ok: false, error: cleanError(e), code: e && e.code ? e.code : '' };
  }
});

ipcMain.handle('spotify-control', async (event, payload) => {
  if (!security.rateLimiter.allow(event.sender.id)) return { ok: false, error: 'Too many requests.' };
  if (!isFromNotch(event)) return { ok: false, error: 'Untrusted sender' };
  try {
    const action = payload && typeof payload.action === 'string' ? payload.action.slice(0, 16) : '';
    const deviceId = payload && typeof payload.deviceId === 'string' ? payload.deviceId.slice(0, 64) : '';
    const result = await spotify.control(action, deviceId);
    security.audit('integration', 'spotify-' + action);
    return result;
  } catch (e) {
    return { ok: false, error: cleanError(e) };
  }
});

ipcMain.handle('notion-connect', async (event, payload) => {
  if (!security.rateLimiter.allow(event.sender.id)) return { ok: false, error: 'Too many requests.' };
  if (!isFromNotch(event)) return { ok: false, error: 'Untrusted sender' };
  try {
    const token = payload && typeof payload.token === 'string' ? payload.token.slice(0, 240) : '';
    const databaseId = payload && typeof payload.databaseId === 'string' ? payload.databaseId.slice(0, 512) : '';
    const status = await notion.connect({ token: token, databaseId: databaseId });
    security.audit('integration', 'notion-connected');
    return { ok: true, status: status };
  } catch (e) {
    security.audit('integration', 'notion-connect-failed');
    return { ok: false, error: cleanError(e) };
  }
});

ipcMain.handle('notion-disconnect', (event) => {
  if (!security.rateLimiter.allow(event.sender.id)) return { ok: false, error: 'Too many requests.' };
  if (!isFromNotch(event)) return { ok: false, error: 'Untrusted sender' };
  try {
    security.audit('integration', 'notion-disconnected');
    return { ok: true, status: notion.disconnect() };
  } catch (e) {
    return { ok: false, error: cleanError(e) };
  }
});

ipcMain.handle('notion-events', async (event, payload) => {
  if (!security.rateLimiter.allow(event.sender.id)) return { ok: false, error: 'Too many requests.' };
  if (!isFromNotch(event)) return { ok: false, error: 'Untrusted sender' };
  try {
    const start = payload && typeof payload.start === 'string' ? payload.start.slice(0, 64) : '';
    const end = payload && typeof payload.end === 'string' ? payload.end.slice(0, 64) : '';
    const events = await notion.queryRange({ start: start, end: end });
    return { ok: true, events: events };
  } catch (e) {
    return { ok: false, error: cleanError(e), code: e && e.code ? e.code : '' };
  }
});

ipcMain.handle('auto-launch-get', (event) => {
  if (!isFromNotch(event)) return { supported: false, enabled: false };
  return autoLaunchState();
});

ipcMain.handle('auto-launch-set', (event, payload) => {
  if (!security.rateLimiter.allow(event.sender.id)) return { ok: false, error: 'Too many requests.' };
  if (!isFromNotch(event)) return { ok: false, error: 'Untrusted sender' };
  if (!canAutoLaunch()) {
    return { ok: false, supported: false, error: 'Launch at login is only available in the installed app.' };
  }
  try {
    const enabled = payload === true || (payload && payload.enabled === true);
    app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath, args: [] });
    security.audit('settings', enabled ? 'auto-launch-on' : 'auto-launch-off');
    return { ok: true, supported: true, enabled: app.getLoginItemSettings().openAtLogin === true };
  } catch (e) {
    return { ok: false, error: cleanError(e) };
  }
});

// ---- quick-launch dock ----
ipcMain.handle('debug-read-log', (event) => {
  if (!isFromNotch(event)) return { ok: false, error: 'Untrusted sender' };
  try {
    const fs = require('fs');
    const path = require('path');
    const { app } = require('electron');
    const logPath = path.join(app.getPath('userData'), 'debug-halt.log');
    if (fs.existsSync(logPath)) {
      const content = fs.readFileSync(logPath, 'utf8').slice(0, 4000);
      return { ok: true, path: logPath, content: content, size: fs.statSync(logPath).size };
    }
    return { ok: true, path: logPath, content: 'No debug-halt.log found yet.', size: 0 };
  } catch (e) { return { ok: false, error: cleanError(e) }; }
});

ipcMain.handle('launcher-open-app', (event, payload) => {
  if (!isFromNotch(event)) return { ok: false, error: 'Untrusted sender' };
  if (!security.rateLimiter.allow(event.sender.id)) return { ok: false, error: 'Too many requests.' };
  try {
    const launcher = require('./launcher');
    const name = payload && typeof payload.name === 'string' ? payload.name.slice(0, 128) : '';
    const result = launcher.openApp(name);
    security.audit('launcher', 'open-app-request:' + name);
    return result;
  } catch (e) { return { ok: false, error: cleanError(e) }; }
});

ipcMain.handle('launcher-confirm', (event, payload) => {
  if (!isFromNotch(event)) return { ok: false, error: 'Untrusted sender' };
  if (!security.rateLimiter.allow(event.sender.id)) return { ok: false, error: 'Too many requests.' };
  try {
    const launcher = require('./launcher');
    const name = payload && typeof payload.name === 'string' ? payload.name.slice(0, 128) : '';
    const result = launcher.confirmLaunch(name);
    security.audit('launcher', 'confirm-launch:' + name);
    return result;
  } catch (e) { return { ok: false, error: cleanError(e) }; }
});

// ---- generic custom integration plugin ----
ipcMain.handle('custom-list', (event) => {
  if (!isFromNotch(event)) return { ok: false, error: 'Untrusted sender' };
  try {
    const custom = require('./integrations/custom');
    return custom.status();
  } catch (e) { return { ok: false, error: cleanError(e) }; }
});

ipcMain.handle('custom-status', (event, payload) => {
  if (!security.rateLimiter.allow(event.sender.id)) return { ok: false, error: 'Too many requests.' };
  if (!isFromNotch(event)) return { ok: false, error: 'Untrusted sender' };
  try {
    const custom = require('./integrations/custom');
    const id = payload && typeof payload.id === 'string' ? payload.id.slice(0, 32) : '';
    return custom.status(id || undefined);
  } catch (e) { return { ok: false, error: cleanError(e) }; }
});

ipcMain.handle('custom-connect', async (event, payload) => {
  if (!security.rateLimiter.allow(event.sender.id)) return { ok: false, error: 'Too many requests.' };
  if (!isFromNotch(event)) return { ok: false, error: 'Untrusted sender' };
  try {
    const custom = require('./integrations/custom');
    const cfg = (payload && payload.cfg && typeof payload.cfg === 'object' && !Array.isArray(payload.cfg)) ? payload.cfg : null;
    const token = payload && typeof payload.token === 'string' ? payload.token.slice(0, 240) : null;
    const openExternal = (url) => { try { if (url && typeof url === 'string') shell.openExternal(url); } catch (e) {} };
    const result = await custom.connect({ cfg: cfg, token: token, openExternal: openExternal });
    security.audit('integration', 'custom-connect');
    return { ok: true, ...result };
  } catch (e) {
    security.audit('integration', 'custom-connect-failed');
    return { ok: false, error: cleanError(e) };
  }
});

ipcMain.handle('custom-disconnect', (event, payload) => {
  if (!security.rateLimiter.allow(event.sender.id)) return { ok: false, error: 'Too many requests.' };
  if (!isFromNotch(event)) return { ok: false, error: 'Untrusted sender' };
  try {
    const custom = require('./integrations/custom');
    const id = payload && typeof payload.id === 'string' ? payload.id.slice(0, 32) : '';
    return custom.disconnect(id);
  } catch (e) { return { ok: false, error: cleanError(e) }; }
});

ipcMain.handle('custom-invoke', async (event, payload) => {
  if (!security.rateLimiter.allow(event.sender.id)) return { ok: false, error: 'Too many requests.' };
  if (!isFromNotch(event)) return { ok: false, error: 'Untrusted sender' };
  try {
    const custom = require('./integrations/custom');
    const id = payload && typeof payload.id === 'string' ? payload.id.slice(0, 32) : '';
    const endpoint = payload && typeof payload.endpoint === 'string' ? payload.endpoint.slice(0, 32) : '';
    const p = payload && payload.payload && typeof payload.payload === 'object' && !Array.isArray(payload.payload) ? payload.payload : {};
    const result = await custom.invokeEndpoint(id, endpoint, p);
    security.audit('integration', 'custom-invoke-' + endpoint);
    return result;
  } catch (e) {
    return { ok: false, error: cleanError(e) };
  }
});
