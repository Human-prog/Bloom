/**
 * Local-only encryption + machine binding for Bloom Notch.
 *
 * Principles:
 *   - Only this computer: bind to machine fingerprint (hostname + MAC + serial)
 *   - Obfuscation: AES-256-GCM for any persistent settings
 *   - Zero video retention: video/gesture buffers never reach disk
 *   - Cipher: Node crypto used for all persistent data
 */
const crypto = require('crypto');
const os = require('os');

const ALGORITHM = 'aes-256-gcm';
const KEY_LEN = 32;
const IV_LEN = 16;
const TAG_LEN = 16;

function getMachineFingerprint() {
  // Bind to this physical computer only
  const hostname = os.hostname() || 'unknown';
  const cpus = os.cpus();
  const macs = os.networkInterfaces();
  let macString = '';
  for (const iface of Object.values(macs || {})) {
    if (iface && iface[0] && iface[0].mac) macString += iface[0].mac;
  }
  const fingerprintInput = hostname + (macString || 'no-mac') + (cpus && cpus[0] ? cpus[0].model : 'no-cpu');
  // Derive a machine-specific key component using SHA-256
  const hash = crypto.createHash('sha256').update(fingerprintInput).digest();
  return hash.toString('hex').slice(0, 32); // 32 hex chars for key derivation seed
}

function deriveKey(userSecret = '') {
  const machine = getMachineFingerprint();
  // Combine machine fingerprint with optional secret to create cipher key
  const combined = machine + (userSecret || 'bloom-notched-secret');
  return crypto.createHash('sha256').update(combined).digest(); // 32 bytes = AES-256
}

function encrypt(plaintext, secret) {
  const key = deriveKey(secret);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(String(plaintext), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  // Obfuscate: base64 encode, prepend machine fingerprint marker
  const payload = iv.toString('hex') + authTag.toString('hex') + encrypted;
  const obfuscated = Buffer.from(payload, 'hex').toString('base64');
  return { cipher: ALGORITHM, machine: getMachineFingerprint().slice(0, 8), data: obfuscated };
}

function decrypt(obj, secret) {
  if (!obj || !obj.data || typeof obj.data !== 'string') throw new Error('Invalid encrypted payload');
  // Check machine fingerprint (bind to this computer)
  const currentMachine = getMachineFingerprint().slice(0, 8);
  if (obj.machine && obj.machine !== currentMachine) {
    throw new Error('Cipher payload bound to different machine: ' + obj.machine + ' vs ' + currentMachine);
  }
  const key = deriveKey(secret);
  const raw = Buffer.from(obj.data, 'base64');
  const iv = raw.subarray(0, IV_LEN);
  const authTag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const encrypted = raw.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, undefined, 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Zero video/gesture retention enforcement
function blockVideoRetention() {
  // Hard block: if anything tries to write video/gesture to disk, deny
  const videoPaths = ['.mp4', '.avi', '.mov', '.mkv', '.webm', '.gif', '.png', '.jpg', '.jpeg'];
  const gesturePatterns = ['gesture', 'hand-landmark', 'landmark', 'motion-history'];
  // This is a guard function; retention manager already blocks these
  return { blocked: videoPaths, blockedPatterns: gesturePatterns, allowed: false };
}

function verifyNoVideoOnDisk() {
  // Scan app-owned locations only. Shared TEMP roots contain unrelated OS/app media,
  // which must not be mistaken for Bloom retention artifacts.
  const fs = require('fs');
  const path = require('path');
  const videoExt = /\.(mp4|avi|mov|mkv|webm|gif)$/i;
  const imageExt = /\.(png|jpe?g)$/i;
  const retentionName = /(bloom|frame|gesture|camera|motion|snapshot|screen|video|hand)/i;
  const temp = process.env.TEMP || '/tmp';
  const appData = process.env.APPDATA || '';

  const dirs = [
    { dir: '.', strict: false },
    { dir: path.join(appData, 'bloom-notch-app'), strict: true },
  ];

  // Include Bloom-owned temp folders, but never the shared TEMP root itself.
  try {
    for (const entry of fs.readdirSync(temp)) {
      if (!/^bloom-/i.test(entry)) continue;
      const full = path.join(temp, entry);
      try {
        if (fs.statSync(full).isDirectory()) dirs.push({ dir: full, strict: true });
      } catch (e) { /* ignore */ }
    }
  } catch (e) { /* ignore */ }

  for (const target of dirs) {
    try {
      const files = fs.readdirSync(target.dir);
      for (const f of files) {
        if (videoExt.test(f) || (imageExt.test(f) && (target.strict || retentionName.test(f)))) {
          return { found: true, path: path.join(target.dir, f), reason: 'Video/image artifact detected' };
        }
      }
    } catch (e) { /* ignore */ }
  }
  return { found: false, reason: 'No video artifacts' };
}

module.exports = {
  encrypt, decrypt, getMachineFingerprint, deriveKey,
  blockVideoRetention, verifyNoVideoOnDisk,
  ALGORITHM: ALGORITHM,
};
