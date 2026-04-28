const { app, BrowserWindow, Menu, Tray, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const {
  SWARMUI_PORT,
  DEFAULT_VITE_PORT,
  MAX_VITE_PORT_SCAN,
  OPEN_DEVTOOLS,
  MAX_DEV_LOAD_RETRIES,
  DEV_LOAD_RETRY_DELAY_MS,
  ENABLE_DESKTOP_NATIVE_SPELL_CONTEXT_MENU,
  getSwarmUiPaths,
  loadConfig,
  saveConfig,
  loadWindowState,
  saveWindowState,
} = require('./runtime.cjs');
const {
  createLoadingWindow: buildLoadingWindow,
  updateLoadingProgress: sendLoadingProgress,
  closeLoadingWindow: destroyLoadingWindow,
  createSettingsWindow: buildSettingsWindow,
} = require('./auxiliaryWindows.cjs');
const { createUpdaterManager } = require('./updater.cjs');
const { createProcessManager } = require('./process.cjs');
const { registerIpcHandlers } = require('./ipcHandlers.cjs');
const { registerAppLifecycle } = require('./appLifecycle.cjs');

// Global state
let mainWindow = null;
let loadingWindow = null;
let tray = null;
let swarmUIProcess = null;
let viteDevServer = null;
let ownsSwarmUIProcess = false;
let ownsViteDevServer = false;
let serverUrl = 'http://localhost:7801';
let isQuitting = false;
let serverReady = false;
let windowState = {};
let settingsWindow = null;
let stopProcessesPromise = null;
const ignoredWordsByWebContentsId = new Map();
const activePromptTargetByWebContentsId = new Map();

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
let vitePort = DEFAULT_VITE_PORT;
const {
  swarmUiDir: SWARMUI_DIR,
  swarmUiExecutable: SWARMUI_EXECUTABLE,
  configPath,
  windowStatePath,
  performanceMetricsPath,
} = getSwarmUiPaths(app);
const processManager = createProcessManager({
  state: {
    get swarmUIProcess() {
      return swarmUIProcess;
    },
    set swarmUIProcess(value) {
      swarmUIProcess = value;
    },
    get viteDevServer() {
      return viteDevServer;
    },
    set viteDevServer(value) {
      viteDevServer = value;
    },
    get ownsSwarmUIProcess() {
      return ownsSwarmUIProcess;
    },
    set ownsSwarmUIProcess(value) {
      ownsSwarmUIProcess = value;
    },
    get ownsViteDevServer() {
      return ownsViteDevServer;
    },
    set ownsViteDevServer(value) {
      ownsViteDevServer = value;
    },
    get serverUrl() {
      return serverUrl;
    },
    set serverUrl(value) {
      serverUrl = value;
    },
    get serverReady() {
      return serverReady;
    },
    set serverReady(value) {
      serverReady = value;
    },
    get isQuitting() {
      return isQuitting;
    },
    set isQuitting(value) {
      isQuitting = value;
    },
    get vitePort() {
      return vitePort;
    },
    set vitePort(value) {
      vitePort = value;
    },
    get stopProcessesPromise() {
      return stopProcessesPromise;
    },
    set stopProcessesPromise(value) {
      stopProcessesPromise = value;
    },
  },
  runtime: {
    SWARMUI_PORT,
    DEFAULT_VITE_PORT,
    MAX_VITE_PORT_SCAN,
    SWARMUI_DIR,
    SWARMUI_EXECUTABLE,
  },
  dialog,
});
processManager.setUpdateLoadingProgress(updateLoadingProgress);
const updaterManager = createUpdaterManager({
  app,
  dialog,
  loadConfig: () => loadConfig(configPath),
  state: {
    setIsQuitting(value) {
      isQuitting = value;
    },
  },
});

// ============================================================================
// Loading Window
// ============================================================================

function createLoadingWindow() {
  loadingWindow = buildLoadingWindow(BrowserWindow);
}

function updateLoadingProgress(message) {
  sendLoadingProgress(loadingWindow, message);
}

function closeLoadingWindow() {
  destroyLoadingWindow(loadingWindow);
  loadingWindow = null;
}

function handleSwarmRestartRequested() {
  serverReady = false;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }
  createLoadingWindow();
  setTimeout(() => {
    processManager.startSwarmUI({ onRestartRequested: handleSwarmRestartRequested }).then(() => {
      updateLoadingProgress('Opening SwarmUI React...');
      if (!mainWindow || mainWindow.isDestroyed()) {
        createWindow();
      }
      closeLoadingWindow();
    }).catch((error) => {
      console.error('Failed to restart SwarmUI backend:', error);
      closeLoadingWindow();
      dialog.showErrorBox('Restart Error', error.message);
    });
  }, 1000);
}

function startSwarmUI() {
  return processManager.startSwarmUI({ onRestartRequested: handleSwarmRestartRequested });
}

function startViteDevServer() {
  return processManager.startViteDevServer();
}

// ============================================================================
// System Tray
// ============================================================================

