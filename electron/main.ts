import { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, nativeImage, screen, shell } from 'electron';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getActiveRules } from './rules';
import { getSettings, getHistory, pushHistory, saveSettings } from './store';
import { ACCESSIBILITY_SETTINGS_URL, AccessibilityPermissionError, pasteText, readSelectedText } from './selection';
import { proofreadText } from './proofread';
import type { AppSettings, ProofreadHistoryItem, StatusPayload } from './types';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let shortcutsPaused = false;
let globalProofreadRunning = false;

const isMac = process.platform === 'darwin';
const isDev = !app.isPackaged;
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

function getIcon() {
  const iconPath = path.join(__dirname, '../../assets/pen.png');
  const icon = nativeImage.createFromPath(iconPath);

  if (!icon.isEmpty()) {
    return icon.resize({ width: 18, height: 18 });
  }

  const fallbackSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">
      <rect width="18" height="18" rx="5" fill="#2A1B10"/>
      <path d="M5 13V5h2.2v3.2L10.4 5H13l-3.3 3.8L13 13h-2.7L7.8 9.8 7.2 10.5V13H5z" fill="#F8F2E9"/>
    </svg>
  `.trim();
  return nativeImage
    .createFromDataURL(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(fallbackSvg)}`)
    .resize({ width: 18, height: 18 });
}

function showWindow() {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  // マウスカーソルがあるディスプレイの中央に表示する
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const bounds = mainWindow.getBounds();
  const width = Math.min(bounds.width, workArea.width);
  const height = Math.min(bounds.height, workArea.height);

  mainWindow.setBounds({
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2),
    width,
    height
  });
  mainWindow.show();
  mainWindow.moveTop();
  mainWindow.focus();
  app.focus({ steal: true });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1520,
    height: 960,
    minWidth: 1180,
    minHeight: 720,
    center: true,
    show: true,
    backgroundColor: '#eadfcd',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.mjs'),
      sandbox: false
    }
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('did-fail-load', { errorCode, errorDescription, validatedURL });
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('render-process-gone', details);
  });
  mainWindow.once('ready-to-show', () => {
    showWindow();
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    console.log('load renderer url', process.env.ELECTRON_RENDERER_URL);
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    console.log('load renderer file', path.join(__dirname, '../renderer/index.html'));
    await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  if (!mainWindow.isVisible()) {
    showWindow();
  }
}

async function refreshShortcuts() {
  globalShortcut.unregisterAll();
  if (shortcutsPaused) {
    return;
  }
  const settings = await getSettings();
  const failedShortcuts: string[] = [];

  const reopenRegistered = globalShortcut.register(settings.shortcut.reopen, () => {
    showWindow();
    mainWindow?.webContents.send('shortcut:reopen');
  });
  if (!reopenRegistered) {
    failedShortcuts.push(`再表示: ${settings.shortcut.reopen}`);
  }

  const proofreadRegistered = globalShortcut.register(settings.shortcut.proofread, () => {
    void handleGlobalProofread();
  });
  if (!proofreadRegistered) {
    failedShortcuts.push(`校正: ${settings.shortcut.proofread}`);
  }

  if (failedShortcuts.length) {
    const message = `ショートカットを登録できませんでした。他のアプリと競合している可能性があります。${failedShortcuts.join(' / ')}`;
    console.warn(message);
    mainWindow?.webContents.send('proofread:status', {
      kind: 'error',
      message
    });
  }
}

function createTray() {
  tray = new Tray(getIcon());
  tray.setToolTip('ShallowT Write');
  const menu = Menu.buildFromTemplate([
    {
      label: 'ウィンドウを開く',
      click: () => showWindow()
    },
    {
      label: '選択テキストを校正',
      click: () => void handleGlobalProofread()
    },
    {
      type: 'separator'
    },
    {
      label: '終了',
      click: () => {
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(menu);
  tray.on('click', showWindow);
}

async function proofreadAndRecord(source: string) {
  const settings = await getSettings();
  const result = await proofreadText(source, settings);
  const historyItem: ProofreadHistoryItem = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    source,
    output: result.output,
    modelName: result.modelName,
    rulesApplied: getActiveRules(settings),
    verification: result.verification
  };
  const history = await pushHistory(historyItem);
  return {
    ...result,
    history
  };
}

async function handleGlobalProofread() {
  // 校正中にショートカットが再度押されても多重実行しない
  if (globalProofreadRunning) {
    showWindow();
    return;
  }

  globalProofreadRunning = true;
  try {
    const selectedText = await readSelectedText();

    if (!selectedText.trim()) {
      showWindow();
      mainWindow?.webContents.send('proofread:status', {
        kind: 'error',
        message: '選択テキストを取得できませんでした。テキストを選択してから実行してください。'
      });
      return;
    }

    showWindow();
    mainWindow?.webContents.send('proofread:captured', {
      source: selectedText
    });

    const result = await proofreadAndRecord(selectedText);

    mainWindow?.webContents.send('proofread:completed', {
      ...result,
      source: selectedText
    });
  } catch (error) {
    const payload: StatusPayload = {
      kind: 'error',
      message: error instanceof Error ? error.message : '不明なエラーが発生しました。'
    };
    if (error instanceof AccessibilityPermissionError) {
      payload.action = 'open-accessibility-settings';
    }
    showWindow();
    mainWindow?.webContents.send('proofread:status', payload);
  } finally {
    globalProofreadRunning = false;
  }
}

function registerIpcHandlers() {
  ipcMain.handle('settings:get', async () => getSettings());
  ipcMain.handle('settings:save', async (_, settings: AppSettings) => {
    const saved = await saveSettings(settings);
    await refreshShortcuts();
    return saved;
  });
  ipcMain.handle('history:list', async () => getHistory());
  // 設定は常に保存済みのものを使い、レンダラーから渡された値は信用しない
  ipcMain.handle('proofread:run', async (_, source: string) => proofreadAndRecord(source));
  ipcMain.handle('selection:proofread', async () => {
    await handleGlobalProofread();
  });
  ipcMain.handle('accessibility:open-settings', async () => {
    await shell.openExternal(ACCESSIBILITY_SETTINGS_URL);
  });
  ipcMain.handle('selection:paste-result', async (_, text: string) => {
    await pasteText(text);
  });
  ipcMain.handle('shortcuts:suspend', async () => {
    shortcutsPaused = true;
    globalShortcut.unregisterAll();
  });
  ipcMain.handle('shortcuts:resume', async () => {
    shortcutsPaused = false;
    await refreshShortcuts();
  });
}

app.whenReady().then(async () => {
  if (isMac && app.dock) {
    app.setActivationPolicy('accessory');
    app.dock.hide();
  }

  registerIpcHandlers();
  await createWindow();
  createTray();
  await refreshShortcuts();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
      return;
    }
    showWindow();
  });
});

app.on('before-quit', () => {
  // Command+Q やシステム終了時も close でのキャンセルをさせない
  isQuitting = true;
});

app.on('second-instance', () => {
  showWindow();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
