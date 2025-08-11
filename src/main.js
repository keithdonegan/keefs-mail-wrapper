/* const { app, BrowserWindow, ipcMain, BrowserView } = require('electron');
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
    backgroundColor: '#1f1f1f', // Dark background to minimize white flash
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
      nodeIntegration: false,
      backgroundThrottling: false, // Prevent background tab throttling
      paintWhenInitiallyHidden: false // Reduce white flash
    },
    show: false // Don't show until ready
  });

  // Store account info on the view for reference
  view.accountInfo = account;
  view.accountIndex = index;

  view.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.log(`Failed to load ${account.name}: ${errorDescription} (${errorCode}) - ${validatedURL}`);
    
    // Retry loading after a delay for network errors
    if (errorCode === -106 || errorCode === -105 || errorCode === -501) { 
      setTimeout(() => {
        if (!view.webContents.isDestroyed()) {
          console.log(`Retrying load for ${account.name}...`);
          view.webContents.loadURL(account.url);
        }
      }, 2000);
    }
  });

  view.webContents.on('did-finish-load', () => {
    console.log(`Successfully loaded ${account.name}`);
    view.lastLoadTime = Date.now();
  });

  view.webContents.on('dom-ready', () => {
    console.log(`DOM ready for ${account.name}`);
  });

  // Handle page becoming unresponsive (crashed or hung)
  view.webContents.on('unresponsive', () => {
    console.log(`${account.name} became unresponsive, reloading...`);
    if (!view.webContents.isDestroyed()) {
      view.webContents.reload();
    }
  });

  // Handle page crashes
  view.webContents.on('render-process-gone', (event, details) => {
    console.log(`${account.name} render process gone:`, details.reason);
    if (!view.webContents.isDestroyed()) {
      setTimeout(() => {
        view.webContents.loadURL(account.url);
      }, 1000);
    }
  });

  // Detect when page shows login/auth screens
  view.webContents.on('did-navigate', (event, navigationUrl) => {
    console.log(`${account.name} navigated to: ${navigationUrl}`);
    
    // Check if we've been redirected to a login page
    if (navigationUrl.includes('accounts.google.com') && 
        !navigationUrl.includes('oauth') && 
        navigationUrl.includes('signin')) {
      console.log(`${account.name} appears to need re-authentication`);
    }
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

  // Pre-configure the view bounds before showing it
  updateViewBounds(view);

  // Get current view for smooth transition
  const currentView = mainWindow.getBrowserView();
  
  // Set the new view BEFORE removing the old one to reduce flash
  mainWindow.setBrowserView(view);
  
  // Now remove the old view if it exists and is different
  if (currentView && currentView !== view) {
    // Small delay to ensure new view is rendering
    setTimeout(() => {
      mainWindow.removeBrowserView(currentView);
    }, 50);
  }

  // Check if the view needs refreshing
  const currentURL = view.webContents.getURL();
  const timeSinceLastLoad = view.lastLoadTime ? Date.now() - view.lastLoadTime : Infinity;
  
  // Refresh if no URL, about:blank, or it's been more than 30 minutes since last load
  if (!currentURL || 
      currentURL === 'about:blank' || 
      timeSinceLastLoad > 30 * 60 * 1000) {
    
    console.log(`View ${index} needs refresh (URL: ${currentURL}, last load: ${timeSinceLastLoad}ms ago)`);
    view.webContents.loadURL(accounts[index].url);
  } else {
    // Just reload to ensure fresh content, but only if it's been a while
    if (timeSinceLastLoad > 10 * 60 * 1000) { // 10 minutes
      console.log('Reloading view to ensure fresh content...');
      view.webContents.reload();
    }
  }

  // Focus the view
  view.webContents.focus();
  
  console.log(`Successfully switched to view ${index}`);
}

// Add a function to refresh all views periodically
function startPeriodicRefresh() {
  setInterval(() => {
    const currentTime = Date.now();
    
    views.forEach((view, index) => {
      if (view && view.webContents && !view.webContents.isDestroyed()) {
        const timeSinceLastLoad = view.lastLoadTime ? currentTime - view.lastLoadTime : Infinity;
        
        // Refresh inactive views that haven't been loaded in over 45 minutes
        const isActiveView = mainWindow?.getBrowserView() === view;
        
        if (!isActiveView && timeSinceLastLoad > 45 * 60 * 1000) {
          console.log(`Refreshing inactive view ${index} (${accounts[index].name})`);
          view.webContents.loadURL(accounts[index].url);
        }
      }
    });
  }, 10 * 60 * 1000); // Check every 10 minutes
}

// Add refresh functionality to IPC
ipcMain.on('refresh-current-view', () => {
  const currentView = mainWindow?.getBrowserView();
  if (currentView && !currentView.webContents.isDestroyed()) {
    console.log('Manually refreshing current view');
    currentView.webContents.reload();
  }
});

ipcMain.on('refresh-all-views', () => {
  console.log('Manually refreshing all views');
  views.forEach((view, index) => {
    if (view && view.webContents && !view.webContents.isDestroyed()) {
      view.webContents.loadURL(accounts[index].url);
    }
  });
});

ipcMain.on('switch-account', (event, index) => {
  console.log(`Received switch-account message with index: ${index}`);
  switchToView(index);
});

console.log('🧠 Resolved preload path:', path.join(__dirname, 'preload.js'));
console.log('🧠 Resolved index.html path:', path.join(__dirname, 'index.html'));

app.whenReady().then(() => {
  createWindow();
  
  // Start the periodic refresh system
  startPeriodicRefresh();
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
}); */

