import { clipboard, systemPreferences } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const ACCESSIBILITY_SETTINGS_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility';

const ACCESSIBILITY_GUIDE =
  '選択テキストの取得には macOS のアクセシビリティ権限が必要です。「システム設定 > プライバシーとセキュリティ > アクセシビリティ」で ShallowT Write をオンにしてください。' +
  'すでにオンの場合は、再ビルドで権限が無効になっている可能性があるため、一覧から「−」で削除して追加し直し、アプリを再起動してください。';

export class AccessibilityPermissionError extends Error {
  constructor() {
    super(ACCESSIBILITY_GUIDE);
    this.name = 'AccessibilityPermissionError';
  }
}

/** System Events へのキー送信が権限不足で拒否されたときのエラーか (1002: キー送信不可, -1719: 補助アクセス不可) */
export function isAccessibilityDeniedError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /\((1002|-1719|-25211)\)/.test(message);
}

/** 権限が無ければ macOS の許可ダイアログを出し、案内付きのエラーにする */
export function ensureAccessibilityPermission() {
  if (process.platform !== 'darwin' || systemPreferences.isTrustedAccessibilityClient(false)) {
    return;
  }

  systemPreferences.isTrustedAccessibilityClient(true);
  throw new AccessibilityPermissionError();
}

type ClipboardSnapshot = Array<{
  format: string;
  buffer: Buffer;
}>;

async function runAppleScript(script: string) {
  try {
    return await execFileAsync('osascript', ['-e', script]);
  } catch (error) {
    if (isAccessibilityDeniedError(error)) {
      throw new AccessibilityPermissionError();
    }
    throw error;
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function snapshotClipboard(): ClipboardSnapshot {
  return clipboard.availableFormats().map((format) => ({
    format,
    buffer: clipboard.readBuffer(format)
  }));
}

function restoreClipboard(snapshot: ClipboardSnapshot) {
  clipboard.clear();

  for (const item of snapshot) {
    clipboard.writeBuffer(item.format, item.buffer);
  }
}

/** osascript が末尾に付ける改行だけを落とし、選択範囲自体の前後の空白は残す */
function stripOsascriptNewline(stdout: string) {
  return stdout.replace(/\n$/, '');
}

async function readClipboardTextWithRetry() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const text = clipboard.readText();
    if (text.trim()) {
      return text;
    }

    await delay(100);
  }

  return '';
}

async function readSelectedTextViaAccessibility() {
  const { stdout } = await runAppleScript(`
    tell application "System Events"
      try
        set frontProcess to first application process whose frontmost is true
        set focusedElement to value of attribute "AXFocusedUIElement" of frontProcess
        set selectedText to value of attribute "AXSelectedText" of focusedElement
        if selectedText is missing value then
          return ""
        end if
        return selectedText as text
      on error
        return ""
      end try
    end tell
  `);

  return stripOsascriptNewline(stdout);
}

async function readSelectedTextViaCopy() {
  const previousClipboard = snapshotClipboard();

  clipboard.clear();

  try {
    await runAppleScript('tell application "System Events" to keystroke "c" using command down');
    await delay(180);
    return await readClipboardTextWithRetry();
  } finally {
    restoreClipboard(previousClipboard);
  }
}

export async function readSelectedText() {
  ensureAccessibilityPermission();
  const selectedText = await readSelectedTextViaAccessibility();
  if (selectedText.trim()) {
    return selectedText;
  }

  return readSelectedTextViaCopy();
}

export async function getFrontmostApplication() {
  const { stdout } = await runAppleScript(
    'tell application "System Events" to get name of first application process whose frontmost is true'
  );
  return stripOsascriptNewline(stdout);
}

export async function pasteText(text: string, applicationName?: string) {
  ensureAccessibilityPermission();
  const previousClipboard = snapshotClipboard();
  clipboard.writeText(text);
  await delay(80);

  try {
    if (applicationName) {
      const escapedName = applicationName.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
      await runAppleScript(`tell application "${escapedName}" to activate`);
      await delay(100);
    }

    await runAppleScript('tell application "System Events" to keystroke "v" using command down');
    // 貼り付け先アプリがクリップボードを読み終える前に復元しないよう待つ
    await delay(500);
  } finally {
    restoreClipboard(previousClipboard);
  }
}
