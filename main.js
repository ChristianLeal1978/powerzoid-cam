const { app, BrowserWindow, screen, session, desktopCapturer, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');

const SAVE_DIR = path.join(os.homedir(), 'Videos', 'PowerzoidCam');

let mainWindow;
let regionWindow = null;
let pendingRegionResolve = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 920,
    minWidth: 340,
    minHeight: 720,
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

// Abre una ventana transparente a pantalla completa sobre el monitor principal
// para que el usuario dibuje/mueva el rectángulo de recorte directamente sobre
// su escritorio real, en vez de un preview reducido dentro de la app. Resuelve
// con el rectángulo elegido en píxeles físicos del monitor, o null si canceló.
ipcMain.handle('open-region-selector', (_event, { ratio }) => {
  if (regionWindow) return Promise.resolve(null);

  const display = screen.getPrimaryDisplay();

  return new Promise((resolve) => {
    pendingRegionResolve = (result) => {
      resolve(result);
      pendingRegionResolve = null;
      if (regionWindow) {
        regionWindow.close();
        regionWindow = null;
      }
    };

    regionWindow = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      frame: false,
      transparent: true,
      hasShadow: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      // Nada de fullscreen:true aquí a propósito: pedirle al compositor el
      // estado "fullscreen" del sistema hace que muchos compositores de
      // Wayland (incluido Mutter/GNOME) traten la superficie como opaca para
      // ahorrarse composición, y la transparencia deja de funcionar (se ve
      // negra). Como ya la dimensionamos exactamente al monitor, cubre toda
      // la pantalla igual sin pedir ese estado.
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    regionWindow.setAlwaysOnTop(true, 'screen-saver');
    regionWindow.setMenuBarVisibility(false);

    regionWindow.webContents.once('did-finish-load', () => {
      regionWindow.webContents.send('region-init', {
        ratio,
        width: display.bounds.width,
        height: display.bounds.height,
        scaleFactor: display.scaleFactor,
      });
    });

    regionWindow.on('closed', () => {
      regionWindow = null;
      if (pendingRegionResolve) {
        const resolve2 = pendingRegionResolve;
        pendingRegionResolve = null;
        resolve2(null);
      }
    });

    regionWindow.loadFile(path.join(__dirname, 'src', 'region-overlay.html'));
  });
});

ipcMain.on('region-selected', (_event, rect) => {
  if (pendingRegionResolve) pendingRegionResolve(rect);
});

ipcMain.on('region-cancelled', () => {
  if (pendingRegionResolve) pendingRegionResolve(null);
});

// Los botones de confirmar/cancelar viven en la ventana principal; acá se
// reenvía la orden a la ventana overlay, que es quien conoce el rectángulo
// actual.
ipcMain.on('region-request-confirm', () => {
  if (regionWindow) regionWindow.webContents.send('region-do-confirm');
});

ipcMain.on('region-request-cancel', () => {
  if (regionWindow) regionWindow.webContents.send('region-do-cancel');
});

// El overlay es transparente pero por defecto tapa los clics de toda la
// pantalla (incluida la ventana principal que se ve a través suyo). Lo
// dejamos "click-through" salvo cuando el propio overlay avisa que el mouse
// está sobre el rectángulo/las esquinas, que es lo único que debe capturar.
ipcMain.on('region-set-interactive', (_event, interactive) => {
  if (regionWindow) regionWindow.setIgnoreMouseEvents(!interactive, { forward: true });
});

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
