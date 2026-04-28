const { contextBridge, ipcRenderer, webFrame } = require('electron');
const promptContextActionListeners = new Map();
const ignoredSpellWordsListeners = new Map();
const NATIVE_SPELL_CONTEXT_MENU_ENABLED = process.env.SWARMUI_NATIVE_SPELL_CONTEXT_MENU !== '0';

function hasNativeSpellcheck() {
  try {
    return typeof webFrame.isWordMisspelled === 'function' &&
      typeof webFrame.getWordSuggestions === 'function';
  } catch {
    return false;
  }
}

function scanTextForMisspellings(text) {
  if (!hasNativeSpellcheck() || typeof text !== 'string' || text.length === 0) {
    return [];
  }

  const issues = [];
  const wordRegex = /\p{L}[\p{L}'-]*/gu;

  for (const match of text.matchAll(wordRegex)) {
    const word = match[0];
    const startIndex = match.index;

    if (typeof startIndex !== 'number') {
      continue;
    }
    if (word.length < 3 || /\d/.test(word)) {
      continue;
    }

    let misspelled = false;
    try {
      misspelled = webFrame.isWordMisspelled(word);
    } catch {
      misspelled = false;
    }
    if (!misspelled) {
      continue;
    }

    let suggestions = [];
    try {
      suggestions = webFrame
        .getWordSuggestions(word)
        .filter(suggestion => typeof suggestion === 'string' && suggestion.length > 0)
        .slice(0, 5);
    } catch {
      suggestions = [];
    }

    issues.push({
      startIndex,
      length: word.length,
      word,
      suggestions,
    });
  }

  return issues;
}

function onPromptContextAction(callback) {
  if (typeof callback !== 'function') {
    return;
  }

  const wrapped = (_event, payload) => callback(payload);
  promptContextActionListeners.set(callback, wrapped);
  ipcRenderer.on('prompt-context-action', wrapped);
}

function offPromptContextAction(callback) {
  const wrapped = promptContextActionListeners.get(callback);
  if (!wrapped) {
    return;
  }
  ipcRenderer.removeListener('prompt-context-action', wrapped);
  promptContextActionListeners.delete(callback);
}

function onIgnoredSpellWordsUpdated(callback) {
  if (typeof callback !== 'function') {
    return;
  }

  const wrapped = (_event, payload) => callback(payload);
  ignoredSpellWordsListeners.set(callback, wrapped);
  ipcRenderer.on('ignored-spell-words-updated', wrapped);
}

function offIgnoredSpellWordsUpdated(callback) {
  const wrapped = ignoredSpellWordsListeners.get(callback);
  if (!wrapped) {
    return;
  }
  ipcRenderer.removeListener('ignored-spell-words-updated', wrapped);
  ignoredSpellWordsListeners.delete(callback);
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
const electronBridge = {
  // Get SwarmUI backend status
  getSwarmUIStatus: () => ipcRenderer.invoke('get-swarmui-status'),

  // Restart SwarmUI backend
  restartSwarmUI: () => ipcRenderer.invoke('restart-swarmui'),
  shutdownApp: () => ipcRenderer.invoke('shutdown-app'),
  reloadWrapper: () => ipcRenderer.invoke('reload-wrapper'),
  selectFolder: (startPath) => ipcRenderer.invoke('select-folder', startPath),
  getPerformanceMetricsPath: () => ipcRenderer.invoke('get-performance-metrics-path'),
  readPerformanceMetrics: () => ipcRenderer.invoke('read-performance-metrics'),
  writePerformanceMetrics: (payload) => ipcRenderer.invoke('write-performance-metrics', payload),
  version: process.versions.electron,

  // Platform info
  platform: process.platform,

  // Check if running in Electron
  isElectron: true,

  // Native spellcheck scanning (offline)
  hasNativeSpellcheck: () => hasNativeSpellcheck(),
  scanTextForMisspellings: (text) => scanTextForMisspellings(text),
  getIgnoredSpellWords: () => ipcRenderer.invoke('get-ignored-spell-words'),
  onIgnoredSpellWordsUpdated: (callback) => onIgnoredSpellWordsUpdated(callback),
  offIgnoredSpellWordsUpdated: (callback) => offIgnoredSpellWordsUpdated(callback),
  isDesktopNativeContextMenuEnabled: () => NATIVE_SPELL_CONTEXT_MENU_ENABLED,
  setPromptTargetActive: (active) => ipcRenderer.send('set-prompt-target-active', { active: !!active }),
  onPromptContextAction: (callback) => onPromptContextAction(callback),
  offPromptContextAction: (callback) => offPromptContextAction(callback),

  // App info
  versions: {
    node: process.versions.node,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  }
};

contextBridge.exposeInMainWorld('electron', electronBridge);
contextBridge.exposeInMainWorld('electronAPI', electronBridge);
