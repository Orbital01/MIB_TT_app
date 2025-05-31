const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // Drive operations
    getDrives: () => ipcRenderer.invoke('get-drives'),

    // M.I.B package operations
    getMIBPackage: () => ipcRenderer.invoke('select-archive'), // Renamed for clarity
    getArchiveFiles: (archivePath) => ipcRenderer.invoke('get-archive-files', archivePath),

    // SD Card operations
    formatSDCard: (options) => ipcRenderer.invoke('format-sd-card', options),
    copyFileToSD: (options) => ipcRenderer.invoke('copy-file-to-sd', options),

    // UI operations
    showMessageBox: (options) => ipcRenderer.invoke('show-message-box', options)


});