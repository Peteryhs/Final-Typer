import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { startTyping, stopTyping } from './typingSimulator';

// Global error handlers to prevent crashes from EPIPE and other async errors
process.on('uncaughtException', (err) => {
  console.error('[Main] Uncaught exception:', err.message);
  // Don't exit - try to continue
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Main] Unhandled rejection at:', promise, 'reason:', reason);
  // Don't exit - try to continue
});

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;

// Shared State
let currentConfig: { text: string; options: any } | null = null;

// Debug State
let debugEnabled = true; // Enabled by default during debug testing
let disableDoubleTap = false;

// Debug log sender (sends to renderer)
export function sendDebugLog(log: {
  stepNumber: number;
  action: string;
  detail: string;
  buffer: string;
  caret: number;
  level: 'info' | 'warn' | 'error' | 'debug';
}) {
  if (!debugEnabled) return;
  try {
    mainWindow?.webContents.send('debug-log', log);
    overlayWindow?.webContents.send('debug-log', log);
  } catch (e) {
    // Ignore errors (window might be closed)
  }
}

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

  // Start as a small corner widget (collapsed state)
  overlayWindow = new BrowserWindow({
    width: 48,
    height: 48,
    x: 8,
    y: 8,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    focusable: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const url = process.env.VITE_DEV_SERVER_URL
    ? `${process.env.VITE_DEV_SERVER_URL}?mode=overlay`
    : `file://${path.join(__dirname, '../../../dist/index.html')}?mode=overlay`;

  overlayWindow.loadURL(url);

  // Start in collapsed state - allow clicks to pass through
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
    // If overlay closes explicitly, bring back main window
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  });

  // Auto-collapse on blur
  overlayWindow.on('blur', () => {
    setOverlayExpanded(false);
    overlayWindow?.webContents.send('overlay-collapsed');
  });
}

// Expand/collapse overlay window
function setOverlayExpanded(expanded: boolean) {
  if (!overlayWindow) return;

  if (expanded) {
    overlayWindow.setSize(148, 56);
    overlayWindow.setPosition(8, 8);
    overlayWindow.setIgnoreMouseEvents(false); // Capture all clicks when expanded
  } else {
    overlayWindow.setSize(48, 48);
    overlayWindow.setPosition(8, 8);
    // Allow clicks to pass through, but forward mouse events so we can detect hover
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  }
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

  // Helper to apply debug options
  const applyDebugOptions = (options: any) => {
    if (!options) return options;
    const modified = { ...options };
    if (disableDoubleTap && modified.advanced) {
      modified.advanced = { ...modified.advanced, typoDoubleWeight: 0 };
    }
    return modified;
  };

  // Legacy handler (direct start)
  ipcMain.handle('start-typing', async (event, text, options) => {
    // Cache it just in case
    currentConfig = { text, options };
    await new Promise(r => setTimeout(r, 3000));
    await startTyping(text, applyDebugOptions(options));
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
      if (overlayWindow) overlayWindow.hide();
      mainWindow?.show();
    }
  });

  // Overlay expand/collapse
  ipcMain.on('set-overlay-expanded', (event, expanded: boolean) => {
    setOverlayExpanded(expanded);
  });

  // Unified Start (from Overlay)
  ipcMain.handle('signal-start', async () => {
    if (!currentConfig) {
      console.error("No config set!");
      return;
    }
    // Instant start (or small delay)
    await new Promise(r => setTimeout(r, 1000));
    await startTyping(currentConfig.text, applyDebugOptions(currentConfig.options));
  });

  ipcMain.on('stop-typing', () => {
    stopTyping();
  });

  // Debug API handlers
  ipcMain.on('set-debug-enabled', (event, enabled: boolean) => {
    debugEnabled = enabled;
    console.log(`[Debug] Debug mode ${enabled ? 'enabled' : 'disabled'}`);
  });

  ipcMain.on('set-disable-double-tap', (event, disabled: boolean) => {
    disableDoubleTap = disabled;
    console.log(`[Debug] Double-tap errors ${disabled ? 'disabled' : 'enabled'}`);
  });
});

app.on('window-all-closed', () => {
  stopTyping();
  if (process.platform !== 'darwin') app.quit();
});

// Export debug enabled state for executor to check
export function isDebugEnabled(): boolean {
  return debugEnabled;
}
