const { app, BrowserWindow } = require('electron');
const path = require('path');

app.disableHardwareAcceleration();
app.setPath('userData', path.join(app.getPath('temp'), 'bloom-hover-verify-' + Date.now()));

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 480,
    height: 460,
    x: 0,
    y: 0,
    show: true,
    frame: false,
    transparent: true,
    skipTaskbar: true,
    focusable: false,
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
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    await sleep(700);

    const measure = () => win.webContents.executeJavaScript(`(() => {
      const n = document.getElementById('bloom-notch');
      const r = n.getBoundingClientRect();
      return { expanded: n.classList.contains('expanded'), w: r.width, h: r.height, bridge: typeof window.electronAPI };
    })()`);

    const start = await measure();
    win.webContents.send('notch-pointer', true);
    await sleep(600);
    const hovered = await measure();
    win.webContents.send('notch-pointer', false);
    await sleep(600);
    const left = await measure();

    console.log('HOVER_JSON_START');
    console.log(JSON.stringify({ start, hovered, left }, null, 2));
    console.log('HOVER_JSON_END');
    app.exit(0);
  });
});

setTimeout(() => { console.log('HOVER_TIMEOUT'); app.exit(1); }, 15000);
