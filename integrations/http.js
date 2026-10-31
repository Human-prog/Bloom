/**
 * Minimal HTTPS JSON client for integrations.
 * No redirects, no retries, hard timeout, bounded response size.
 */
const https = require('https');
const { URL } = require('url');

const MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_TIMEOUT = 15000;

function requestJson(url, options) {
  const opts = options || {};
  const method = opts.method || 'GET';
  const headers = Object.assign({ Accept: 'application/json' }, opts.headers || {});
  const timeoutMs = Number(opts.timeoutMs) || DEFAULT_TIMEOUT;
  const body = opts.body || null;

  return new Promise(function (resolve, reject) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      reject(new Error('Invalid URL'));
      return;
    }
    if (parsed.protocol !== 'https:') {
      reject(new Error('Only HTTPS is allowed'));
      return;
    }

    const req = https.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: method,
      headers: headers,
    }, function (res) {
      let data = '';
      let size = 0;
      res.setEncoding('utf8');
      res.on('data', function (chunk) {
        size += Buffer.byteLength(chunk);
        if (size > MAX_BYTES) {
          req.destroy(new Error('Response too large'));
          return;
        }
        data += chunk;
      });
      res.on('end', function () {
        let json = null;
        try { json = data ? JSON.parse(data) : null; } catch (e) { json = null; }
        resolve({ status: res.statusCode, headers: res.headers, json: json, text: data });
      });
    });

    req.on('error', function (err) { reject(err); });
    req.setTimeout(timeoutMs, function () {
      req.destroy(new Error('Request timed out'));
    });

    if (body) req.write(body);
    req.end();
  });
}

function apiError(res, fallback) {
  if (res && res.json) {
    if (res.json.error_description) return String(res.json.error_description);
    if (res.json.error && typeof res.json.error === 'string') return res.json.error;
    if (res.json.error && typeof res.json.error === 'object' && res.json.error.message) {
      return String(res.json.error.message);
    }
    if (res.json.message) return String(res.json.message);
  }
  if (res && res.status) return (fallback || 'Request failed') + ' (HTTP ' + res.status + ')';
  return fallback || 'Request failed';
}

module.exports = { requestJson, apiError };
