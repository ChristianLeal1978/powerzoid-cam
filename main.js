const { app, BrowserWindow, session, desktopCapturer, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');

const SAVE_DIR = path.join(os.homedir(), 'Videos', 'PowerzoidCam');

let mainWindow;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 380,
    height: 640,
    minWidth: 340,
    minHeight: 560,
    title: 'Powerzoid Cam',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: '#1e1e2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
}

ipcMain.handle('save-recording', async (_event, { buffer, filename }) => {
  await fs.mkdir(SAVE_DIR, { recursive: true });
  const fullPath = path.join(SAVE_DIR, filename);
  await fs.writeFile(fullPath, Buffer.from(buffer));
  return fullPath;
});

ipcMain.handle('show-in-folder', async (_event, fullPath) => {
  shell.showItemInFolder(fullPath);
});

app.whenReady().then(() => {
  // Screen capture on Linux/Wayland goes through xdg-desktop-portal's ScreenCast
  // portal (PipeWire). Calling desktopCapturer.getSources() here is what triggers
  // the native GNOME "Share your screen" picker for the user to choose a monitor
  // or window.
  session.defaultSession.setDisplayMediaRequestHandler(
    (request, callback) => {
      desktopCapturer
        .getSources({ types: ['screen', 'window'] })
        .then((sources) => {
          if (sources.length === 0) {
            callback({});
            return;
          }
          callback({ video: sources[0] });
        })
        .catch(() => callback({}));
    },
    { useSystemPicker: true },
  );

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
