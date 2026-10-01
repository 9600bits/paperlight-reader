import { app, BrowserWindow, dialog, ipcMain, print } from 'electron'
import path from 'node:path'

declare const __dirname: string
let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 920, minWidth: 1080, minHeight: 700,
    backgroundColor: '#f7f8fa',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true }
  })
  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) mainWindow.loadURL(devUrl)
  else mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
}

app.whenReady().then(() => {
  ipcMain.handle('print-document', async () => {
    if (!mainWindow) return false
    return new Promise<boolean>((resolve) => mainWindow!.webContents.print({ silent: false, printBackground: true }, (success) => resolve(success)))
  })
  ipcMain.handle('save-export', async (_event, suggestedName: string, data: Uint8Array) => {
    const result = await dialog.showSaveDialog({ defaultPath: suggestedName, filters: [{ name: 'PDF', extensions: ['pdf'] }, { name: 'OFD', extensions: ['ofd'] }] })
    if (result.canceled || !result.filePath) return false
    const fs = await import('node:fs/promises')
    await fs.writeFile(result.filePath, Buffer.from(data))
    return true
  })
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
