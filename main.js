const { app, BrowserWindow } = require('electron')

const createWindow = () => {
  const win = new BrowserWindow({
	  show: false,
	  fullscreen: true,
	  width: 1280,
	  height: 720,
	  minWidth: 1280,
	  minHeight: 720,
    webPreferences: {
      nodeIntegration: false
    }
  }
  )
  win.maximize()
  win.show()
  win.webContents.openDevTools()
  win.loadFile('index.html')
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})