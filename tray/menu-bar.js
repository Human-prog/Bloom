const { Tray, Menu } = require('electron');
const path = require('path');

function createTray(app, mainWindow) {
  const tray = new Tray(path.join(__dirname, '..', 'assets', 'tray-icon.png'));
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Bloom Notch', enabled: false },
    { type: 'separator' },
    { label: 'Show / Hide', click: () => { if (mainWindow.isVisible()) mainWindow.hide(); else mainWindow.showInactive(); } },
    { label: 'Expand / Collapse', click: () => { mainWindow.webContents.send('toggle-expand'); } },
    { type: 'separator' },
    { label: 'Settings', click: () => { mainWindow.webContents.send('open-settings'); } },
    { label: 'Quit', click: () => app.quit() }
  ]);
  tray.setToolTip('Bloom Notch — Spotify · Notion · Calendar');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => { if (mainWindow.isVisible()) mainWindow.hide(); else { mainWindow.showInactive(); } });
  return tray;
}

module.exports = { createTray };
