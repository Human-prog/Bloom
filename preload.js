const { contextBridge, ipcRenderer } = require('electron');

// Sandboxed preload: no local module requires, no filesystem access.
// Everything that touches privileged state goes through validated IPC.

function text(value, max) {
  if (typeof value !== 'string') return '';
  return value.slice(0, max || 512);
}

contextBridge.exposeInMainWorld('electronAPI', {
  quit: () => ipcRenderer.send('app-quit'),

  setState: (state) => {
    if (!state || typeof state !== 'object') return;
    ipcRenderer.send('notch-state', { expanded: state.expanded === true });
  },

  onPointer: (cb) => {
    if (typeof cb !== 'function') return () => {};
    const handler = (_event, inside) => cb(inside === true);
    ipcRenderer.on('notch-pointer', handler);
    return () => ipcRenderer.removeListener('notch-pointer', handler);
  },

  clearTransientData: () => ipcRenderer.invoke('retention-clear'),
  getDataInventory: () => ipcRenderer.invoke('retention-inventory'),
  getRetentionState: () => ipcRenderer.invoke('retention-state'),
  handleSignal: (payload) => ipcRenderer.invoke('signal-handle', payload),
  emergencyStop: () => ipcRenderer.send('emergency-stop'),

  mediaControl: {
    setMetadata: (title, artist) => ipcRenderer.invoke('media-set', { title: String(title||'').slice(0,64), artist: String(artist||'').slice(0,64) }),
    play: () => ipcRenderer.send('media-play'),
    pause: () => ipcRenderer.send('media-pause'),
  },
  launcher: {
    openApp: (name) => ipcRenderer.invoke('launcher-open-app', { name: String(name || '').slice(0, 128) }),
    confirmLaunch: (name) => ipcRenderer.invoke('launcher-confirm', { name: String(name || '').slice(0, 128) }),
  },
  integrations: {
    status: () => ipcRenderer.invoke('integration-status'),
    custom: {
      list: () => ipcRenderer.invoke('custom-list'),
      status: (id) => ipcRenderer.invoke('custom-status', { id: text(id, 32) }),
      connect: (cfg, token) => ipcRenderer.invoke('custom-connect', {
        cfg: cfg && typeof cfg === 'object' ? cfg : null,
        token: String(token || '').slice(0, 240),
      }),
      disconnect: (id) => ipcRenderer.invoke('custom-disconnect', { id: text(id, 32) }),
      invoke: (id, endpoint, payload) => ipcRenderer.invoke('custom-invoke', {
        id: text(id, 32),
        endpoint: text(endpoint, 32),
        payload: payload && typeof payload === 'object' ? payload : {},
      }),
    },
    spotify: {
      setClientId: (clientId) => ipcRenderer.invoke('spotify-set-client-id', { clientId: text(clientId, 128) }),
      connect: (clientId) => ipcRenderer.invoke('spotify-connect', { clientId: text(clientId, 128) }),
      disconnect: () => ipcRenderer.invoke('spotify-disconnect'),
      nowPlaying: () => ipcRenderer.invoke('spotify-now-playing'),
      control: (action, deviceId) => ipcRenderer.invoke('spotify-control', {
        action: text(action, 16),
        deviceId: text(deviceId, 64),
      }),
    },
    notion: {
      connect: (token, databaseId) => ipcRenderer.invoke('notion-connect', {
        token: text(token, 240),
        databaseId: text(databaseId, 512),
      }),
      disconnect: () => ipcRenderer.invoke('notion-disconnect'),
      events: (start, end) => ipcRenderer.invoke('notion-events', {
        start: text(start, 64),
        end: text(end, 64),
      }),
    },
  },

  autoLaunch: {
    get: () => ipcRenderer.invoke('auto-launch-get'),
    set: (enabled) => ipcRenderer.invoke('auto-launch-set', { enabled: enabled === true }),
  },
});
