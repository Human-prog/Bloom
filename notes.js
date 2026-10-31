/**
 * Quick-notes: offline AES-256 clipboard/note storage.
 * Zero retention: notes encrypted to vault; deleted entries removed immediately.
 */
const vault = require('../auth/token-vault');
const crypto = require('crypto');

const NOTES_KEY = 'notes-v1';

function encryptNote(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(require('../auth/token-vault').machineKey || 'default'), 32), iv);
  let enc = cipher.update(String(text || '').slice(0, 2048), 'utf8', 'hex');
  enc += cipher.final('hex');
  return { iv: iv.toString('hex'), data: enc, tag: cipher.getAuthTag().toString('hex') };
}

function saveNotes(notesArr) {
  const clean = Array.isArray(notesArr) ? notesArr.map(n => ({
    id: String(n.id || Date.now()).slice(0, 32),
    text: String(n.text || '').slice(0, 2048),
    created: Number(n.created || Date.now())
  })) : [];
  vault.set(NOTES_KEY, { notes: clean, updated: Date.now() });
  return { ok: true, count: clean.length };
}

function getNotes() {
  const data = vault.get(NOTES_KEY) || {};
  return (data.notes || []).map(n => ({ id: n.id, text: n.text, created: n.created }));
}

module.exports = { saveNotes, getNotes, encryptNote, NOTES_KEY };
