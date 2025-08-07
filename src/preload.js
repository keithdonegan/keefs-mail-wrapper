const { contextBridge, ipcRenderer } = require('electron');

console.log('⚡ preload.js loaded'); // <== THIS WILL TELL US IF IT EVEN RUNS

contextBridge.exposeInMainWorld('electronAPI', {
  switchAccount: (index) => ipcRenderer.send('switch-account', index),
});