/**
 * Generic integration plugin for Bloom Notch.
 *
 * Config (non-secret) lives in userData/config.json or custom-integrations.json.
 * Tokens (access_token / refresh_token / code/state) live in the encrypted vault.
 *
 * Security: only HTTPS URLs permitted; URLs parsed and validated; headers
 * sanitized; payloads bounded; no eval / no shell / no arbitrary method
 * injection. All network traffic in main only.
 */
const crypto = require('crypto');
const { URL } = require('url');
const { requestJson, apiError } = require('./http');
const vault = require('../auth/token-vault');
const config = require('./config');
const { createRedirectServer } = require('../auth/oauth-server');

const PROVIDER = 'custom';
const DEFAULT_PORT = 8765;
const DEFAULT_PATH = '/callback';

function sanitizeConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return null;
  const out = {};
  const allowedString = (v, max) => typeof v === 'string' ? v.slice(0, max || 256) : '';
  out.name = allowedString(cfg.name, 64) || 'Custom';
  out.id = allowedString(cfg.id, 32);
  out.baseUrl = allowedString(cfg.baseUrl, 512);
  out.authType = allowedString(cfg.authType, 16); // 'oauth', 'token', 'none'
  out.redirectUri = allowedString(cfg.redirectUri, 256) || 'http://127.0.0.1:' + DEFAULT_PORT + DEFAULT_PATH;
  out.clientId = allowedString(cfg.clientId, 128);
  out.scope = allowedString(cfg.scope, 512);
  out.tokenHeaderName = allowedString(cfg.tokenHeaderName, 32) || 'Authorization';
  out.endpoints = (cfg.endpoints && typeof cfg.endpoints === 'object' && !Array.isArray(cfg.endpoints)) ? cfg.endpoints : {};
  // Sanitize endpoint keys/values
  const safeEndpoints = {};
  for (const k of Object.keys(out.endpoints)) {
    if (typeof k !== 'string' || k.length > 32) continue;
    const v = out.endpoints[k];
    if (!v || typeof v !== 'object') continue;
    const safe = {};
    if (typeof v.method === 'string') safe.method = v.method.slice(0, 8).toUpperCase();
    if (typeof v.path === 'string' && /^[\/][A-Za-z0-9_\-\.\/]*$/.test(v.path.slice(0, 128))) safe.path = v.path.slice(0, 128);
    if (v.body) safe.body = typeof v.body === 'string' ? v.body.slice(0, 1024) : null;
    safeEndpoints[k] = safe;
  }
  out.endpoints = safeEndpoints;
  return out;
}

function normalizeEndpointName(name) {
  if (typeof name !== 'string') return '';
  return name.replace(/[^A-Za-z0-9_\-]/g, '').slice(0, 32);
}

function isSafeUrl(urlStr) {
  try {
    const url = new URL(urlStr);
    if (url.protocol !== 'https:') return false;
    if (!url.hostname || url.hostname.length > 253) return false;
    return true;
  } catch (e) {
    return false;
  }
}

function getConfig(key) {
  try {
    const all = config.read();
    return all && typeof all === 'object' ? all[key] : null;
  } catch (e) { return null; }
}

function getCustomConfigs() {
  const raw = getConfig('customIntegrations');
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map(sanitizeConfig).filter(Boolean);
}

function getConfigForId(id) {
  if (!id) return null;
  const all = getCustomConfigs();
  return all.find(function (c) { return c.id === id; }) || null;
}

function saveCustomConfigs(arr) {
  const clean = arr.map(sanitizeConfig).filter(Boolean);
  config.set('customIntegrations', clean);
}

function getVaultKey(id) {
  return 'custom-' + (String(id || '').slice(0, 32) || 'default');
}

function getConnection(id) {
  const key = getVaultKey(id);
  const t = vault.get(key);
  const cfg = (getCustomConfigs() || []).find(function (c) { return c.id === id; });
  return {
    configured: !!cfg,
    connected: !!(t && t.access_token),
    cfg: cfg || null,
    token: t || null,
  };
}

// OAuth PKCE helpers (reuse same pattern as spotify.js)
function createVerifier() {
  const base64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return base64url(crypto.randomBytes(48));
}

function createChallenge(verifier) {
  const base64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return base64url(crypto.createHash('sha256').update(String(verifier)).digest());
}

function createState() {
  return crypto.randomBytes(16).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function buildAuthUrl(cfg, opts) {
  const options = opts || {};
  const redirect = cfg.redirectUri || ('http://127.0.0.1:' + DEFAULT_PORT + DEFAULT_PATH);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.clientId || '',
    redirect_uri: redirect,
    scope: cfg.scope || '',
    state: options.state || '',
    code_challenge_method: 'S256',
    code_challenge: options.challenge || '',
  });
  return cfg.authorizeUrl + '?' + params.toString();
}

