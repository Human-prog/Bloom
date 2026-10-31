# Bloom Notch — OAuth Token Security Research

**Scope:** Spotify + Notion OAuth integration — token lifecycle, storage, rotation, fail-closed  
**Date:** 2026-10-28  
**Status:** Design / research extension

---

## 1. Token Lifecycle — Design

### Spotify (PKCE OAuth 2.0)

| Stage | Operation | Security Requirement | Implementation Status |
|-------|-----------|--------------------|----------------------|
| Auth initiation | `buildAuthUrl(clientId, redirectUri, scope)` | Client secret never exposed in redirect; `state` parameter verified | ✅ `auth.js` implemented |
| Token exchange | `exchangeCode(...)` | `client_secret` sent over HTTPS only; response validated as JSON; errors fail-closed | ✅ `auth.js` implemented |
| Token storage | Store `access_token` + `refresh_token` in OS Keychain (macOS) / Windows Credential Manager / Linux `secret-service` | Never write to `.env` files; never log token bytes | 🔜 Design only |
| Token refresh | Refresh `access_token` using `refresh_token` before expiry; new `access_token` derived via HKDF from master key + refresh token | Rotation prevents replay of old access tokens; derived token is time-bound | 🔜 Design |
| Revocation | Call Spotify revocation endpoint on disconnect; delete from Keychain | Fail-closed: disconnect means no further Spotify access; no stale tokens remain | 🔜 Design |
| Validation | Before using `access_token`, verify not expired (`expires_in`); verify scope unchanged | Fail-closed: expired token = disconnect; invalid scope = disconnect | 🔜 Design |

### Notion (OAuth 2.0)

Same lifecycle applies. Notion does not use `refresh_token` in standard OAuth; instead:

- **Token storage:** Notion `access_token` stored in Keychain; derived message key (`derive_message_key`) used for any document-sync payload.
- **Expiration:** Notion tokens do not expire by default (no `expires_in`); security relies on revocation endpoint and Keychain storage.
- **Rotation:** Manual rotation via reconnect flow (`buildAuthUrl` + new `exchangeCode`).

---

## 2. Key Derivation for Token Storage

**Proposal:** Derive a per-application encryption key from the OS Keychain master secret, using the same `derive_key` mechanism as Aegisforge-X:

```typescript
// Token storage key derivation
const tokenStorageKey = derive_key(osMasterKey, b"bloom-token-storage-v1");
```

This ensures token storage is bound to the same cryptographic architecture as document encryption, reducing key-management divergence.

**Status:** Design. Implementation requires Keychain/DPAPI integration in Electron `main.js`.

---

## 3. Fail-Closed Token Paths

All token-related errors must fail-closed (disconnect, no partial access):

| Error Condition | Response | Status |
|----------------|----------|--------|
| `access_token` missing / null | Disconnect; no Spotify playback; no Notion sync | 🔜 Design |
| `access_token` expired (`expires_in` < current time) | Disconnect; trigger refresh or reconnect | 🔜 Design |
| `refresh_token` missing / revoked | Disconnect; reconnect required | 🔜 Design |
| Token validation fails (signature, scope mismatch) | Disconnect; reconnect required | 🔜 Design |
| Keychain access denied (OS permission) | Disconnect; no token access | 🔜 Design |
| Token storage file corrupted / unreadable | Disconnect; reconnect required | 🔜 Design |

---

## 4. Refresh Token Rotation Policy (Deep Research)

**Problem:** Spotify refresh tokens are long-lived; if the `refresh_token` itself is leaked or revoked, rotation is required. Notion has no refresh token, so manual reconnect is the only rotation.

**Proposed rotation model (Spotify):**
- After each successful `access_token` refresh, derive a new derived refresh key from the master Keychain secret + timestamp + token fingerprint (HKDF-SHA256, 32 bytes). This derived key can be used to encrypt the new `access_token` in storage, providing forward secrecy if the master Keychain is compromised.
- If the master Keychain secret is rotated (user changes OS password / new device), all derived token storage keys become invalid; tokens must be re-authenticated.
- This aligns with Aegisforge-X `derive_key` design.

**Status:** Research complete. Implementation requires Keychain integration + `derive_key` call in Electron `main.js`.

**Policy (Spotify only):**
- Refresh `access_token` using `refresh_token` at 75% of `expires_in` lifetime.
- After refresh, store new `access_token`; `refresh_token` remains unchanged (Spotify refresh tokens are long-lived).
- If refresh fails twice consecutively, disconnect and require reconnect.

**Policy (Notion):**
- Notion tokens have no expiry; rotation is manual (reconnect) or triggered by revocation event.
- If `access_token` is revoked externally (user disconnects from Notion settings), disconnect immediately.

---

## Conclusion

Token security design is complete; all paths are fail-closed; storage uses derived keys from OS vault. Implementation requires Electron `main.js` Keychain integration and `api/spotify/auth.js` refresh flow wiring. This is implementation work, not architecture risk.
