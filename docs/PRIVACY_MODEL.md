# GhostControl-inspired Privacy Model — integrated into Bloom Notch

## Zero-retention principle
The user's data exists only as long as necessary to perform the requested action. Afterward, it must not be retained by Bloom Notch or any integrated component.

## Data categories (from docs/DATA_LIFECYCLE.md)

| Data | Default policy | Persistent |
|---|---|---|
| Raw camera frames | Memory only; never persisted | No |
| Hand landmarks | Memory only; discard after inference | No |
| Motion history | Bounded temporary buffer | No |
| Raw microphone audio | Bounded temporary buffer | No |
| Speech transcript | Temporary until action completes | No |
| Recognition confidence | Temporary only | No |
| Action parameters | Temporary until execution | No |
| Integration tokens (Spotify / Notion) | AES-256-GCM, machine-bound vault; never logged | Yes, until disconnect |
| Integration config (Client ID, database ID) | Non-secret identifiers in `config.json` | Yes |
| Settings/config | Persistent user-approved settings | Yes |

## Transaction lifecycle (implemented in privacy/retention-manager.js)

```
IDLE -> INPUT_ACTIVE -> INFERENCE -> ACTION_VALIDATION -> PERMISSION_CHECK -> ACTION_GATE -> EXECUTION -> INPUT_BUFFER_CLEAR -> TRANSIENT_STATE_CLEAR -> RETURN_TO_IDLE
```

Every transition supports cancellation and exception handling with the same cleanup routine.

## Retention manager
The `RetentionManager` (singleton `retentionManager` in `privacy/retention-manager.js`) owns transient buffers and coordinates cleanup. It provides:
- `registerBuffer()` / `clearBuffer()` / `clearAll()`
- `beginTransaction()` / `completeTransaction()` / `cancelTransaction()`
- `triggerEmergencyStop()` / `resetEmergencyStop()`
- Content-free audit tracking (no user content in logs)

## Memory and OS limitations
Bloom Notch acknowledges that application-level zero retention does not guarantee system-level erasure. User data may persist in RAM, swap/pagefile, or crash dumps. This is documented but cannot be fully prevented by the application.

## What was integrated
- `privacy/retention-manager.js` — JS adaptation of GhostControl lifecycle and retention
- `docs/THREAT_MODEL.md` — 15-threat analysis from ghostcontrol/docs/
- `docs/ARCHITECTURE.md` — module separation (vision/voice/automation/privacy)
- Updated `security-test.js` to include retention/audit verification checks
