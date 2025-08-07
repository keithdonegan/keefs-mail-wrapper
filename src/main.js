const { app, BrowserWindow, ipcMain, BrowserView } = require('electron');
const path = require('path');

let mainWindow;
const views = [];

const accounts = [
  {
    name: 'Personal',
    icon: 'assets/icons/gmail-personal.png',
    sessionKey: 'gmail-1',
    url: 'https://mail.google.com/mail/u/0/#inbox'
  },
  {
    name: 'Work',
    icon: 'assets/icons/gmail-personal.png',
    sessionKey: 'gmail-2',
    url: 'https://mail.google.com/mail/u/1/#inbox'
  }
];

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      enableRemoteModule: false,
      nodeIntegration: false
    },
    title: "Keef's Mail"
  });

  mainWindow.loadFile('index.html');

  // Clear any existing views
  views.length = 0;

  // Create BrowserViews for each account
  accounts.forEach((account, index) => {
    console.log(`Creating view for ${account.name}`);
    createBrowserView(account, index);
  });

  mainWindow.once('ready-to-show', () => {
    console.log('Window ready to show');
    mainWindow.show();
    
    // Wait a bit for views to initialize, then switch to first view
    setTimeout(() => {
      switchToView(0);
    }, 500);
  });

  mainWindow.on('resize', () => {
    const currentView = mainWindow.getBrowserView();
    if (currentView) {
      updateViewBounds(currentView);
    }
  });

  mainWindow.on('closed', () => {
    // Clean up views
    views.forEach(view => {
      if (view && view.webContents && !view.webContents.isDestroyed()) {
        view.webContents.destroy();
      }
    });
    views.length = 0;
    mainWindow = null;
  });
}

function createBrowserView(account, index) {
  const view = new BrowserView({
    webPreferences: {
      partition: `persist:${account.sessionKey}`,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  view.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.log(`Failed to load ${account.name}: ${errorDescription} (${errorCode}) - ${validatedURL}`);
    
    // Retry loading after a delay if it's a network error
    if (errorCode === -106 || errorCode === -105) { // ERR_INTERNET_DISCONNECTED or ERR_NAME_NOT_RESOLVED
      setTimeout(() => {
        if (!view.webContents.isDestroyed()) {
          view.webContents.loadURL(account.url);
        }
      }, 2000);
    }
  });

  view.webContents.on('did-finish-load', () => {
    console.log(`Successfully loaded ${account.name}`);
  });

  view.webContents.on('dom-ready', () => {
    console.log(`DOM ready for ${account.name}`);
  });

  // Start loading the URL
  view.webContents.loadURL(account.url);
  views[index] = view;
}

function updateViewBounds(view) {
  if (!mainWindow || !view) return;

  const bounds = mainWindow.getContentBounds();
  const sidebarWidth = 60;

  const viewBounds = {
    x: sidebarWidth,
    y: 0,
    width: bounds.width - sidebarWidth,
    height: bounds.height
  };

  console.log(`Setting view bounds:`, viewBounds);
  view.setBounds(viewBounds);
}

function switchToView(index) {
  console.log(`Switching to view ${index}`);

  if (!mainWindow) {
    console.log('No main window available');
    return;
  }

  if (!views[index]) {
    console.log(`No view at index ${index}, recreating...`);
    createBrowserView(accounts[index], index);
    
    // Wait for the new view to load before switching
    views[index].webContents.once('dom-ready', () => {
      performViewSwitch(index);
    });
    return;
  }

  const view = views[index];
  
  if (!view.webContents || view.webContents.isDestroyed()) {
    console.log('View webContents is destroyed, recreating view...');
    createBrowserView(accounts[index], index);
    
    // Wait for the new view to load before switching
    views[index].webContents.once('dom-ready', () => {
      performViewSwitch(index);
    });
    return;
  }

  performViewSwitch(index);
}

function performViewSwitch(index) {
  const view = views[index];
  
  if (!view || !mainWindow) {
    console.log('Cannot perform view switch - missing view or window');
    return;
  }

  // Remove current view
  const currentView = mainWindow.getBrowserView();
  if (currentView) {
    mainWindow.removeBrowserView(currentView);
  }

  // Set the new view
  mainWindow.setBrowserView(view);
  updateViewBounds(view);

  // Ensure the URL is loaded
  const currentURL = view.webContents.getURL();
  if (!currentURL || currentURL === 'about:blank') {
    console.log('View has no URL, loading...');
    view.webContents.loadURL(accounts[index].url);
  }

  // Focus the view
  view.webContents.focus();
  
  console.log(`Successfully switched to view ${index}`);
}

ipcMain.on('switch-account', (event, index) => {
  console.log(`Received switch-account message with index: ${index}`);
  switchToView(index);
});

console.log('🧠 Resolved preload path:', path.join(__dirname, 'preload.js'));
console.log('🧠 Resolved index.html path:', path.join(__dirname, 'index.html'));

app.whenReady().then(() => {
  createWindow();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle app termination more gracefully
app.on('before-quit', () => {
  console.log('App is about to quit, cleaning up...');
  
  views.forEach((view, index) => {
    if (view && view.webContents && !view.webContents.isDestroyed()) {
      console.log(`Cleaning up view ${index}`);
      view.webContents.destroy();
    }
  });
});