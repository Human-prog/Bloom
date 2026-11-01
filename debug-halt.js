/**
 * Halt / exit debug log — writes to userData/debug-halt.log
 * Used to diagnose why emergency-stop / quit does not fully terminate.
 */
const fs = require('fs');
const path = require('path');

function getLogPath() {
  try {
    const { app } = require('electron');
    return path.join(app.getPath('userData'), 'debug-halt.log');
  } catch (e) {
    return path.join(__dirname, '..', 'debug-halt.log');
  }
}

function log(level, msg) {
  try {
    const p = getLogPath();
    const line = '[' + new Date().toISOString() + '] ' + (level || 'INFO') + ' | ' + (msg || '') + '\n';
    fs.appendFileSync(p, line);
  } catch (e) { /* best effort */ }
}

module.exports = { log, getLogPath };
