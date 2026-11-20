'use strict';
const { contextBridge, ipcRenderer } = require('electron');

/**
 * What a page may ask of the shell. Remote pages (AVEN. itself) get read-only facts; only the shell's own local pages
 * (file://) can change the server address or retry. The main process checks the sender again.
 */
const local = location.protocol === 'file:';
contextBridge.exposeInMainWorld('avenDesktop', {
  platform: process.platform,
  version: ipcRenderer.sendSync('aven:version'),
  ...(local ? {
    setServerUrl: (url) => ipcRenderer.invoke('aven:set-url', url),
    retry: () => ipcRenderer.invoke('aven:retry'),
    changeServer: () => ipcRenderer.invoke('aven:change-server'),
  } : {}),
});
