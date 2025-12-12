import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { startTyping, stopTyping } from './typingSimulator';

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;

// Shared State
let currentConfig: { text: string; options: any } | null = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
    autoHideMenuBar: true,
    backgroundColor: '#1a1a1a',
    show: false,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    // If main window closes, close app (or overlay)
    if (overlayWindow) overlayWindow.close();
  });
}

function createOverlayWindow() {
  if (overlayWindow) return;

  overlayWindow = new BrowserWindow({
    width: 240,
    height: 120,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const url = process.env.VITE_DEV_SERVER_URL
    ? `${process.env.VITE_DEV_SERVER_URL}?mode=overlay`
    : `file://${path.join(__dirname, '../../../dist/index.html')}?mode=overlay`;

  overlayWindow.loadURL(url);

  overlayWindow.on('closed', () => {
    overlayWindow = null;
    // If overlay closes explicitly, bring back main window?
    // Or maybe user clicked "X" on overlay.
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  });
}

app.whenReady().then(() => {
  createMainWindow();

  // Window Controls
  ipcMain.on('window-minimize', () => mainWindow?.minimize());
  ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.on('window-close', () => mainWindow?.close());

  // Legacy handler (direct start)
  ipcMain.handle('start-typing', async (event, text, options) => {
    // Cache it just in case
    currentConfig = { text, options };
    await new Promise(r => setTimeout(r, 3000));
    await startTyping(text, options);
  });

  // Config & State
  ipcMain.on('set-config', (event, config) => {
    currentConfig = config;
  });

  // Window Management
  ipcMain.on('toggle-overlay', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
      if (!overlayWindow) createOverlayWindow();
      else overlayWindow.show();
    } else {
      if (overlayWindow) overlayWindow.hide(); // or close?
      mainWindow?.show();
    }
  });

  // Unified Start (from Overlay)
  ipcMain.handle('signal-start', async () => {
    if (!currentConfig) {
      console.error("No config set!");
      return;
    }
    // Instant start (or small delay)
    await new Promise(r => setTimeout(r, 1000));
    await startTyping(currentConfig.text, currentConfig.options);
  });

  ipcMain.on('stop-typing', () => {
    stopTyping();
  });
});

app.on('window-all-closed', () => {
  stopTyping();
  if (process.platform !== 'darwin') app.quit();
});
