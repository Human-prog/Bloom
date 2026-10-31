const { app, BrowserWindow } = require('electron');
const path = require('path');

app.disableHardwareAcceleration();
app.setPath('userData', path.join(app.getPath('temp'), 'bloom-layout-verify-' + Date.now()));

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 480,
    height: 460,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.loadFile(path.join(__dirname, 'bloom-notch.html'));

  win.webContents.once('did-finish-load', async () => {
    await new Promise((r) => setTimeout(r, 700));

    const data = await win.webContents.executeJavaScript(`(async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const style = document.createElement('style');
      style.textContent = '*{transition:none!important;animation:none!important}';
      document.head.appendChild(style);

      const n = document.getElementById('bloom-notch');
      const bar = document.getElementById('collapsed-bar');
      const collapsedBar = { scrollWidth: bar.scrollWidth, clientWidth: bar.clientWidth, ok: bar.scrollWidth <= bar.clientWidth };

      n.classList.add('expanded');
      n.classList.remove('collapsed');
      await sleep(200);
      const nr = n.getBoundingClientRect();

      const panels = [];
      for (const btn of document.querySelectorAll('.tab-btn')) {
        btn.click();
        await sleep(80);
        const name = btn.getAttribute('data-tab');
        const panel = document.querySelector('.tab-panel[data-panel="' + name + '"]');
        const bad = [];
        panel.querySelectorAll('*').forEach(el => {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') return;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return;
          if (r.left < nr.left + 2 || r.right > nr.right - 2) {
            const cls = (el.className && el.className.baseVal !== undefined) ? el.className.baseVal : String(el.className || '');
            bad.push({ tag: el.tagName, cls: cls, l: Math.round(r.left), r: Math.round(r.right) });
          }
        });
        panels.push({ tab: name, scroll: [panel.scrollHeight, panel.clientHeight], overflow: bad.length, sample: bad.slice(0, 3) });
      }

      const labels = [];
      document.querySelectorAll('.tab-btn span').forEach(s => {
        if (s.classList.contains('dot')) return;
        labels.push({ text: s.textContent, sw: s.scrollWidth, cw: s.clientWidth });
      });

      const brand = document.querySelector('.header-brand').getBoundingClientRect();
      const clock = document.querySelector('.clock').getBoundingClientRect();
      const tabbar = document.querySelector('.tab-bar').getBoundingClientRect();
      const content = document.querySelector('.tab-content').getBoundingClientRect();

      return {
        notch: [nr.width, nr.height],
        collapsedBar: collapsedBar,
        headerGap: Math.round(clock.left - brand.right),
        tabBar: [Math.round(tabbar.left), Math.round(tabbar.top), Math.round(tabbar.width), Math.round(tabbar.height)],
        content: [Math.round(content.left), Math.round(content.top), Math.round(content.width), Math.round(content.height)],
        labels: labels,
        panels: panels,
      };
    })()`);

    console.log('LAYOUT_JSON_START');
    console.log(JSON.stringify(data, null, 2));
    console.log('LAYOUT_JSON_END');
    app.exit(0);
  });
});

setTimeout(() => { console.log('LAYOUT_TIMEOUT'); app.exit(1); }, 20000);