async function connect(configPayload) {
  const payload = configPayload || {};
  if (!payload.cfg || !payload.cfg.id) throw new Error('Custom integration config missing id.');
  const cfg = sanitizeConfig(payload.cfg);
  if (!cfg || !cfg.baseUrl || !isSafeUrl(cfg.baseUrl)) throw new Error('Invalid or missing base URL. Must be HTTPS.');
  if (!cfg.authType || !['oauth', 'token'].includes(cfg.authType)) throw new Error('Auth type must be oauth or token.');

  // Save config
  const all = getCustomConfigs();
  const idx = all.findIndex(function (c) { return c.id === cfg.id; });
  if (idx >= 0) all[idx] = cfg; else all.push(cfg);
  saveCustomConfigs(all);

  const key = getVaultKey(cfg.id);

  if (cfg.authType === 'token') {
    if (!payload.token || typeof payload.token !== 'string' || payload.token.length > 512) {
      throw new Error('Token missing or too long.');
    }
    vault.set(key, {
      access_token: payload.token.trim(),
      token_type: 'Bearer',
      created_at: Date.now(),
    });
    return { ok: true, cfg: cfg, connected: true };
  }

  // OAuth flow
  if (!cfg.clientId || cfg.clientId.length < 4) throw new Error('OAuth requires a client_id.');
  const openExternal = payload.openExternal || function () { throw new Error('No browser available.'); };
  const verifier = createVerifier();
  const state = createState();

  const redirectUrl = new URL(cfg.redirectUri || ('http://127.0.0.1:' + DEFAULT_PORT + DEFAULT_PATH));
  const port = Number(redirectUrl.port) || DEFAULT_PORT;
  const pathPart = redirectUrl.pathname || DEFAULT_PATH;

  const wait = createRedirectServer({ port: port, callbackPath: pathPart, expectedState: state, timeoutMs: 180000 });

  try {
    const authUrl = buildAuthUrl(cfg, { state: state, challenge: createChallenge(verifier) });
    await openExternal(authUrl);
    const result = await wait;
    if (!result || !result.code) throw new Error('No authorization code received.');

    // Token exchange via user's endpoint (many APIs use /oauth/token or /token)
    const tokenUrl = (cfg.tokenUrl && isSafeUrl(cfg.tokenUrl)) ? cfg.tokenUrl : (cfg.baseUrl + '/oauth/token');
    const payloadBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code: result.code,
      redirect_uri: cfg.redirectUri || redirectUrl.toString(),
      client_id: cfg.clientId,
      code_verifier: verifier,
    }).toString();

    const res = await requestJson(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(payloadBody),
      },
      body: payloadBody,
    });

    if (res.status !== 200 || !res.json || !res.json.access_token) {
      throw new Error(apiError(res, 'OAuth token exchange failed'));
    }

    vault.set(key, {
      access_token: res.json.access_token,
      refresh_token: res.json.refresh_token || '',
      expires_at: res.json.expires_in ? Date.now() + Number(res.json.expires_in) * 1000 : Date.now() + 3600000,
      token_type: res.json.token_type || 'Bearer',
      scope: res.json.scope || '',
    });
    return { ok: true, cfg: cfg, connected: true };
  } finally {
    // cancel in case of error (already settled if resolved/rejected, cancel is safe no-op after)
    try { if (wait && wait.cancel) wait.cancel('done'); } catch (e) { /* best effort */ }
  }
}

async function disconnect(id) {
  if (!id) throw new Error('Integration id required.');
  vault.remove(getVaultKey(id));
  return { ok: true, disconnected: true, id: id };
}

function status(id) {
  if (id) {
    const conn = getConnection(id);
    const cfg = conn.cfg || null;
    return {
      ok: true,
      id: id,
      name: cfg ? cfg.name : '',
      configured: conn.configured,
      connected: conn.connected,
      authType: cfg ? cfg.authType : '',
      baseUrl: cfg ? cfg.baseUrl : '',
      endpoints: cfg ? Object.keys(cfg.endpoints || {}) : [],
    };
  }
  const all = getCustomConfigs();
  return {
    ok: true,
    integrations: all.map(function (c) {
      const s = getConnection(c.id);
      return { id: c.id, name: c.name, configured: s.configured, connected: s.connected, authType: c.authType };
    }),
  };
}

