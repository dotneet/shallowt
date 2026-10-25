import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AppSettings, ProofreadHistoryItem } from '../electron/types';

let tempDir = '';
let decryptShouldFail = false;

const FAKE_PREFIX = 'fake-enc:';

mock.module('electron', () => ({
  app: {
    getPath: (name: string) => path.join(tempDir, name)
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    // 可逆な疑似暗号化 (平文がファイルに出ないよう hex にする)
    encryptString: (plain: string) => Buffer.from(FAKE_PREFIX + Buffer.from(plain, 'utf8').toString('hex'), 'utf8'),
    decryptString: (encrypted: Buffer) => {
      if (decryptShouldFail) {
        throw new Error('decrypt failed');
      }
      const text = encrypted.toString('utf8');
      if (!text.startsWith(FAKE_PREFIX)) {
        throw new Error('invalid payload');
      }
      return Buffer.from(text.slice(FAKE_PREFIX.length), 'hex').toString('utf8');
    }
  }
}));

const store = await import('../electron/store');
const { DEFAULT_SETTINGS } = await import('../electron/defaults');

const storeDir = () => path.join(tempDir, 'userData', 'data');
const storeFile = () => path.join(storeDir(), 'shallow-t-write-store.json');

async function readStoreJson() {
  return JSON.parse(await readFile(storeFile(), 'utf8')) as Record<string, unknown> & {
    settings: Record<string, unknown>;
    history: ProofreadHistoryItem[];
    encryptedSecrets?: string;
  };
}

async function writeStoreJson(content: unknown) {
  await mkdir(storeDir(), { recursive: true });
  await writeFile(storeFile(), typeof content === 'string' ? content : JSON.stringify(content), 'utf8');
}

function historyItem(id: string): ProofreadHistoryItem {
  return {
    id,
    createdAt: new Date().toISOString(),
    source: `source ${id}`,
    output: `output ${id}`,
    modelName: 'GPT-6 Luna',
    rulesApplied: [],
    verification: []
  };
}

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'store-test-'));
  decryptShouldFail = false;
});

afterEach(async () => {
  mock.restore();
  await rm(tempDir, { recursive: true, force: true });
});

