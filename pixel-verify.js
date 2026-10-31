const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.disableHardwareAcceleration();
app.setPath('userData', path.join(app.getPath('temp'), 'bloom-pixel-verify-' + Date.now()));

function analyze(img, label) {
  const resized = img.resize({ width: 480, height: 460, quality: 'best' });
  const size = resized.getSize();
  const buf = resized.getBitmap();
  const w = size.width;
  const h = size.height;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  let painted = 0, opaque = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = buf[(y * w + x) * 4 + 3];
      if (a > 8) {
        painted++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      if (a > 200) opaque++;
    }
  }
  return {
    label,
    size: [w, h],
    painted,
    opaque,
    bbox: maxX < 0 ? null : [minX, minY, maxX, maxY],
    bboxSize: maxX < 0 ? null : [maxX - minX + 1, maxY - minY + 1],
  };
}

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 480,
    height: 460,
    x: 0,
    y: 0,
    show: true,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
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
    await new Promise((r) => setTimeout(r, 900));

    const collapsedImg = await win.webContents.capturePage();
    fs.writeFileSync(path.join(__dirname, 'ui-collapsed.png'), collapsedImg.toPNG());
    const collapsed = analyze(collapsedImg, 'collapsed');

    await win.webContents.executeJavaScript(`
      document.getElementById('bloom-notch').classList.add('expanded');
      document.getElementById('bloom-notch').classList.remove('collapsed');
      true;
    `);
    await new Promise((r) => setTimeout(r, 700));

    const expandedImg = await win.webContents.capturePage();
    fs.writeFileSync(path.join(__dirname, 'ui-expanded.png'), expandedImg.toPNG());
    const expanded = analyze(expandedImg, 'expanded');

    console.log('PIXEL_JSON_START');
    console.log(JSON.stringify({ collapsed, expanded }, null, 2));
    console.log('PIXEL_JSON_END');
    app.exit(0);
  });
});

setTimeout(() => {
  console.log('PIXEL_TIMEOUT');
  app.exit(1);
}, 20000);
