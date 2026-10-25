import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { electronMock } from './electron-mock';

const DENIED_MESSAGE =
  'Command failed: osascript -e tell application "System Events" to keystroke "c" using command down 36:68: execution error: System Eventsでエラーが起きました: osascriptにはキー操作の送信は許可されません。 (1002)';

let trusted = true;
const trustChecks: boolean[] = [];
// osascript の呼び出しごとの結果。文字列なら stdout、Error なら失敗
let osascriptResults: Array<string | Error> = [];
const osascriptScripts: string[] = [];

mock.module('node:child_process', () => ({
  execFile: (_command: string, args: string[], callback: (error: Error | null, result?: { stdout: string; stderr: string }) => void) => {
    osascriptScripts.push(args[1]);
    const next = osascriptResults.shift() ?? '';
    if (next instanceof Error) {
      callback(next);
    } else {
      callback(null, { stdout: next, stderr: '' });
    }
  }
}));

const { AccessibilityPermissionError, isAccessibilityDeniedError, pasteText, readSelectedText } = await import('../electron/selection');

beforeEach(() => {
  electronMock.systemPreferences.isTrustedAccessibilityClient = (prompt: boolean) => {
    trustChecks.push(prompt);
    return trusted;
  };
  electronMock.clipboard.readText = () => '';
  trusted = true;
  trustChecks.length = 0;
  osascriptResults = [];
  osascriptScripts.length = 0;
});

describe('isAccessibilityDeniedError', () => {
  test('キー送信拒否 (1002) と補助アクセス不可 (-1719) を権限エラーと判定する', () => {
    expect(isAccessibilityDeniedError(new Error(DENIED_MESSAGE))).toBe(true);
    expect(isAccessibilityDeniedError(new Error('execution error: System Events got an error: osascript is not allowed assistive access. (-1719)'))).toBe(true);
  });

  test('それ以外のエラーは権限エラーにしない', () => {
    expect(isAccessibilityDeniedError(new Error('execution error: Application isn’t running. (-600)'))).toBe(false);
    expect(isAccessibilityDeniedError(new Error('spawn osascript ENOENT'))).toBe(false);
  });
});

describe('readSelectedText', () => {
  test.skipIf(process.platform !== 'darwin')('権限が無ければ osascript を呼ばず、許可ダイアログを出して案内付きエラーにする', async () => {
    trusted = false;
    const error = await readSelectedText().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AccessibilityPermissionError);
    expect((error as Error).message).toContain('アクセシビリティ');
    expect(trustChecks).toEqual([false, true]);
    expect(osascriptScripts).toHaveLength(0);
  });

  test('権限ありと判定されてもキー送信が拒否されたら案内付きエラーに変換する', async () => {
    osascriptResults = ['', new Error(DENIED_MESSAGE)];
    const error = await readSelectedText().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AccessibilityPermissionError);
    expect((error as Error).message).toContain('「−」で削除して追加し直し');
    expect(osascriptScripts[1]).toContain('keystroke "c"');
  });

  test('権限と関係ない osascript のエラーはそのまま投げる', async () => {
    osascriptResults = ['', new Error('execution error: something else (-600)')];
    const error = await readSelectedText().catch((caught: unknown) => caught);
    expect(error).not.toBeInstanceOf(AccessibilityPermissionError);
    expect((error as Error).message).toContain('(-600)');
  });

  test('アクセシビリティで取れた選択範囲は前後の空白を保ったまま返す', async () => {
    osascriptResults = ['  資料わ明日送付します。\n\n'];
    expect(await readSelectedText()).toBe('  資料わ明日送付します。\n');
    expect(osascriptScripts).toHaveLength(1);
  });
});

describe('pasteText', () => {
  test.skipIf(process.platform !== 'darwin')('権限が無ければ貼り付け前に案内付きエラーにする', async () => {
    trusted = false;
    await expect(pasteText('本文')).rejects.toBeInstanceOf(AccessibilityPermissionError);
    expect(osascriptScripts).toHaveLength(0);
  });
});