async function invokeEndpoint(id, endpointName, payload) {
  if (!id) throw new Error('Integration id required.');
  if (!endpointName || typeof endpointName !== 'string') throw new Error('Endpoint name required.');
  endpointName = normalizeEndpointName(endpointName);
  if (!endpointName) throw new Error('Invalid endpoint name.');

  const cfg = getConfigForId(id);
  if (!cfg) throw new Error('Integration not configured: ' + id);
  if (!cfg.baseUrl || !isSafeUrl(cfg.baseUrl)) throw new Error('Invalid base URL for integration.');

  const endpoint = (cfg.endpoints || {})[endpointName];
  if (!endpoint) throw new Error('Unknown endpoint: ' + endpointName);

  const key = getVaultKey(id);
  const tokenData = vault.get(key);
  if (!tokenData || !tokenData.access_token) throw new Error('Not connected. Authenticate first.');

  let url = cfg.baseUrl + (endpoint.path || '/');
  // Merge query from endpoint (if any embedded) — only allow safe chars in query key/val
  if (endpoint.query && typeof endpoint.query === 'object') {
    const q = new URLSearchParams();
    for (const k of Object.keys(endpoint.query)) {
      if (k.length > 32) continue;
      const v = endpoint.query[k];
      if (typeof v === 'string' && v.length <= 256) q.set(k, v);
    }
    url += (url.includes('?') ? '&' : '?') + q.toString();
  }

  const method = (endpoint.method || 'GET').toUpperCase();
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(method)) {
    throw new Error('Unsupported HTTP method: ' + method);
  }

  const headers = {};
  const tokenHeader = cfg.tokenHeaderName || 'Authorization';
  headers[tokenHeader] = (tokenData.token_type === 'Bearer' ? 'Bearer ' : '') + tokenData.access_token;
  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    headers['Content-Type'] = 'application/json';
  }

  let body = null;
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const safe = {};
    for (const k of Object.keys(payload)) {
      if (k.length > 32) continue;
      const v = payload[k];
      if (v === null || v === undefined) continue;
      if (typeof v === 'string' && v.length <= 1024) safe[k] = v;
      else if (typeof v === 'number' || typeof v === 'boolean') safe[k] = v;
    }
    if (Object.keys(safe).length > 0) body = JSON.stringify(safe);
  } else if (endpoint.body && typeof endpoint.body === 'string' && endpoint.body.length <= 1024) {
    body = endpoint.body;
  }

  return requestJson(url, {
    method: method,
    headers: headers,
    body: body,
    timeoutMs: 15000,
  }).then(function (res) {
    if (res.status === 401) {
      throw new Error('Token rejected. Reconnect the integration.');
    }
    if (res.status === 429) {
      throw new Error('Rate limited by the integration. Try again shortly.');
    }
    if (res.status >= 500) {
      throw new Error('Integration server error (HTTP ' + res.status + ').');
    }
    return { ok: true, status: res.status, data: res.json || res.text };
  }).catch(function (error) {
    if (error && error.message && error.message.indexOf('Only HTTPS') !== -1) {
      throw new Error('Only HTTPS URLs permitted. Check the integration base URL.');
    }
    throw error;
  });
}

/**
 * Easy add-app helper: takes minimal fields and builds full sanitized preset.
 * Usage: registerApp({ name: 'MyApp', id: 'myapp', baseUrl: 'https://api.example.com', authType: 'token', endpoints: { me: { method: 'GET', path: '/me' } } })
 */
function registerApp(minimal) {
  const cfg = sanitizeConfig({
    name: minimal && minimal.name || 'New App',
    id: minimal && minimal.id || 'new-app',
    baseUrl: minimal && minimal.baseUrl || 'https://example.com',
    authType: minimal && minimal.authType || 'token',
    endpoints: minimal && minimal.endpoints || { status: { method: 'GET', path: '/' } },
    redirectUri: minimal && minimal.redirectUri,
    clientId: minimal && minimal.clientId,
    scope: minimal && minimal.scope,
    tokenHeaderName: minimal && minimal.tokenHeaderName || 'Authorization',
  });
  if (!cfg || !cfg.id) throw new Error('App id required.');
  const all = getCustomConfigs();
  const idx = all.findIndex(function (c) { return c.id === cfg.id; });
  if (idx >= 0) all[idx] = cfg; else all.push(cfg);
  saveCustomConfigs(all);
  return { ok: true, cfg: cfg, added: idx < 0 };
}

module.exports = {
  connect,
  disconnect,
  status,
  invokeEndpoint,
  sanitizeConfig,
  getCustomConfigs,
  saveCustomConfigs,
  normalizeEndpointName,
  isSafeUrl,
  createVerifier,
  createChallenge,
  registerApp,
};
