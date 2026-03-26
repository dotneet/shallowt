import { clipboard } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function runAppleScript(script: string) {
  return execFileAsync('osascript', ['-e', script]);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function readSelectedText() {
  const previousText = clipboard.readText();

  await runAppleScript('tell application "System Events" to keystroke "c" using command down');
  await delay(180);
  const selectedText = clipboard.readText().trim();

  if (previousText) {
    clipboard.writeText(previousText);
  } else {
    clipboard.clear();
  }

  return selectedText;
}

export async function getFrontmostApplication() {
  const { stdout } = await runAppleScript(
    'tell application "System Events" to get name of first application process whose frontmost is true'
  );
  return stdout.trim();
}

export async function pasteText(text: string, applicationName?: string) {
  const previousText = clipboard.readText();
  clipboard.writeText(text);
  await delay(80);

  if (applicationName) {
    await runAppleScript(`tell application "${applicationName.replaceAll('"', '\\"')}" to activate`);
    await delay(100);
  }

  await runAppleScript('tell application "System Events" to keystroke "v" using command down');
  await delay(80);

  if (previousText) {
    clipboard.writeText(previousText);
  } else {
    clipboard.clear();
  }
}
