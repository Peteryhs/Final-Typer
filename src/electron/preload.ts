import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  startTyping: (text: string, options: any) => ipcRenderer.invoke('start-typing', text, options),
  stopTyping: () => ipcRenderer.send('stop-typing'),
  pauseTyping: () => ipcRenderer.send('pause-typing'),
  resumeTyping: () => ipcRenderer.send('resume-typing'),
  getPauseState: () => ipcRenderer.invoke('get-pause-state'),

  // Overlay & State Management
  toggleOverlay: () => ipcRenderer.send('toggle-overlay'),
  setOverlayExpanded: (expanded: boolean) => ipcRenderer.send('set-overlay-expanded', expanded),
  onOverlayCollapsed: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('overlay-collapsed', handler);
    return () => ipcRenderer.removeListener('overlay-collapsed', handler);
  },
  onOverlayAutoShown: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('overlay-auto-shown', handler);
    return () => ipcRenderer.removeListener('overlay-auto-shown', handler);
  },
  setConfig: (config: any) => ipcRenderer.send('set-config', config),
  signalStart: () => ipcRenderer.invoke('signal-start'), // Starts using stored config

  // Typing state & Auto-overlay
  setTypingState: (typing: boolean) => ipcRenderer.send('set-typing-state', typing),
  setAutoOverlayEnabled: (enabled: boolean) => ipcRenderer.send('set-auto-overlay-enabled', enabled),

  // Window Controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  // Debug API
  onDebugLog: (callback: (log: any) => void) => {
    const handler = (_event: any, log: any) => callback(log);
    ipcRenderer.on('debug-log', handler);
    return () => ipcRenderer.removeListener('debug-log', handler);
  },
  setDebugEnabled: (enabled: boolean) => ipcRenderer.send('set-debug-enabled', enabled),
  setDisableDoubleTap: (disabled: boolean) => ipcRenderer.send('set-disable-double-tap', disabled),

  // Pause state changes
  onPauseStateChanged: (callback: (data: { isPaused: boolean; isTypingActive: boolean }) => void) => {
    const handler = (_event: any, data: { isPaused: boolean; isTypingActive: boolean }) => {
      console.log('Pause state changed in renderer:', data);
      callback(data);
    };
    ipcRenderer.on('pause-state-changed', handler);
    return () => ipcRenderer.removeListener('pause-state-changed', handler);
  },
  onResumeCountdown: (callback: (seconds: number | null) => void) => {
    const handler = (_event: any, seconds: number | null) => callback(seconds);
    ipcRenderer.on('resume-countdown', handler);
    return () => ipcRenderer.removeListener('resume-countdown', handler);
  },
});

