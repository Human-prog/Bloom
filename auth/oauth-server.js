/**
 * Local OAuth redirect listener.
 * Binds to 127.0.0.1 only, validates state, single use, hard timeout.
 */
const http = require('http');
const { URL } = require('url');

const DEFAULT_PORT = 8765;
const DEFAULT_PATH = '/callback';

function page(title, message) {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + title + '</title>' +
    '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;' +
    'background:#121214;color:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}' +
    '.card{background:#1c1c1e;border:1px solid #2c2c2e;border-radius:16px;padding:32px 40px;text-align:center;max-width:420px}' +
    '.dot{width:10px;height:10px;border-radius:50%;background:#0a84ff;display:inline-block;margin-right:8px}' +
    'h1{font-size:18px;margin:0 0 8px}p{font-size:13px;color:#86868b;margin:0;line-height:1.5}</style></head>' +
    '<body><div class="card"><h1><span class="dot"></span>' + title + '</h1><p>' + message + '</p></div></body></html>';
}

/**
 * @param {{port?:number, callbackPath?:string, expectedState?:string, timeoutMs?:number}} opts
 * @returns {Promise<{code:string, state:string}>}
 */
function createRedirectServer(opts) {
  const options = opts || {};
  const port = Number(options.port) || DEFAULT_PORT;
  const callbackPath = options.callbackPath || DEFAULT_PATH;
  const expectedState = options.expectedState || null;
  const timeoutMs = Number(options.timeoutMs) || 180000;

  let cancelFn = null;

  const promise = new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;

    const server = http.createServer((req, res) => {
      let url;
      try {
        url = new URL(req.url, 'http://127.0.0.1:' + port);
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Bad request');
        return;
      }

      if (req.method !== 'GET' || url.pathname !== callbackPath) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }

      const error = url.searchParams.get('error');
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state') || '';

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(page('Authorization denied', 'Bloom Notch did not receive permission. You can close this tab.'));
        finish(new Error('Authorization denied: ' + error));
        return;
      }

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(page('Missing code', 'The provider did not return an authorization code.'));
        return;
      }

      if (expectedState && state !== expectedState) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(page('State mismatch', 'This callback did not match the request Bloom Notch started.'));
        finish(new Error('OAuth state mismatch'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(page('Connected', 'You can close this tab and return to Bloom Notch.'));
      finish(null, { code: code, state: state });
    });

    function finish(err, result) {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      server.close(function () {});
      if (err) reject(err);
      else resolve(result);
    }

    server.on('error', function (err) {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (err && err.code === 'EADDRINUSE') {
        reject(new Error('Port ' + port + ' is already in use. Close the other app and try again.'));
      } else {
        reject(err);
      }
    });

    server.listen(port, '127.0.0.1', function () {
      timer = setTimeout(function () {
        finish(new Error('Authorization timed out. Try connecting again.'));
      }, timeoutMs);
    });

    cancelFn = function (message) {
      finish(new Error(message || 'Authorization cancelled.'));
    };
  });

  promise.cancel = function (message) {
    if (cancelFn) cancelFn(message);
  };

  return promise;
}

module.exports = { createRedirectServer, DEFAULT_PORT, DEFAULT_PATH };
