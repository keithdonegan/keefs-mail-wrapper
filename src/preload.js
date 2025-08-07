const { contextBridge, ipcRenderer } = require('electron');

console.log('⚡ preload.js loaded');

contextBridge.exposeInMainWorld('electronAPI', {
  switchAccount: (index) => ipcRenderer.send('switch-account', index),
  refreshCurrent: () => ipcRenderer.send('refresh-current-view'),
  refreshAll: () => ipcRenderer.send('refresh-all-views'),
});