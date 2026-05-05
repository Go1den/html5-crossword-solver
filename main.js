const { app, BrowserWindow } = require('electron')

// run this as early in the main process as possible
if (require('electron-squirrel-startup')) app.quit();

app.setAppUserModelId("com.squirrel.PuzGod.PuzGod");

const createWindow = () => {
  const win = new BrowserWindow({
	  show: false,
	  fullscreen: false,
	  width: 1280,
	  height: 720,
	  minWidth: 1280,
	  minHeight: 720
  }
  )
  win.loadFile('index.html')
  win.show()
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