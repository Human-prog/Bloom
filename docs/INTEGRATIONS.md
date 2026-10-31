# Spotify and Notion setup

Bloom Notch talks to Spotify and Notion from the Electron main process only.
The renderer never makes a network request and never sees a token.

Open **Prefs** in the notch to connect either service.

---

## Spotify

Spotify playback state and controls use OAuth 2.0 with PKCE. No client secret is
used or stored, so the app is safe to share.

### 1. Create a free Spotify app

1. Go to <https://developer.spotify.com/dashboard> and sign in.
2. Select **Create app**.
3. Give it any name and description.
4. Add this exact Redirect URI:

   ```
   http://127.0.0.1:8765/callback
   ```

5. Under **Which API/SDKs are you planning to use?**, select **Web API**.
6. Save, then open the app and copy the **Client ID**.

The Client ID is public. It is stored in `config.json`, not in the encrypted
token vault.

### 2. Connect in Bloom Notch

1. Open **Prefs**.
2. Paste the Client ID into the Spotify field.
3. Select **Save and connect**.
4. Your browser opens Spotify's consent page. Approve the requested scopes.
5. The browser shows "Connected". Return to Bloom Notch.

The app requests only:

- `user-read-playback-state`
- `user-modify-playback-state`
- `user-read-currently-playing`

### 3. Requirements and troubleshooting

- **Spotify Premium is required** for playback state and play/pause/next/previous
  through the Web API. Free accounts receive a clear error instead of a fake UI.
- Start playback in Spotify at least once so an active device exists.
- If the browser reports `redirect_uri: not valid`, the Redirect URI in the
  Spotify dashboard does not match exactly. It must use `127.0.0.1`, not
  `localhost`.
- If the port is busy, close whatever is using `127.0.0.1:8765` and retry.
- If authorization times out after three minutes, select Connect again.

---

## Notion

Notion Calendar has no public API. Bloom Notch reads events from a normal Notion
database that you share with an internal integration.

### 1. Create the integration

1. Go to <https://www.notion.so/my-integrations> and select **New integration**.
2. Name it (for example, "Bloom Notch").
3. Select the workspace that contains your events database.
4. Under **Capabilities**, enable **Read content**.
5. Save, then copy the **Internal Integration Secret**. It starts with
   `secret_` or `ntn_`.

### 2. Prepare the database

The database needs:

- A **title** property (normally `Name`).
- A **Date** property. A property named `Date` is detected first; otherwise the
  first date property is used.
- Optional: a property whose name contains `Location`, `Where`, `Place`, or
  `Venue`. Its text is shown under the event.

Then share the database with the integration:

1. Open the database as a full page.
2. Select the `...` menu in the top right.
3. Open **Connections** (or **Add connections**) and add your integration.

Without this step Notion returns "Database not found".

### 3. Connect in Bloom Notch

1. Copy the database link, or just its 32-character ID.
2. Open **Prefs**.
3. Paste the integration secret and the database link.
4. Select **Connect**.

Bloom Notch validates the token with `GET /v1/users/me`, reads the database
schema, detects the title and date properties, and stores the token in the
encrypted vault.

### 4. Calendar behavior

- Events are read for the visible month plus a one-week margin on each side.
- Multi-day events appear on every day they cover.
- Date-only events show as **All day**.
- The calendar refreshes when you open the Cal tab or change months. Results are
  cached for 90 seconds.
- If the database has no Date property, connection is refused with a clear
  message.

---

## Where credentials live

| Item | Location | Protection |
|---|---|---|
| Spotify Client ID | `%APPDATA%\bloom-notch-app\config.json` | Public identifier |
| Spotify access/refresh tokens | `%APPDATA%\bloom-notch-app\tokens.enc` | AES-256-GCM, machine-bound |
| Notion integration secret | `%APPDATA%\bloom-notch-app\tokens.enc` | AES-256-GCM, machine-bound |
| Notion database ID and property names | `%APPDATA%\bloom-notch-app\config.json` | Non-secret |

`tokens.enc` is bound to this computer's fingerprint. Copying it to another
machine fails closed: the app treats the vault as empty and asks you to connect
again. **Disconnect** deletes the provider's tokens immediately.

No Spotify audio, Notion page content, album art, video frames, or gesture data
is written to disk. Only the fields shown in the notch are kept in memory.

---

## Building and installing

```powershell
npm install
npm test                 # security + offline integration checks
npm run dist             # NSIS installer + portable exe in dist\
```

Artifacts:

- `dist\Bloom-Notch-Setup-1.0.0.exe` - per-user installer. Creates Start Menu
  and desktop shortcuts, so **Bloom Notch** appears in Windows search.
- `dist\Bloom-Notch-Portable-1.0.0.exe` - single portable executable.

The installer is unsigned, so Windows SmartScreen may show "Windows protected
your PC" on first launch. Select **More info > Run anyway**. The portable build
does not support **Launch at login** because its extraction path changes on every
run.
