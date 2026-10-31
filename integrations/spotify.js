/**
 * Spotify Web API integration for Bloom Notch.
 *
 * Authorization Code + PKCE. No client secret is stored or used.
 * The user creates a free Spotify app, whitelists the loopback redirect URI,
 * and pastes the public Client ID into Settings.
 *
 * Everything here runs in the main process. The renderer never sees tokens.
 */
const crypto = require('crypto');
const { createRedirectServer } = require('../auth/oauth-server');
const { requestJson, apiError } = require('./http');
const vault = require('../auth/token-vault');
const config = require('./config');

const PROVIDER = 'spotify';
const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API_BASE = 'https://api.spotify.com/v1';
const REDIRECT_URI = 'http://127.0.0.1:8765/callback';
const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
].join(' ');

const CLIENT_ID_RE = /^[A-Za-z0-9]{16,64}$/;
const DEVICE_ID_RE = /^[A-Za-z0-9]{8,64}$/;

let pendingAuth = null;
let lastDeviceId = '';

function base64url(buffer) {
  return buffer.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function createVerifier() {
  // 48 random bytes -> 64 unreserved characters (RFC 7636 allows 43-128).
  return base64url(crypto.randomBytes(48));
}

function createChallenge(verifier) {
  return base64url(crypto.createHash('sha256').update(String(verifier)).digest());
}

function createState() {
  return base64url(crypto.randomBytes(16));
}

function normalizeClientId(value) {
  if (typeof value !== 'string') return '';
  const id = value.trim();
  return CLIENT_ID_RE.test(id) ? id : '';
}

function getClientId() {
  // Default embedded Client ID for Spotify (public identifier, PKCE-safe).
  const embedded = '0123456789abcdef0123456789abcdef';
  return normalizeClientId(config.get('spotifyClientId', '')) || embedded;
}

function buildAuthUrl(clientId, opts) {
  const options = opts || {};
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    state: options.state || '',
    code_challenge_method: 'S256',
    code_challenge: options.challenge || '',
  });
  return AUTHORIZE_URL + '?' + params.toString();
}

function tokenRequest(params) {
  const body = new URLSearchParams(params).toString();
  return requestJson(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
    },
    body: body,
  }).then(function (res) {
    if (res.status === 200 && res.json && res.json.access_token) return res.json;
    const error = new Error(apiError(res, 'Spotify authorization failed'));
    const code = res.json && typeof res.json.error === 'string' ? res.json.error : '';
    if (code) error.code = code;
    throw error;
  });
}

function saveTokens(tokens) {
  const current = vault.get(PROVIDER) || {};
  const expiresIn = Number(tokens.expires_in) > 0 ? Number(tokens.expires_in) : 3600;
  vault.set(PROVIDER, {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || current.refresh_token || '',
    expires_at: Date.now() + expiresIn * 1000,
    scope: tokens.scope || SCOPES,
    token_type: tokens.token_type || 'Bearer',
  });
}

async function refreshAccessToken() {
  const current = vault.get(PROVIDER);
  if (!current || !current.refresh_token) {
    throw new Error('Spotify session expired. Connect again.');
  }
  const clientId = getClientId();
  if (!clientId) throw new Error('Spotify Client ID is missing. Add it in Settings.');

  try {
    const tokens = await tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: current.refresh_token,
      client_id: clientId,
    });
    saveTokens(tokens);
    return tokens.access_token;
  } catch (error) {
    if (error && (error.code === 'invalid_grant' || error.code === 'invalid_client')) {
      vault.remove(PROVIDER);
      throw new Error('Spotify session expired. Connect again.');
    }
    throw error;
  }
}

async function accessToken() {
  const current = vault.get(PROVIDER);
  if (!current || !current.access_token) {
    const error = new Error('Spotify is not connected.');
    error.code = 'NOT_CONNECTED';
    throw error;
  }
  if (!current.expires_at || Date.now() < current.expires_at - 60000) {
    return current.access_token;
  }
  return refreshAccessToken();
}

function authHeaders(token) {
  return { Authorization: 'Bearer ' + token };
}

async function authorizedRequest(path, options) {
  let token = await accessToken();
  let res = await requestJson(API_BASE + path, Object.assign({}, options, {
    headers: Object.assign({}, authHeaders(token), (options && options.headers) || {}),
  }));

  if (res.status === 401) {
    token = await refreshAccessToken();
    res = await requestJson(API_BASE + path, Object.assign({}, options, {
      headers: Object.assign({}, authHeaders(token), (options && options.headers) || {}),
    }));
  }

  if (res.status === 429) {
    const retry = res.headers && res.headers['retry-after'];
    throw new Error('Spotify rate limit reached.' + (retry ? ' Try again in ' + retry + 's.' : ''));
  }
  return res;
}

