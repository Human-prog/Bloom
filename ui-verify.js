const { app, BrowserWindow } = require('electron');
const path = require('path');

app.disableHardwareAcceleration();
app.setPath('userData', path.join(app.getPath('temp'), 'bloom-ui-verify-' + Date.now()));

const logs = [];

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 480,
    height: 460,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    if (level && typeof level === 'object') {
      logs.push({ kind: 'console', level: level.level, message: level.message });
    } else {
      logs.push({ kind: 'console', level, message });
    }
  });
  win.webContents.on('preload-error', (event, preloadPath, error) => {
    logs.push({ kind: 'preload-error', message: error && error.message });
  });
  win.webContents.on('did-fail-load', (event, code, desc) => {
    logs.push({ kind: 'did-fail-load', code, desc });
  });
  win.webContents.on('render-process-gone', (event, details) => {
    logs.push({ kind: 'render-process-gone', details });
  });

  win.loadFile(path.join(__dirname, 'bloom-notch.html'));

  win.webContents.once('did-finish-load', async () => {
    await new Promise((r) => setTimeout(r, 700));

    let result;
    try {
      result = await win.webContents.executeJavaScript(`(async () => {
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        const style = document.createElement('style');
        style.textContent = '*{transition:none!important;animation:none!important}';
        document.head.appendChild(style);

        const notch = document.getElementById('bloom-notch');
        const bar = document.getElementById('collapsed-bar');
        const r1 = notch.getBoundingClientRect();
        const collapsedText = document.body.innerText;
        const bridge = typeof window.electronAPI;

        const leaks = [];
        document.querySelectorAll('#bloom-notch *').forEach(el => {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') return;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return;
          if (r.left < r1.left - 0.5 || r.right > r1.right + 0.5 || r.top < r1.top - 0.5 || r.bottom > r1.bottom + 0.5) {
            const cls = (el.className && el.className.baseVal !== undefined) ? el.className.baseVal : String(el.className || '');
            leaks.push({ tag: el.tagName, cls: cls, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] });
          }
        });

        notch.classList.add('expanded');
        notch.classList.remove('collapsed');
        await sleep(120);
        const r2 = notch.getBoundingClientRect();

        const tabResults = [];
        for (const btn of document.querySelectorAll('.tab-btn')) {
          btn.click();
          await sleep(40);
          const name = btn.getAttribute('data-tab');
          const panel = document.querySelector('.tab-panel[data-panel="' + name + '"]');
          tabResults.push({ name, active: panel.classList.contains('active'), display: getComputedStyle(panel).display });
        }

        document.getElementById('gate-test').click();
        await sleep(250);
        const gateText = document.getElementById('gate-result-settings').textContent;

        document.getElementById('tab-privacy').click();
        await sleep(250);
        const privState = document.getElementById('priv-state').textContent;
        const invRows = document.querySelectorAll('#priv-inventory .data-flow').length;

        return {
          bridge,
          imgs: document.querySelectorAll('img').length,
          qmarks: (document.body.innerText.match(/\\?\\?/g) || []).length,
          collapsed: { w: r1.width, h: r1.height, left: Math.round(r1.left), right: Math.round(r1.right) },
          collapsedBar: { scrollWidth: bar.scrollWidth, clientWidth: bar.clientWidth, text: bar.innerText.replace(/\\n/g, ' ') },
          collapsedText: collapsedText.replace(/\\n/g, ' | ').slice(0, 120),
          expanded: { w: r2.width, h: r2.height, left: Math.round(r2.left), right: Math.round(r2.right), bottom: Math.round(r2.bottom) },
          leaks,
          tabResults,
          gateText,
          privState,
          invRows,
          bodyScroll: { w: document.body.scrollWidth, h: document.body.scrollHeight },
          bodyBg: getComputedStyle(document.body).backgroundColor,
          notchBg: getComputedStyle(notch).backgroundColor,
        };
      })()`);
    } catch (e) {
      result = { evalError: e.message };
    }

    console.log('VERIFY_JSON_START');
    console.log(JSON.stringify({ result, logs }, null, 2));
    console.log('VERIFY_JSON_END');
    app.quit();
  });
});

setTimeout(() => {
  console.log('VERIFY_TIMEOUT');
  app.quit();
}, 20000);
