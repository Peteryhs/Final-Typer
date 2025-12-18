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

// Overlay auto-show state
let autoOverlayEnabled = false;

// Typing state - centralized state management
const typingState = {
  isActive: false,
  isPaused: false,
  isResuming: false,
  pauseResolve: null as (() => void) | null,

  reset() {
    this.isActive = false;
    this.isPaused = false;
    this.isResuming = false;
    this.pauseResolve = null;
  },

  cancelResume() {
    this.isResuming = false;
  },

  getDebugInfo() {
    return {
      isActive: this.isActive,
      isPaused: this.isPaused,
      isResuming: this.isResuming,
      hasPauseResolve: this.pauseResolve !== null
    };
  }
};

// Helper to broadcast state to all windows
function broadcastState() {
  const state = {
    isPaused: typingState.isPaused,
    isTypingActive: typingState.isActive
  };
  mainWindow?.webContents.send('pause-state-changed', state);
  overlayWindow?.webContents.send('pause-state-changed', state);
}

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
  ipcMain.on('window-minimize', () => {
    mainWindow?.minimize();
    // Auto-show overlay if typing is active and auto-overlay is enabled
    if (typingState.isActive && autoOverlayEnabled && mainWindow) {
      if (!overlayWindow) createOverlayWindow();
      else overlayWindow.show();
      // Notify renderer that overlay was auto-shown
      mainWindow.webContents.send('overlay-auto-shown');
    }
  });
  ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.on('window-close', () => mainWindow?.close());

  // Typing state tracking (from renderer) - DEPRECATED, use typingState directly
  ipcMain.on('set-typing-state', (event, typing: boolean) => {
    // Ignored - typingState is now managed internally
    console.log('[Main] set-typing-state called but ignored, state managed internally');
  });

  // Auto-overlay setting
  ipcMain.on('set-auto-overlay-enabled', (event, enabled: boolean) => {
    autoOverlayEnabled = enabled;
  });

  // Helper to apply debug options
  const applyDebugOptions = (options: any) => {
    if (!options) return options;
    const modified = { ...options };
    if (disableDoubleTap && modified.advanced) {
      modified.advanced = { ...modified.advanced, typoDoubleWeight: 0 };
    }
    return modified;
  };

  // Legacy handler (direct start from main window)
  ipcMain.handle('start-typing', async (event, text, options) => {
    console.log('[Main] start-typing called', typingState.getDebugInfo());

    // Prevent starting a new session while one is already active
    if (typingState.isActive) {
      console.log('[Main] Typing session already active, ignoring start-typing');
      return;
    }

    // Cache config
    currentConfig = { text, options };

    // Set typing state to active
    typingState.isActive = true;
    typingState.isPaused = false;
    typingState.isResuming = false;

    // Broadcast initial state
    broadcastState();

    try {
      // 3 second countdown before starting
      await new Promise(r => setTimeout(r, 3000));
      console.log('[Main] Initial delay complete, starting typing...');

      await startTyping(text, applyDebugOptions(options));
    } catch (err) {
      if (err instanceof Error && err.message === 'Aborted') {
        console.log('[Main] Typing was aborted');
      } else {
        console.error('[Main] Typing error:', err);
      }
    } finally {
      // Reset all typing state
      typingState.reset();
      console.log('[Main] Typing session completed');
      broadcastState();
    }
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
    console.log('[Main] signal-start called', typingState.getDebugInfo());

    // Prevent starting a new session while one is already active
    if (typingState.isActive) {
      console.log('[Main] Typing session already active, ignoring signal-start');
      return;
    }

    if (!currentConfig) {
      console.error("[Main] No config set!");
      return;
    }
    console.log('[Main] Starting typing from overlay/config', {
      textLength: currentConfig.text.length,
      speed: currentConfig.options.speed
    });

    // Set typing state to active
    typingState.isActive = true;
    typingState.isPaused = false;
    typingState.isResuming = false;

    // Broadcast initial state
    broadcastState();

    try {
      // Initial delay for user to switch focus
      console.log('[Main] Starting initial 1s delay...');
      await new Promise(r => setTimeout(r, 1000));
      console.log('[Main] Initial delay complete, isPaused:', typingState.isPaused);

      // The executor already has pause checking built in, so we don't need to check here
      // This allows Typer.exe to be spawned first, then pausing works correctly

      await startTyping(currentConfig.text, applyDebugOptions(currentConfig.options));
    } catch (err) {
      if (err instanceof Error && err.message === 'Aborted') {
        console.log('[Main] Typing was aborted');
      } else {
      }
    } finally {
      // Reset all typing state
      typingState.reset();
      console.log('[Main] Typing session completed');

      // Broadcast final state
      broadcastState();
    }
  });

  ipcMain.on('stop-typing', () => {
    console.log('[Main] Stop typing requested');
    stopTyping();
    typingState.reset();
    broadcastState();
  });

  // Pause/Resume functionality - SIMPLIFIED
  ipcMain.on('pause-typing', () => {
    console.log('[Main] Pause requested', typingState.getDebugInfo());

    if (!typingState.isActive) {
      console.log('[Main] Cannot pause - no active session');
      return;
    }

    if (typingState.isPaused) {
      console.log('[Main] Already paused, ignoring');
      return;
    }

    // Cancel any ongoing resume countdown
    typingState.cancelResume();

    // Set paused state
    typingState.isPaused = true;
    console.log('[Main] Typing PAUSED');
    broadcastState();
  });

  ipcMain.on('resume-typing', async () => {
    console.log('[Main] Resume requested', typingState.getDebugInfo());

    if (!typingState.isActive) {
      console.log('[Main] Cannot resume - no active session');
      return;
    }

    if (!typingState.isPaused) {
      console.log('[Main] Not paused, ignoring resume');
      return;
    }

    if (typingState.isResuming) {
      console.log('[Main] Already resuming, ignoring');
      return;
    }

    typingState.isResuming = true;
    console.log('[Main] Starting 3s resume countdown...');

    // Countdown loop
    for (let i = 3; i > 0; i--) {
      console.log(`[Main] Resume countdown: ${i}`);
      mainWindow?.webContents.send('resume-countdown', i);
      overlayWindow?.webContents.send('resume-countdown', i);

      await new Promise(r => setTimeout(r, 1000));

      // Check if we should abort
      if (!typingState.isResuming || !typingState.isActive) {
        console.log('[Main] Resume countdown ABORTED');
        typingState.isResuming = false;
        mainWindow?.webContents.send('resume-countdown', null);
        overlayWindow?.webContents.send('resume-countdown', null);
        return;
      }
    }

    // Actually resume
    typingState.isPaused = false;
    typingState.isResuming = false;
    console.log('[Main] Typing RESUMED - unblocking executor');

    // Unblock the executor
    if (typingState.pauseResolve) {
      typingState.pauseResolve();
      typingState.pauseResolve = null;
    }

    // Clear countdown and broadcast new state
    mainWindow?.webContents.send('resume-countdown', null);
    overlayWindow?.webContents.send('resume-countdown', null);
    broadcastState();
  });

  // Get pause state - always returns current authoritative state
  ipcMain.handle('get-pause-state', () => {
    return {
      isPaused: typingState.isPaused,
      isTypingActive: typingState.isActive,
      isResuming: typingState.isResuming
    };
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

// Pause check function for executor - blocks until resumed
export async function checkPauseState(): Promise<void> {
  if (typingState.isPaused) {
    console.log('[Main] Executor waiting for resume...');
    return new Promise<void>((resolve) => {
      typingState.pauseResolve = resolve;
    });
  }
}