describe('store', () => {
  test('初回起動時はデフォルト設定と空の履歴を返す', async () => {
    const settings = await store.getSettings();
    expect(settings).toEqual(DEFAULT_SETTINGS);
    expect(await store.getHistory()).toEqual([]);
  });

  test('pushHistory と saveSettings を同時に呼んでも両方保存される', async () => {
    const base = await store.getSettings();
    await Promise.all([
      store.pushHistory(historyItem('h1')),
      store.saveSettings({ ...base, systemPrompt: 'custom prompt' }),
      store.pushHistory(historyItem('h2'))
    ]);

    const settings = await store.getSettings();
    const history = await store.getHistory();
    expect(settings.systemPrompt).toBe('custom prompt');
    expect(history.map((item) => item.id).sort()).toEqual(['h1', 'h2']);

    // 一時ファイルが残っていない
    const files = await readdir(storeDir());
    expect(files.filter((file) => file.endsWith('.tmp'))).toEqual([]);
  });

  test('履歴は最新 20 件に制限される', async () => {
    for (let index = 0; index < 25; index += 1) {
      await store.pushHistory(historyItem(`h${index}`));
    }
    const history = await store.getHistory();
    expect(history).toHaveLength(20);
    expect(history[0].id).toBe('h24');
    expect(history[19].id).toBe('h5');
  });

  test('壊れた JSON は退避してデフォルトで続行する', async () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {});
    await writeStoreJson('{"settings": {');

    const settings = await store.getSettings();
    expect(settings).toEqual(DEFAULT_SETTINGS);
    expect(warn).toHaveBeenCalled();

    const files = await readdir(storeDir());
    const backup = files.find((file) => file.startsWith('shallow-t-write-store.json.corrupt-'));
    expect(backup).toBeDefined();
    expect(await readFile(path.join(storeDir(), backup as string), 'utf8')).toBe('{"settings": {');

    // 以降は通常どおり読み書きできる
    await store.pushHistory(historyItem('after-corrupt'));
    expect((await store.getHistory()).map((item) => item.id)).toEqual(['after-corrupt']);
  });

  test('存在しない activeModelId は gpt-6-luna に戻る', async () => {
    await writeStoreJson({
      settings: { ...DEFAULT_SETTINGS, activeModelId: 'removed-model' },
      history: []
    });
    const settings = await store.getSettings();
    expect(settings.activeModelId).toBe('gpt-6-luna');
  });

  test('一覧から外れた旧組み込みモデルは消え、ユーザー追加モデルは残る', async () => {
    const oldBuiltin = {
      id: 'gpt-5.6-luna',
      name: 'GPT-5.6 Luna',
      provider: 'openai-compatible' as const,
      model: 'gpt-5.6-luna',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      builtin: true as const
    };
    const userModel = {
      id: 'custom-1',
      name: 'Local',
      provider: 'ollama' as const,
      model: 'qwen',
      endpoint: 'http://127.0.0.1:11434/api/chat'
    };
    await writeStoreJson({
      settings: { ...DEFAULT_SETTINGS, activeModelId: 'gpt-5.6-luna', models: [oldBuiltin, ...DEFAULT_SETTINGS.models, userModel] },
      history: []
    });
    const settings = await store.getSettings();
    expect(settings.models.map((model) => model.id)).toEqual([...DEFAULT_SETTINGS.models.map((model) => model.id), 'custom-1']);
    expect(settings.activeModelId).toBe('gpt-6-luna');
  });

  test('API キーはファイルに平文で保存されず getSettings で復元される', async () => {
    const base = await store.getSettings();
    const next: AppSettings = {
      ...base,
      providerApiKeys: { anthropic: 'sk-ant-secret-123' },
      models: [
        ...base.models,
        {
          id: 'my-model',
          name: 'My Model',
          provider: 'openai-compatible',
          model: 'my-model',
          endpoint: 'http://localhost:1234/v1/chat/completions',
          apiKey: 'sk-model-secret-456'
        }
      ]
    };
    await store.saveSettings(next);

    const raw = await readFile(storeFile(), 'utf8');
    expect(raw).not.toContain('sk-ant-secret-123');
    expect(raw).not.toContain('sk-model-secret-456');
    expect((await readStoreJson()).encryptedSecrets).toBeString();

    const settings = await store.getSettings();
    expect(settings.providerApiKeys.anthropic).toBe('sk-ant-secret-123');
    expect(settings.models.find((model) => model.id === 'my-model')?.apiKey).toBe('sk-model-secret-456');
  });

  test('平文で保存された旧形式の API キーは暗号化して保存し直される', async () => {
    await writeStoreJson({
      settings: { ...DEFAULT_SETTINGS, providerApiKeys: { xai: 'xai-legacy-key' } },
      history: []
    });

    const settings = await store.getSettings();
    expect(settings.providerApiKeys.xai).toBe('xai-legacy-key');
    expect(await readFile(storeFile(), 'utf8')).not.toContain('xai-legacy-key');
    expect((await store.getSettings()).providerApiKeys.xai).toBe('xai-legacy-key');
  });

  test('旧形式の customRules はルールセットに移行され、以降は保存されない', async () => {
    const { ruleSets: _ruleSets, ...legacySettings } = DEFAULT_SETTINGS;
    await writeStoreJson({
      settings: { ...legacySettings, customRules: ['ですます調に統一する'] },
      history: []
    });

    const settings = await store.getSettings();
    expect(settings.ruleSets[0]).toEqual({
      id: 'imported-custom-rules',
      name: '既存ルール',
      rules: ['ですます調に統一する']
    });
    expect('customRules' in settings).toBe(false);

    await store.saveSettings(settings);
    const persisted = await readStoreJson();
    expect('customRules' in persisted.settings).toBe(false);
    expect((persisted.settings.ruleSets as Array<{ id: string }>)[0].id).toBe('imported-custom-rules');
  });

  test('旧アプリの保存ファイルから移行される', async () => {
    const legacyDir = path.join(tempDir, 'appData', 'Kousei', 'data');
    await mkdir(legacyDir, { recursive: true });
    await writeFile(
      path.join(legacyDir, 'kousei-store.json'),
      JSON.stringify({ settings: { ...DEFAULT_SETTINGS, systemPrompt: 'legacy prompt' }, history: [historyItem('old')] }),
      'utf8'
    );

    expect((await store.getSettings()).systemPrompt).toBe('legacy prompt');
    expect((await store.getHistory()).map((item) => item.id)).toEqual(['old']);
    expect((await readStoreJson()).settings.systemPrompt).toBe('legacy prompt');
  });

  test('復号に失敗しても例外にせず API キーを空にする', async () => {
    const base = await store.getSettings();
    await store.saveSettings({ ...base, providerApiKeys: { anthropic: 'sk-ant-secret' } });

    const warn = spyOn(console, 'warn').mockImplementation(() => {});
    decryptShouldFail = true;
    const settings = await store.getSettings();
    expect(settings.providerApiKeys).toEqual({});
    expect(settings.activeModelId).toBe(base.activeModelId);
    expect(warn).toHaveBeenCalled();

    // キーを再入力すれば保存できる
    decryptShouldFail = false;
    await store.saveSettings({ ...settings, providerApiKeys: { anthropic: 'sk-ant-new' } });
    expect((await store.getSettings()).providerApiKeys.anthropic).toBe('sk-ant-new');
  });
});
