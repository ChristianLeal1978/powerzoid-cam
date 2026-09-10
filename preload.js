const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('powerzoid', {
  saveRecording: (buffer, filename) => ipcRenderer.invoke('save-recording', { buffer, filename }),
  showInFolder: (fullPath) => ipcRenderer.invoke('show-in-folder', fullPath),
});