const { app, BrowserWindow, ipcMain, BrowserView, shell } = require('electron');
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
    backgroundColor: '#1f1f1f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      enableRemoteModule: false,
      nodeIntegration: false
    },
    title: "Keef's Mail"
  });

  mainWindow.loadFile('index.html');
  views.length = 0;

  accounts.forEach((account, index) => {
    console.log(`Creating view for ${account.name}`);
    createBrowserView(account, index);
  });

  mainWindow.once('ready-to-show', () => {
    console.log('Window ready to show');
    mainWindow.show();
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
      nodeIntegration: false,
      backgroundThrottling: false,
      paintWhenInitiallyHidden: false
    },
    show: false
  });

  view.accountInfo = account;
  view.accountIndex = index;

  // PATCH: handle external links
  view.webContents.setWindowOpenHandler(({ url }) => {
    if (
      !url.startsWith('https://mail.google.com/') &&
      !url.startsWith('https://accounts.google.com/')
    ) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  view.webContents.on('will-navigate', (event, url) => {
    if (
      !url.startsWith('https://mail.google.com/') &&
      !url.startsWith('https://accounts.google.com/')
    ) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  view.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.log(`Failed to load ${account.name}: ${errorDescription} (${errorCode}) - ${validatedURL}`);
    if (errorCode === -106 || errorCode === -105 || errorCode === -501) { 
      setTimeout(() => {
        if (!view.webContents.isDestroyed()) {
          console.log(`Retrying load for ${account.name}...`);
          view.webContents.loadURL(account.url);
        }
      }, 2000);
    }
  });

  view.webContents.on('did-finish-load', () => {
    console.log(`Successfully loaded ${account.name}`);
    view.lastLoadTime = Date.now();
  });

  view.webContents.on('dom-ready', () => {
    console.log(`DOM ready for ${account.name}`);
  });

  view.webContents.on('unresponsive', () => {
    console.log(`${account.name} became unresponsive, reloading...`);
    if (!view.webContents.isDestroyed()) {
      view.webContents.reload();
    }
  });

  view.webContents.on('render-process-gone', (event, details) => {
    console.log(`${account.name} render process gone:`, details.reason);
    if (!view.webContents.isDestroyed()) {
      setTimeout(() => {
        view.webContents.loadURL(account.url);
      }, 1000);
    }
  });

  view.webContents.on('did-navigate', (event, navigationUrl) => {
    console.log(`${account.name} navigated to: ${navigationUrl}`);
    if (navigationUrl.includes('accounts.google.com') &&
        !navigationUrl.includes('oauth') &&
        navigationUrl.includes('signin')) {
      console.log(`${account.name} appears to need re-authentication`);
    }
  });

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
  if (!mainWindow) return;

  if (!views[index]) {
    console.log(`No view at index ${index}, recreating...`);
    createBrowserView(accounts[index], index);
    views[index].webContents.once('dom-ready', () => {
      performViewSwitch(index);
    });
    return;
  }

  const view = views[index];
  if (!view.webContents || view.webContents.isDestroyed()) {
    console.log('View webContents is destroyed, recreating view...');
    createBrowserView(accounts[index], index);
    views[index].webContents.once('dom-ready', () => {
      performViewSwitch(index);
    });
    return;
  }

  performViewSwitch(index);
}

function performViewSwitch(index) {
  const view = views[index];
  if (!view || !mainWindow) return;

  updateViewBounds(view);
  const currentView = mainWindow.getBrowserView();
  mainWindow.setBrowserView(view);

  if (currentView && currentView !== view) {
    setTimeout(() => {
      mainWindow.removeBrowserView(currentView);
    }, 50);
  }

  const currentURL = view.webContents.getURL();
  const timeSinceLastLoad = view.lastLoadTime ? Date.now() - view.lastLoadTime : Infinity;

  if (!currentURL || currentURL === 'about:blank' || timeSinceLastLoad > 30 * 60 * 1000) {
    console.log(`View ${index} needs refresh`);
    view.webContents.loadURL(accounts[index].url);
  } else if (timeSinceLastLoad > 10 * 60 * 1000) {
    console.log('Reloading view to ensure fresh content...');
    view.webContents.reload();
  }

  view.webContents.focus();
  console.log(`Successfully switched to view ${index}`);
}

function startPeriodicRefresh() {
  setInterval(() => {
    const currentTime = Date.now();
    views.forEach((view, index) => {
      if (view && view.webContents && !view.webContents.isDestroyed()) {
        const timeSinceLastLoad = view.lastLoadTime ? currentTime - view.lastLoadTime : Infinity;
        const isActiveView = mainWindow?.getBrowserView() === view;
        if (!isActiveView && timeSinceLastLoad > 45 * 60 * 1000) {
          console.log(`Refreshing inactive view ${index} (${accounts[index].name})`);
          view.webContents.loadURL(accounts[index].url);
        }
      }
    });
  }, 10 * 60 * 1000);
}

ipcMain.on('refresh-current-view', () => {
  const currentView = mainWindow?.getBrowserView();
  if (currentView && !currentView.webContents.isDestroyed()) {
    console.log('Manually refreshing current view');
    currentView.webContents.reload();
  }
});

ipcMain.on('refresh-all-views', () => {
  console.log('Manually refreshing all views');
  views.forEach((view, index) => {
    if (view && view.webContents && !view.webContents.isDestroyed()) {
      view.webContents.loadURL(accounts[index].url);
    }
  });
});

ipcMain.on('switch-account', (event, index) => {
  console.log(`Received switch-account message with index: ${index}`);
  switchToView(index);
});

console.log('🧠 Resolved preload path:', path.join(__dirname, 'preload.js'));
console.log('🧠 Resolved index.html path:', path.join(__dirname, 'index.html'));

app.whenReady().then(() => {
  createWindow();
  startPeriodicRefresh();
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

app.on('before-quit', () => {
  console.log('App is about to quit, cleaning up...');
  views.forEach((view, index) => {
    if (view && view.webContents && !view.webContents.isDestroyed()) {
      console.log(`Cleaning up view ${index}`);
      view.webContents.destroy();
    }
  });
});