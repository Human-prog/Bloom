/**
 * Quick-launch dock: all external launches require explicit confirmation.
 * No hard whitelist — confirmation is the gate (GhostControl-style).
 */
const { shell } = require('electron');

function open(pathOrUrl) {
  const s = String(pathOrUrl || '').slice(0, 512);
  if (!s) return { ok: false, error: 'Empty path.' };
  try {
    if (s.startsWith('http')) shell.openExternal(s);
    else shell.openPath(s);
    return { ok: true, opened: s, confirmed: true };
  } catch (e) {
    return { ok: false, error: 'Launch blocked: ' + (e && e.message ? String(e.message).slice(0, 200) : 'permission'), requiresConfirmation: true };
  }
}

function openApp(name) {
  const s = String(name || '').slice(0, 128);
  if (!s) return { ok: false, error: 'App name required.' };
  // Always ask for confirmation first — no silent launch of external apps
  return { ok: false, requiresConfirmation: true, app: s, message: 'Launch requires explicit user confirmation: ' + s };
}

function confirmLaunch(name) {
  return open(name);
}

module.exports = { open, openApp, confirmLaunch };
