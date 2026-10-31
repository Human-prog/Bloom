/**
 * Encrypted token vault for Bloom Notch.
 *
 * - AES-256-GCM via privacy/cipher-obfuscation.js
 * - Bound to this machine's fingerprint
 * - Stored under Electron userData, never in the project folder
 * - Never logged
 */
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const cipher = require('../privacy/cipher-obfuscation');

function vaultPath() {
  return path.join(app.getPath('userData'), 'tokens.enc');
}

function readAll() {
  try {
    const raw = fs.readFileSync(vaultPath(), 'utf8');
    const payload = JSON.parse(raw);
    const json = cipher.decrypt(payload);
    const obj = JSON.parse(json);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
    return obj;
  } catch (e) {
    // Missing, corrupted, or bound to another machine: fail closed.
    return {};
  }
}

function writeAll(all) {
  const payload = cipher.encrypt(JSON.stringify(all || {}));
  fs.mkdirSync(path.dirname(vaultPath()), { recursive: true });
  fs.writeFileSync(vaultPath(), JSON.stringify(payload), { mode: 0o600 });
}

function get(provider) {
  const all = readAll();
  return all[provider] || null;
}

function set(provider, tokens) {
  const all = readAll();
  all[provider] = tokens || {};
  writeAll(all);
}

function remove(provider) {
  const all = readAll();
  delete all[provider];
  writeAll(all);
}

function has(provider) {
  const t = get(provider);
  return !!(t && t.access_token);
}

function clear() {
  try { fs.unlinkSync(vaultPath()); } catch (e) { /* already gone */ }
}

module.exports = { get, set, remove, has, clear, vaultPath };