function createTray() {
  const iconPath = path.join(__dirname, 'icon.png');

  // Use a nativeImage if icon exists, otherwise skip tray
  if (!fs.existsSync(iconPath)) {
    console.log('Tray icon not found, skipping tray creation');
    return;
  }

  try {
    tray = new Tray(iconPath);
  } catch (error) {
    console.log('Failed to create tray:', error);
    return;
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show SwarmUI React',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else if (serverReady) {
          createWindow();
        }
      }
    },
    {
      label: 'New Window',
      click: () => {
        const config = loadConfig(configPath);
        if (config.multipleWindows) {
          createWindow();
        } else {
          dialog.showMessageBox({
            type: 'info',
            title: 'Multiple Windows Disabled',
            message: 'Multiple windows are disabled in settings.',
            buttons: ['OK']
          });
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: () => {
        createSettingsWindow();
      }
    },
    {
      label: 'Check for Updates',
      click: () => {
        updaterManager.checkForUpdates(true);
      }
    },
    { type: 'separator' },
    {
      label: 'Restart SwarmUI',
      click: () => {
        if (swarmUIProcess) {
          serverReady = false;
          swarmUIProcess.kill();
        }
      }
    },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('SwarmUI React');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    } else if (serverReady) {
      createWindow();
    }
  });
}

function setupPromptContextMenu(window) {
  const webContentsId = window.webContents.id;
  const ignoredWords = ignoredWordsByWebContentsId.get(webContentsId) || new Set();
  const allowElementInspection = true;

  window.webContents.on('context-menu', (_event, params) => {
    const items = [];
    const misspelledWord = (params.misspelledWord || '').trim();
    const misspelledKey = misspelledWord.toLowerCase();
    const isIgnored = misspelledKey.length > 0 && ignoredWords.has(misspelledKey);

    if (ENABLE_DESKTOP_NATIVE_SPELL_CONTEXT_MENU && misspelledWord && !isIgnored) {
      const suggestions = (params.dictionarySuggestions || []).slice(0, 5);

      for (const suggestion of suggestions) {
        items.push({
          label: suggestion,
          click: () => window.webContents.replaceMisspelling(suggestion),
        });
      }

      if (suggestions.length === 0) {
        items.push({ label: 'No spelling suggestions', enabled: false });
      }

      items.push(
        {
          label: 'Add to Dictionary',
          click: () => {
            try {
              window.webContents.session.addWordToSpellCheckerDictionary(misspelledWord);
              ignoredWords.delete(misspelledKey);
              window.webContents.send('ignored-spell-words-updated', Array.from(ignoredWords));
            } catch (error) {
              console.error('Failed to add word to dictionary:', error);
            }
          },
        },
        {
          label: 'Ignore (Session)',
          click: () => {
            ignoredWords.add(misspelledKey);
            window.webContents.send('ignored-spell-words-updated', Array.from(ignoredWords));
          },
        },
        { type: 'separator' }
      );
    }

    if (params.isEditable) {
      if (params.editFlags.canCut) items.push({ role: 'cut' });
      if (params.editFlags.canCopy) items.push({ role: 'copy' });
      if (params.editFlags.canPaste) items.push({ role: 'paste' });
      if (params.editFlags.canSelectAll) items.push({ role: 'selectAll' });
    } else if (params.selectionText && params.selectionText.trim()) {
      items.push({ role: 'copy' });
    }

    const hasActivePromptTarget = !!activePromptTargetByWebContentsId.get(webContentsId);

    if (items.length > 0) {
      items.push({ type: 'separator' });
    }

    items.push(
      {
        label: 'Auto-correct Format',
        enabled: hasActivePromptTarget,
        click: () => {
          window.webContents.send('prompt-context-action', { action: 'autocorrect-format' });
        },
      },
      {
        label: 'Check & Fix Grammar',
        enabled: hasActivePromptTarget,
        click: () => {
          window.webContents.send('prompt-context-action', { action: 'grammar-check' });
        },
      }
    );

    if (allowElementInspection) {
      items.push(
        { type: 'separator' },
        {
          label: 'Inspect Element',
          click: () => {
            window.webContents.inspectElement(params.x, params.y);
          },
        }
      );
    }

    const menu = Menu.buildFromTemplate(items);
    menu.popup({ window });
  });
}

// ============================================================================
// Main Window
// ============================================================================

