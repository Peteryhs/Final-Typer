import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  startTyping: (text: string, options: any) => ipcRenderer.invoke('start-typing', text, options),
  stopTyping: () => ipcRenderer.send('stop-typing'),
  
  // Overlay & State Management
  toggleOverlay: () => ipcRenderer.send('toggle-overlay'),
  setConfig: (config: any) => ipcRenderer.send('set-config', config),
  signalStart: () => ipcRenderer.invoke('signal-start'), // Starts using stored config

  // Window Controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
});
