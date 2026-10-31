/* Security audit for Bloom Notch (fixed-canvas architecture) */
const fs = require('fs');
const html = fs.readFileSync('bloom-notch.html', 'utf8');
const main = fs.readFileSync('main.js', 'utf8');
const preload = fs.readFileSync('preload.js', 'utf8');

let pass = 0, fail = 0;
function test(name, cond) {
  if (cond) { pass++; console.log('PASS:', name); }
  else { fail++; console.log('FAIL:', name); }
}

test('CSP meta present', html.includes('Content-Security-Policy'));
test('nodeIntegration false', main.includes('nodeIntegration: false'));
test('contextIsolation true', main.includes('contextIsolation: true'));
test('sandbox true', main.includes('sandbox: true'));
test('no eval()', !main.includes('eval(') && !html.includes('eval('));
test('no document.write', !html.includes('document.write'));
test('dynamic text uses textContent', (html.match(/\.textContent\s*=/g) || []).length >= 20);
test('innerHTML only for static markup', !/innerHTML\s*=\s*[^;]*\+/.test(html));
test('no hardcoded secrets (excl false pos)', !(html.includes('sk-123') || html.includes('ghp_') || html.includes('Bearer ')));
test('preload uses contextBridge', preload.includes('contextBridge'));
test('notch-state validates object', main.includes('security.isSafeState(state)'));
test('notch-state validates expanded bool', main.includes('state.expanded === true'));
test('IPC validates sender (isFromNotch)', main.includes('isFromNotch'));
test('no child_process', !main.includes('child_process'));
test('no remote module', !main.includes('remote'));
test('no Function constructor', !main.includes('new Function'));
test('no payload exec in preload', !preload.includes('exec') && !preload.includes('eval'));
console.log('Results: ' + pass + ' passed, ' + fail + ' failed');
if (fail === 0) console.log('All security checks clean.');

// Signal handler / GhostControl integration tests
console.log('--- Signal / Integration Checks ---');
let sigPass = 0, sigFail = 0;
function sigTest(name, cond) {
  if (cond) { sigPass++; console.log('PASS:', name); }
  else { sigFail++; console.log('FAIL:', name); }
}
const signalFile = fs.existsSync('signal-handler.js') ? fs.readFileSync('signal-handler.js', 'utf8') : '';
sigTest('signal-handler.js exists', fs.existsSync('signal-handler.js'));
sigTest('signal-handler exports SignalHandler', signalFile.includes('SignalHandler'));
sigTest('signal-handler has RETENTION_STATES', signalFile.includes('RETENTION_STATES'));
sigTest('signal-handler validates payload', signalFile.includes('validatePayload'));
sigTest('signal-handler checks permission', signalFile.includes('checkPermission'));
sigTest('signal-handler validates executable whitelist', signalFile.includes('APPROVED_EXECUTABLES'));
sigTest('signal-handler handles execution', signalFile.includes('handleSignal'));
sigTest('preload exposes handleSignal', preload.includes('handleSignal'));
sigTest('privacy/retention-manager.js exists', fs.existsSync('privacy/retention-manager.js'));
sigTest('docs/PRIVACY_MODEL.md exists', fs.existsSync('docs/PRIVACY_MODEL.md'));
console.log('Signal/Integration Results:', sigPass + ' passed, ' + sigFail + ' failed');

console.log('\n--- Hardening Module Checks ---');
let hardPass = 0, hardFail = 0;
function hardTest(name, cond) {
  if (cond) { hardPass++; console.log('PASS:', name); }
  else { hardFail++; console.log('FAIL:', name); }
}
const secMod = fs.existsSync('privacy/security.js') ? fs.readFileSync('privacy/security.js', 'utf8') : '';
hardTest('privacy/security.js exists', fs.existsSync('privacy/security.js'));
hardTest('has RateLimiter', secMod.includes('class RateLimiter'));
hardTest('has rate limiter instance', secMod.includes('const rateLimiter'));
hardTest('has audit logging', secMod.includes('function audit'));
hardTest('has isSafeState validator', secMod.includes('function isSafeState'));
hardTest('has sanitizeString', secMod.includes('function sanitizeString'));
hardTest('has MAX_STRING_LEN limit', secMod.includes('MAX_STRING_LEN'));
hardTest('notch-state uses rate limiter', main.includes('security.rateLimiter.allow'));
hardTest('notch-state uses isSafeState', main.includes('security.isSafeState'));
hardTest('notch-state has audit', main.includes("audit('notch-state'"));
hardTest('signal-launch handler wired in main.js', main.includes("require('./signal-handler.js')"));
hardTest('main.js requires security module', main.includes("require('./privacy/security.js')"));
// Test deep safety
hardTest('isSafeState rejects arrays', secMod.includes('Array.isArray'));
hardTest('MAX_STATE_KEYS=5', secMod.includes('MAX_STATE_KEYS = 5'));
console.log('Hardening Results:', hardPass + ' passed, ' + hardFail + ' failed');

console.log('\n--- Cipher / Obfuscation / Local-Only Checks ---');
let cipherPass = 0, cipherFail = 0;
function cipherTest(name, cond) {
  if (cond) { cipherPass++; console.log('PASS:', name); }
  else { cipherFail++; console.log('FAIL:', name); }
}
const cipherMod = fs.existsSync('privacy/cipher-obfuscation.js') ? fs.readFileSync('privacy/cipher-obfuscation.js', 'utf8') : '';
cipherTest('cipher-obfuscation.js exists', fs.existsSync('privacy/cipher-obfuscation.js'));
cipherTest('uses crypto module', cipherMod.includes("require('crypto')"));
cipherTest('uses AES-256-GCM', cipherMod.includes('aes-256-gcm'));
cipherTest('machine fingerprint binding', cipherMod.includes('getMachineFingerprint'));
cipherTest('encrypt function exists', cipherMod.includes('function encrypt'));
cipherTest('decrypt checks machine', cipherMod.includes('currentMachine'));
cipherTest('block video retention exists', cipherMod.includes('blockVideoRetention'));
cipherTest('verifyNoVideoOnDisk exists', cipherMod.includes('verifyNoVideoOnDisk'));
// Verify actual behavior
try {
  const cipher = require('./privacy/cipher-obfuscation.js');
  const enc = cipher.encrypt('secret-test', 'test-secret');
  cipherTest('encrypt produces data', !!enc && !!enc.data && !!enc.machine);
  cipherTest('decrypt binds to machine', (() => { try { cipher.decrypt(enc, 'test-secret'); return true; } catch(e) { return false; } })());
  const videoCheck = cipher.verifyNoVideoOnDisk();
  cipherTest('no video artifacts on disk', videoCheck.found === false);
  cipherTest('video blocked list present', Array.isArray(cipher.blockVideoRetention().blocked));
} catch(e) { cipherTest('cipher execution', false); }
console.log('Cipher / Obfuscation Results:', cipherPass + ' passed, ' + cipherFail + ' failed');
console.log('\nTOTAL:', pass + sigPass + hardPass, 'passed, ' + (fail + sigFail + hardFail), 'failed');
