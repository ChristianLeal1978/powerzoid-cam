const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('powerzoid', {
  saveRecording: (buffer, filename) => ipcRenderer.invoke('save-recording', { buffer, filename }),
  showInFolder: (fullPath) => ipcRenderer.invoke('show-in-folder', fullPath),

  // Usado por la ventana principal para abrir el overlay de selección de región
  // y para pedirle que confirme/cancele desde los botones de la propia app.
  selectRegion: (ratio) => ipcRenderer.invoke('open-region-selector', { ratio }),
  requestRegionConfirm: () => ipcRenderer.send('region-request-confirm'),
  requestRegionCancel: () => ipcRenderer.send('region-request-cancel'),

  // Usado por la propia ventana overlay (region-overlay.html).
  onRegionInit: (callback) => ipcRenderer.on('region-init', (_event, data) => callback(data)),
  onRegionConfirmRequest: (callback) => ipcRenderer.on('region-do-confirm', callback),
  onRegionCancelRequest: (callback) => ipcRenderer.on('region-do-cancel', callback),
  confirmRegion: (rect) => ipcRenderer.send('region-selected', rect),
  cancelRegion: () => ipcRenderer.send('region-cancelled'),
  setOverlayInteractive: (interactive) => ipcRenderer.send('region-set-interactive', interactive),
});
