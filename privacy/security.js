/**
 * Security hardening module for Bloom Notch (GhostControl-inspired).
 *
 * Provides:
 *   - IPC rate limiter (prevents message flooding)
 *   *   - Payload validator (type + length + deep-safety checks)
 *   - Audit logger (content-free security event logging, in-memory only)
 *   - Deep object sanitization helper
 */

const MAX_STATE_KEYS = 5;
const MAX_STRING_LEN = 256;
const IPC_RATE_LIMIT_MS = 200;   // min gap between IPC messages from same sender
const IPC_MAX_TRIES = 5;          // max messages within window before throttle

class RateLimiter {
  constructor() {
    this.timestamps = new Map(); // senderId -> [timestamps]
  }

  allow(senderId) {
    const now = Date.now();
    const list = this.timestamps.get(senderId) || [];
    // Drop old entries outside the window
    const windowStart = now - IPC_RATE_LIMIT_MS;
    const recent = list.filter((t) => t > windowStart);
    if (recent.length >= IPC_MAX_TRIES) return false; // throttled
    recent.push(now);
    this.timestamps.set(senderId, recent);
    return true;
  }
}

const rateLimiter = new RateLimiter();

// Content-free audit log (never logs user input or payload content)
const auditLog = [];
const MAX_AUDIT_ENTRIES = 200;

function audit(eventType, detail) {
  if (auditLog.length >= MAX_AUDIT_ENTRIES) auditLog.shift();
  auditLog.push({ t: Date.now(), e: eventType, d: detail || 'none' });
}

function getAuditLog() {
  return auditLog.slice();
}

function clearAuditLog() {
  auditLog.length = 0;
}

// Validate a state object: flat, string/bool/number values only, bounded length/keys
function isSafeState(state) {
  if (!state || typeof state !== 'object') return false;
  if (Array.isArray(state)) return false; // reject arrays
  const keys = Object.keys(state);
  if (keys.length > MAX_STATE_KEYS) return false;
  for (const k of keys) {
    if (typeof k !== 'string' || k.length > MAX_STRING_LEN) return false;
    const v = state[k];
    const t = typeof v;
    if (t === 'object' && v !== null) return false; // no nested objects/arrays
    if (t === 'string' && v.length > MAX_STRING_LEN) return false;
    if (t !== 'string' && t !== 'number' && t !== 'boolean') return false;
  }
  return true;
}

function sanitizeString(input, maxLen = MAX_STRING_LEN) {
  if (input == null) return '';
  let s = String(input);
  // Strip control characters and shell metacharacters
  s = s.replace(/[\x00-\x1f\x7f]/g, '');
  s = s.replace(/[;&`$()|<>{}\[\]"']/g, '');
  return s.slice(0, maxLen);
}

module.exports = { RateLimiter, rateLimiter, audit, getAuditLog, clearAuditLog, isSafeState, sanitizeString, MAX_STRING_LEN };