function createWindow() {
  const config = loadConfig(configPath);

  // Don't allow multiple windows if disabled
  if (mainWindow && !config.multipleWindows) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }

  // Load saved window state
  if (!mainWindow) {
  windowState = loadWindowState(windowStatePath);
  }

  const newWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: 1024,
    minHeight: 768,
    backgroundColor: '#1b1b20',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    title: 'SwarmUI React',
    show: false,
    icon: path.join(__dirname, 'icon.png')
  });
  const webContentsId = newWindow.webContents.id;
  let devLoadRetryCount = 0;
  let devLoadRecoveryInProgress = false;
  ignoredWordsByWebContentsId.set(webContentsId, new Set());
  activePromptTargetByWebContentsId.set(webContentsId, false);
  setupPromptContextMenu(newWindow);

  // Restore maximized state
  if (windowState.isMaximized) {
    newWindow.maximize();
  }

  // Remove default menu
  Menu.setApplicationMenu(null);

  // Load the app
  if (isDev) {
    // Development mode - load from Vite dev server
    newWindow.loadURL(`http://localhost:${vitePort}`);
  } else {
    // Production mode - load from built files
    newWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  if (isDev) {
    newWindow.webContents.on('did-fail-load', async (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame || !validatedURL || !validatedURL.startsWith('http://localhost:')) {
        return;
      }
      if (errorCode !== -102) { // ERR_CONNECTION_REFUSED
        return;
      }
      if (devLoadRecoveryInProgress || devLoadRetryCount >= MAX_DEV_LOAD_RETRIES) {
        return;
      }
      devLoadRecoveryInProgress = true;
      devLoadRetryCount++;
      try {
        console.warn(
          `Failed to load renderer (${errorDescription}) from ${validatedURL}. Recovery attempt ${devLoadRetryCount}/${MAX_DEV_LOAD_RETRIES}.`
        );
        if (!viteDevServer) {
          await startViteDevServer();
        }
        setTimeout(() => {
          if (!newWindow.isDestroyed()) {
            newWindow.loadURL(`http://localhost:${vitePort}`);
          }
        }, DEV_LOAD_RETRY_DELAY_MS);
      } catch (error) {
        console.error('Failed to recover Vite dev server after renderer load failure:', error);
      } finally {
        devLoadRecoveryInProgress = false;
      }
    });

    newWindow.webContents.on('did-finish-load', () => {
      devLoadRetryCount = 0;
    });
  }

  // Show window when ready
  newWindow.once('ready-to-show', () => {
    if (!config.startMinimized) {
      newWindow.show();
    }
  });

  // Open DevTools in development
  if (isDev && OPEN_DEVTOOLS) {
    newWindow.webContents.openDevTools();
  }

  // Handle window close
  newWindow.on('close', (event) => {
    const canMinimizeToTray = config.minimizeToTray && tray && !tray.isDestroyed();
    if (!isQuitting && canMinimizeToTray) {
      event.preventDefault();
      newWindow.hide();
    } else {
      if (newWindow === mainWindow) {
    saveWindowState(windowStatePath, mainWindow);
      }
    }
  });

  newWindow.on('closed', () => {
    ignoredWordsByWebContentsId.delete(webContentsId);
    activePromptTargetByWebContentsId.delete(webContentsId);
    if (newWindow === mainWindow) {
      mainWindow = null;
    }
  });

  // Save state on resize/move
  newWindow.on('resize', () => {
    if (newWindow === mainWindow) {
      clearTimeout(newWindow.stateTimeout);
      newWindow.stateTimeout = setTimeout(saveWindowState, 500);
    }
  });

  newWindow.on('move', () => {
    if (newWindow === mainWindow) {
      clearTimeout(newWindow.stateTimeout);
      newWindow.stateTimeout = setTimeout(saveWindowState, 500);
    }
  });

  // Handle external links
  newWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (config.multipleWindows && (url.startsWith(serverUrl) || url.includes('localhost'))) {
      return { action: 'allow' };
    } else {
      shell.openExternal(url);
      return { action: 'deny' };
    }
  });

  // Set as main window if it's the first
  if (!mainWindow) {
    mainWindow = newWindow;
  }

  return newWindow;
}

// ============================================================================
// Settings Window
// ============================================================================

function createSettingsWindow() {
  settingsWindow = buildSettingsWindow(BrowserWindow, mainWindow, settingsWindow, () => {
    settingsWindow = null;
  });
}

function stopProcesses() {
  return processManager.stopProcesses();
}

// ============================================================================
// IPC Handlers
// ============================================================================
registerIpcHandlers({
  ipcMain,
  BrowserWindow,
  dialog,
  fs,
  path,
  loadConfig,
  saveConfig,
  configPath,
  performanceMetricsPath,
  getState: () => ({
    mainWindow,
    swarmUIProcess,
    serverReady,
    port: SWARMUI_PORT,
  }),
  actions: {
    startSwarmUI,
    stopProcesses,
    setIsQuitting(value) {
      isQuitting = value;
    },
    quitApp() {
      app.quit();
    },
  },
  ignoredWordsByWebContentsId,
  activePromptTargetByWebContentsId,
  ENABLE_DESKTOP_NATIVE_SPELL_CONTEXT_MENU,
});

// ============================================================================
// App Lifecycle
// ============================================================================
registerAppLifecycle({
  app,
  BrowserWindow,
  dialog,
  loadConfig,
  configPath,
  isDev,
  createLoadingWindow,
  updateLoadingProgress,
  closeLoadingWindow,
  createTray,
  createWindow,
  startSwarmUI,
  startViteDevServer,
  stopProcesses,
  updaterManager,
  getState: () => ({
    mainWindow,
    serverReady,
  }),
  setIsQuitting(value) {
    isQuitting = value;
  },
});
