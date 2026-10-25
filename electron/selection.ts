import { clipboard } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

type ClipboardSnapshot = Array<{
  format: string;
  buffer: Buffer;
}>;

async function runAppleScript(script: string) {
  return execFileAsync('osascript', ['-e', script]);
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
