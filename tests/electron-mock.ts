import { mock } from 'bun:test';

// bun のモジュールモックはテストプロセス全体で共有されるため、electron のモックはここで 1 つだけ登録する。
// 各テストはオブジェクトを置き換えず、プロパティの関数を差し替えて使う。
export const electronMock = {
  app: {
    getPath: (name: string): string => {
      throw new Error(`app.getPath(${name}) is not mocked in this test`);
    }
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (plain: string) => Buffer.from(plain, 'utf8'),
    decryptString: (encrypted: Buffer) => encrypted.toString('utf8')
  },
  systemPreferences: {
    isTrustedAccessibilityClient: (_prompt: boolean) => true
  },
  clipboard: {
    availableFormats: (): string[] => [],
    readBuffer: (_format: string) => Buffer.alloc(0),
    writeBuffer: (_format: string, _buffer: Buffer) => undefined,
    clear: () => undefined,
    readText: () => '',
    writeText: (_text: string) => undefined
  }
};

mock.module('electron', () => electronMock);
