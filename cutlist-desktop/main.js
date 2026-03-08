const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const windowStateKeeper = require('electron-window-state');

const APP_TITLE = 'The Cut List';
const REMOTE_URL = 'https://cutlist.sixteen33.com';
const APP_ORIGIN = new URL(REMOTE_URL).origin;
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
let autoUpdaterConfigured = false;
let mainWindow = null;
let manualUpdateCheck = false;
let runUpdateCheck = () => Promise.resolve();

function injectDesktopChrome(browserWindow) {
  const { webContents } = browserWindow;
  const code = `
    (() => {
      if (window.location.origin !== ${JSON.stringify(APP_ORIGIN)}) {
        return;
      }

      const styleId = 'cutlist-desktop-chrome-style';
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = \`
          .cutlist-desktop-draggable-header {
            -webkit-app-region: drag;
          }

          .cutlist-desktop-draggable-header a,
          .cutlist-desktop-draggable-header button,
          .cutlist-desktop-draggable-header input,
          .cutlist-desktop-draggable-header select,
          .cutlist-desktop-draggable-header textarea,
          .cutlist-desktop-draggable-header summary,
          .cutlist-desktop-draggable-header label,
          .cutlist-desktop-draggable-header [role="button"],
          .cutlist-desktop-draggable-header img,
          .cutlist-desktop-draggable-header svg {
            -webkit-app-region: no-drag;
          }
        \`;

        document.head.append(style);
      }

      const header =
        document.querySelector('header') ||
        document.querySelector('[role="banner"]') ||
        document.querySelector('nav');

      if (!header) {
        return;
      }

      if (!header.classList.contains('cutlist-desktop-draggable-header')) {
        header.classList.add('cutlist-desktop-draggable-header');
      }
    })();
  `;

  const inject = () => {
    if (browserWindow.isDestroyed() || webContents.isDestroyed()) {
      return;
    }

    webContents.executeJavaScript(code).catch(() => {});
  };

  webContents.on('did-finish-load', inject);
  webContents.on('did-navigate-in-page', inject);
  browserWindow.once('close', () => {
    webContents.removeListener('did-finish-load', inject);
    webContents.removeListener('did-navigate-in-page', inject);
  });
}

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
        margin: 0 0 1.5rem;
        line-height: 1.5;
      }

      button {
        border: 0;
        border-radius: 999px;
        padding: 0.85rem 1.2rem;
        font: inherit;
        font-weight: 600;
        color: #fff;
        background: #1f7a57;
        cursor: pointer;
      }

      button:hover {
        background: #176044;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${APP_TITLE}</h1>
      <p>Unable to connect to The Cut List. Check your internet connection.</p>
      <button id="retry" type="button">Retry</button>
    </main>
    <script>
      const retry = () => {
        window.location.replace(${JSON.stringify(REMOTE_URL)});
      };

      document.getElementById('retry').addEventListener('click', retry);
      window.addEventListener('online', retry);
    </script>
  </body>
</html>`;

  return `data:text/html;charset=UTF-8,${encodeURIComponent(html)}`;
}

function isAppUrl(urlString) {
  if (!urlString) {
    return false;
  }

  if (urlString.startsWith('data:text/html')) {
    return true;
  }

  try {
    return new URL(urlString).origin === APP_ORIGIN;
  } catch {
    return false;
  }
}

function withFocusedWindow(action) {
  const focusedWindow = BrowserWindow.getFocusedWindow() || mainWindow;

  if (!focusedWindow || focusedWindow.isDestroyed()) {
    return;
  }

  action(focusedWindow);
}

function buildAppMenu() {
  const template = [
    ...(process.platform === 'darwin'
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              {
                label: 'Check for Updates',
                click: () => {
                  runUpdateCheck({ manual: true });
                }
              },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' }
            ]
          }
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open in Browser',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => {
            shell.openExternal(REMOTE_URL).catch(() => {});
          }
        },
        ...(process.platform === 'darwin' ? [] : [{ type: 'separator' }, { role: 'quit' }])
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Back',
          accelerator: 'Alt+Left',
          click: () => {
            withFocusedWindow((window) => {
              if (window.webContents.canGoBack()) {
                window.webContents.goBack();
              }
            });
          }
        },
        {
          label: 'Forward',
          accelerator: 'Alt+Right',
          click: () => {
            withFocusedWindow((window) => {
              if (window.webContents.canGoForward()) {
                window.webContents.goForward();
              }
            });
          }
        },
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            withFocusedWindow((window) => {
              if (window.webContents.getURL().startsWith('data:text/html')) {
                window.loadURL(REMOTE_URL).catch(() => {});
                return;
              }

              window.webContents.reload();
            });
          }
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' }
      ]
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, ...(process.platform === 'darwin' ? [{ role: 'front' }] : [{ role: 'close' }])]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates',
          click: () => {
            runUpdateCheck({ manual: true });
          }
        },
        {
          label: 'Open in Browser',
          click: () => {
            shell.openExternal(REMOTE_URL).catch(() => {});
          }
        }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function setupExternalLinkHandling(browserWindow) {
  const { webContents } = browserWindow;

  webContents.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url)) {
      return { action: 'allow' };
    }

    shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });

  webContents.on('will-navigate', (event, url) => {
    if (isAppUrl(url)) {
      return;
    }

    event.preventDefault();
    shell.openExternal(url).catch(() => {});
  });
}

function createWindow() {
  const mainWindowState = windowStateKeeper({
    defaultWidth: 1200,
    defaultHeight: 800
  });

  const browserWindow = new BrowserWindow({
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
    resizable: true,
    title: APP_TITLE,
    ...(process.platform === 'darwin'
      ? {
          titleBarStyle: 'hiddenInset',
          trafficLightPosition: {
            x: 16,
            y: 16
          }
        }
      : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const { webContents } = browserWindow;
  mainWindowState.manage(browserWindow);
  setupExternalLinkHandling(browserWindow);
  injectDesktopChrome(browserWindow);

  if (process.platform === 'darwin') {
    browserWindow.setWindowButtonVisibility(true);
  }

  browserWindow.on('page-title-updated', (event) => {
    event.preventDefault();
    browserWindow.setTitle(APP_TITLE);
  });

  let showingOfflinePage = false;

  const showOfflinePage = () => {
    if (showingOfflinePage || browserWindow.isDestroyed()) {
      return;
    }

    showingOfflinePage = true;
    browserWindow.loadURL(offlinePageUrl()).catch(() => {});
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

  webContents.on('did-fail-load', handleLoadFailure);
  browserWindow.once('close', () => {
    if (!webContents.isDestroyed()) {
      webContents.removeListener('did-fail-load', handleLoadFailure);
    }

    if (mainWindow === browserWindow) {
      mainWindow = null;
    }
  });

  browserWindow.loadURL(REMOTE_URL).catch(() => {
    showOfflinePage();
  });

  return browserWindow;
}

function setupAutoUpdater() {
  runUpdateCheck = ({ manual = false } = {}) => {
    if (!app.isPackaged) {
      if (manual) {
        dialog.showMessageBox({
          type: 'info',
          title: APP_TITLE,
          message: 'Update checks are only available in packaged builds.'
        }).catch(() => {});
      }

      return Promise.resolve();
    }

    manualUpdateCheck = manual;

    return autoUpdater.checkForUpdatesAndNotify().catch((error) => {
      manualUpdateCheck = false;
      console.error('Unable to check for updates:', error == null ? error : error.message);

      if (manual) {
        dialog.showErrorBox(APP_TITLE, 'Unable to check for updates right now.');
      }
    });
  };

  if (!app.isPackaged || autoUpdaterConfigured) {
    return;
  }

  autoUpdaterConfigured = true;

  let promptingForInstall = false;

  autoUpdater.on('error', (error) => {
    manualUpdateCheck = false;
    console.error('Auto-update failed:', error == null ? error : error.message);
  });

  autoUpdater.on('update-available', () => {
    manualUpdateCheck = false;
  });

  autoUpdater.on('update-not-available', () => {
    if (!manualUpdateCheck) {
      return;
    }

    manualUpdateCheck = false;
    dialog.showMessageBox({
      type: 'info',
      title: APP_TITLE,
      message: 'The Cut List is up to date.'
    }).catch(() => {});
  });

  autoUpdater.on('update-downloaded', async () => {
    const activeWindow = BrowserWindow.getFocusedWindow() || mainWindow;

    if (promptingForInstall || !activeWindow || activeWindow.isDestroyed()) {
      return;
    }

    promptingForInstall = true;

    const { response } = await dialog.showMessageBox(activeWindow, {
      type: 'info',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: APP_TITLE,
      message: 'An update for The Cut List has been downloaded.',
      detail: 'Restart the app to install the latest version.'
    });

    promptingForInstall = false;

    if (response === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  const checkForUpdates = () => {
    runUpdateCheck();
  };

  checkForUpdates();
  setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL_MS);
}

app.whenReady().then(() => {
  buildAppMenu();
  mainWindow = createWindow();
  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
      setupAutoUpdater();
    }
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
