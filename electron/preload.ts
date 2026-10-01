import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('paperlight', {
  print: () => ipcRenderer.invoke('print-document'),
  saveExport: (name: string, data: Uint8Array) => ipcRenderer.invoke('save-export', name, data)
})
