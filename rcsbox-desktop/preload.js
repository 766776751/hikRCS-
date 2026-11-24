/** preload.js — 安全桥接：仅暴露必要的只读能力给渲染进程 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rcsDesktop', {
  isDesktop: true,
  getBackendUrl: () => ipcRenderer.invoke('get-backend-url'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url)
});
