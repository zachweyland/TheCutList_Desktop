const { app, BrowserWindow } = require('electron');
const windowStateKeeper = require('electron-window-state');

const APP_TITLE = 'The Cut List';
const REMOTE_URL = 'https://cutlist.sixteen33.com';

function offlinePageUrl() {
  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${APP_TITLE}</title>
    <style>
      :root {
        color-scheme: light;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #f4f1ea;
        color: #1f1a17;
      }

      main {
        max-width: 28rem;
        padding: 2rem;
        text-align: center;
      }

      h1 {
        margin: 0 0 0.75rem;
        font-size: 1.5rem;
      }

      p {
        margin: 0;
        line-height: 1.5;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${APP_TITLE}</h1>
      <p>Unable to connect to The Cut List. Check your internet connection.</p>
    </main>
  </body>
</html>`;

  return `data:text/html;charset=UTF-8,${encodeURIComponent(html)}`;
}

function createWindow() {
  const mainWindowState = windowStateKeeper({
    defaultWidth: 1200,
    defaultHeight: 800
  });

  const mainWindow = new BrowserWindow({
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
    resizable: true,
    title: APP_TITLE,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindowState.manage(mainWindow);

  mainWindow.on('page-title-updated', (event) => {
    event.preventDefault();
    mainWindow.setTitle(APP_TITLE);
  });

  let showingOfflinePage = false;

  const showOfflinePage = () => {
    if (showingOfflinePage || mainWindow.isDestroyed()) {
      return;
    }

    showingOfflinePage = true;
    mainWindow.loadURL(offlinePageUrl()).catch(() => {});
  };

  const handleLoadFailure = (
    event,
    errorCode,
    errorDescription,
    validatedURL,
    isMainFrame
  ) => {
    if (!isMainFrame) {
      return;
    }

    if (validatedURL && !validatedURL.startsWith(REMOTE_URL)) {
      return;
    }

    showOfflinePage();
  };

  mainWindow.webContents.on('did-fail-load', handleLoadFailure);
  mainWindow.once('closed', () => {
    mainWindow.webContents.removeListener('did-fail-load', handleLoadFailure);
  });

  mainWindow.loadURL(REMOTE_URL).catch(() => {
    showOfflinePage();
  });

  return mainWindow;
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
