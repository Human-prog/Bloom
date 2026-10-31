/**
 * Non-secret app configuration, stored under Electron userData.
 * Tokens never go here; they live in the encrypted token vault.
 */
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function read() {
  try {
    const raw = fs.readFileSync(configPath(), 'utf8');
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
  } catch (e) {
    return {};
  }
}

function write(obj) {
  const target = configPath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(obj || {}, null, 2), { mode: 0o600 });
}

function get(key, fallback) {
  const obj = read();
  return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : fallback;
}

function set(key, value) {
  const obj = read();
  obj[key] = value;
  write(obj);
}

function remove(key) {
  const obj = read();
  delete obj[key];
  write(obj);
}

module.exports = { read, write, get, set, remove, configPath };