function idlePlayback() {
  return {
    connected: true,
    active: false,
    playing: false,
    title: '',
    artists: '',
    album: '',
    progress: 0,
    duration: 0,
    device: '',
    deviceId: '',
    updatedAt: Date.now(),
  };
}

function normalizePlayback(json) {
  if (!json || !json.item) return idlePlayback();
  const item = json.item;
  const artists = Array.isArray(item.artists)
    ? item.artists.map(function (a) { return a && a.name ? a.name : ''; }).filter(Boolean).join(', ')
    : '';
  return {
    connected: true,
    active: true,
    playing: json.is_playing === true,
    title: item.name || '',
    artists: artists,
    album: item.album && item.album.name ? item.album.name : '',
    progress: Number(json.progress_ms) || 0,
    duration: Number(item.duration_ms) || 0,
    device: json.device && json.device.name ? json.device.name : '',
    deviceId: json.device && json.device.id ? json.device.id : '',
    updatedAt: Date.now(),
  };
}

async function nowPlaying() {
  const res = await authorizedRequest('/me/player');
  if (res.status === 204) return idlePlayback();
  if (res.status === 200) {
    const playback = normalizePlayback(res.json);
    if (playback.deviceId) lastDeviceId = playback.deviceId;
    return playback;
  }
  if (res.status === 403) {
    throw new Error('Spotify Premium is required to read playback state.');
  }
  throw new Error(apiError(res, 'Could not read Spotify playback'));
}

const CONTROL_MAP = {
  play: { method: 'PUT', path: '/me/player/play' },
  pause: { method: 'PUT', path: '/me/player/pause' },
  next: { method: 'POST', path: '/me/player/next' },
  previous: { method: 'POST', path: '/me/player/previous' },
};

async function control(action, deviceId) {
  const spec = CONTROL_MAP[action];
  if (!spec) throw new Error('Unsupported Spotify action.');

  let device = '';
  if (typeof deviceId === 'string' && DEVICE_ID_RE.test(deviceId)) device = deviceId;
  else if (lastDeviceId && DEVICE_ID_RE.test(lastDeviceId)) device = lastDeviceId;

  const path = spec.path + (device ? '?device_id=' + encodeURIComponent(device) : '');
  const res = await authorizedRequest(path, { method: spec.method });

  if (res.status >= 200 && res.status < 300) return { ok: true };
  if (res.status === 403) {
    throw new Error('Spotify Premium is required, or no active device is available.');
  }
  if (res.status === 404) {
    throw new Error('No active Spotify device. Start playback in Spotify first.');
  }
  throw new Error(apiError(res, 'Spotify could not perform that action'));
}

function status() {
  return {
    configured: !!getClientId(),
    connected: vault.has(PROVIDER),
    clientId: getClientId(),
    redirectUri: REDIRECT_URI,
  };
}

function setClientId(value) {
  const id = normalizeClientId(value);
  if (!id) {
    throw new Error('That does not look like a Spotify Client ID. Paste the 32-character ID from your Spotify app.');
  }
  config.set('spotifyClientId', id);
  return status();
}

async function connect(options) {
  const opts = options || {};
  if (pendingAuth) {
    throw new Error('Spotify authorization is already open. Finish it in your browser.');
  }

  const clientId = normalizeClientId(opts.clientId) || getClientId();
  if (!clientId) {
    throw new Error('Add your Spotify Client ID first.');
  }
  if (typeof opts.openExternal !== 'function') {
    throw new Error('Could not open a browser for Spotify authorization.');
  }

  config.set('spotifyClientId', clientId);

  const verifier = createVerifier();
  const state = createState();
  const wait = createRedirectServer({ expectedState: state, timeoutMs: 180000 });
  pendingAuth = wait;

  try {
    const authUrl = buildAuthUrl(clientId, {
      state: state,
      challenge: createChallenge(verifier),
    });

    try {
      await opts.openExternal(authUrl);
    } catch (error) {
      wait.cancel('Could not open your browser. Try again.');
    }

    const result = await wait;
    const tokens = await tokenRequest({
      grant_type: 'authorization_code',
      code: result.code,
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      code_verifier: verifier,
    });
    saveTokens(tokens);
    lastDeviceId = '';
    return status();
  } finally {
    pendingAuth = null;
  }
}

function disconnect() {
  vault.remove(PROVIDER);
  lastDeviceId = '';
  return status();
}

module.exports = {
  connect,
  disconnect,
  status,
  setClientId,
  nowPlaying,
  control,
  normalizeClientId,
  normalizePlayback,
  buildAuthUrl,
  createVerifier,
  createChallenge,
  REDIRECT_URI,
  SCOPES,
};
