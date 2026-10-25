import { app, safeStorage } from 'electron';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_SETTINGS } from './defaults';
import { ensureActiveRuleSetIds } from './rules';
import type { AppSettings, ModelProfile, ProofreadHistoryItem, Provider, RuleSet } from './types';

type StoreShape = {
  settings: AppSettings;
  history: ProofreadHistoryItem[];
};

type PersistedStoreShape = {
  settings: LegacySettingsShape;
  history: ProofreadHistoryItem[];
  encryptedSecrets?: string;
};

const STORE_DIR = () => path.join(app.getPath('userData'), 'data');
const STORE_FILE = () => path.join(STORE_DIR(), 'shallow-t-write-store.json');
const LEGACY_STORE_FILES = () => [
  path.join(app.getPath('userData'), 'data', 'kousei-store.json'),
  path.join(app.getPath('appData'), 'Kousei', 'data', 'kousei-store.json'),
  path.join(app.getPath('appData'), 'kousei', 'data', 'kousei-store.json')
];

type LegacySettingsShape = Partial<AppSettings> & {
  customRules?: string[];
};

type StoredSecrets = {
  providerApiKeys: Partial<Record<Provider, string>>;
  modelApiKeys: Record<string, string>;
};

function emptySecrets(): StoredSecrets {
  return {
    providerApiKeys: {},
    modelApiKeys: {}
  };
}

function toNonEmptyString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function extractSecretsFromSettings(settings: Partial<AppSettings> | null | undefined): StoredSecrets {
  const providerApiKeys = (Object.entries(settings?.providerApiKeys ?? {}) as Array<[Provider, string | undefined]>)
    .reduce<StoredSecrets['providerApiKeys']>((accumulator, [provider, value]) => {
      const normalizedValue = toNonEmptyString(value);
      if (normalizedValue) {
        accumulator[provider] = normalizedValue;
      }
      return accumulator;
    }, {});

  const modelApiKeys = Array.isArray(settings?.models)
    ? settings.models.reduce<StoredSecrets['modelApiKeys']>((accumulator, model) => {
        const normalizedValue = toNonEmptyString(model?.apiKey);
        if (model?.id && normalizedValue) {
          accumulator[model.id] = normalizedValue;
        }
        return accumulator;
      }, {})
    : {};

  return {
    providerApiKeys,
    modelApiKeys
  };
}

function hasSecrets(secrets: StoredSecrets) {
  return Object.keys(secrets.providerApiKeys).length > 0 || Object.keys(secrets.modelApiKeys).length > 0;
}

function mergeSecrets(primary: StoredSecrets, secondary: StoredSecrets): StoredSecrets {
  return {
    providerApiKeys: {
      ...secondary.providerApiKeys,
      ...primary.providerApiKeys
    },
    modelApiKeys: {
      ...secondary.modelApiKeys,
      ...primary.modelApiKeys
    }
  };
}

function sanitizeModelsForStorage(models: ModelProfile[] | undefined) {
  if (!Array.isArray(models)) {
    return [] as LegacySettingsShape['models'];
  }

  return models.map(({ apiKey: _apiKey, ...model }) => model);
}

function sanitizeSettingsForStorage(settings: AppSettings): LegacySettingsShape {
  return {
    ...settings,
    providerApiKeys: {},
    models: sanitizeModelsForStorage(settings.models)
  };
}

function encryptSecrets(secrets: StoredSecrets) {
  if (!hasSecrets(secrets)) {
    return undefined;
  }

  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('安全な保存領域を利用できないため、API キーを保存できません。');
  }

  return safeStorage.encryptString(JSON.stringify(secrets)).toString('base64');
}

function parseStoredSecrets(value: unknown): StoredSecrets {
  if (!value || typeof value !== 'object') {
    return emptySecrets();
  }

  const candidate = value as {
    providerApiKeys?: Partial<Record<Provider, unknown>>;
    modelApiKeys?: Record<string, unknown>;
  };

  const providerApiKeys = (Object.entries(candidate.providerApiKeys ?? {}) as Array<[Provider, unknown]>)
    .reduce<StoredSecrets['providerApiKeys']>((accumulator, [provider, apiKey]) => {
      const normalizedValue = toNonEmptyString(apiKey);
      if (normalizedValue) {
        accumulator[provider] = normalizedValue;
      }
      return accumulator;
    }, {});

  const modelApiKeys = Object.entries(candidate.modelApiKeys ?? {}).reduce<StoredSecrets['modelApiKeys']>(
    (accumulator, [modelId, apiKey]) => {
      const normalizedValue = toNonEmptyString(apiKey);
      if (normalizedValue) {
        accumulator[modelId] = normalizedValue;
      }
      return accumulator;
    },
    {}
  );

  return {
    providerApiKeys,
    modelApiKeys
  };
}

function decryptSecrets(encryptedSecrets: unknown): StoredSecrets {
  if (typeof encryptedSecrets !== 'string' || !encryptedSecrets) {
    return emptySecrets();
  }

  // 復号できない場合 (キーチェーン変更など) はキーを空にして再入力してもらう
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('[store] 安全な保存領域を利用できないため、保存済み API キーを読み込めません。');
    return emptySecrets();
  }

  try {
    const decrypted = safeStorage.decryptString(Buffer.from(encryptedSecrets, 'base64'));
    return parseStoredSecrets(JSON.parse(decrypted) as unknown);
  } catch (error) {
    console.warn('[store] 保存済み API キーの復号に失敗しました。設定を再入力してください。', error);
    return emptySecrets();
  }
}

function applySecrets(settings: AppSettings, secrets: StoredSecrets): AppSettings {
  return {
    ...settings,
    providerApiKeys: secrets.providerApiKeys,
    models: settings.models.map((model) => {
      const apiKey = secrets.modelApiKeys[model.id];
      if (!apiKey) {
        const { apiKey: _apiKey, ...rest } = model;
        return rest;
      }

      return {
        ...model,
        apiKey
      };
    })
  };
}

function normalizeRuleSets(rawSettings: LegacySettingsShape) {
  if (rawSettings.ruleSets?.length) {
    return rawSettings.ruleSets;
  }

  if (rawSettings.customRules?.length) {
    const importedRuleSet: RuleSet = {
      id: 'imported-custom-rules',
      name: '既存ルール',
      rules: rawSettings.customRules
    };
    return [importedRuleSet, ...DEFAULT_SETTINGS.ruleSets];
  }

  return DEFAULT_SETTINGS.ruleSets;
}

function mergeModels(saved: AppSettings['models'] | undefined): AppSettings['models'] {
  if (!saved?.length) return DEFAULT_SETTINGS.models;
  // 組み込みモデルは常にデフォルト定義で上書き、ユーザー追加モデルはそのまま保持。
  // 一覧から外れた旧組み込みモデル (builtin: true) は引き継がない
  const builtinIds = new Set(DEFAULT_SETTINGS.models.map((m) => m.id));
  const userModels = saved.filter((m) => !m.builtin && !builtinIds.has(m.id));
  return [...DEFAULT_SETTINGS.models, ...userModels];
}

function normalizeSettings(rawSettings: LegacySettingsShape): AppSettings {
  const ruleSets = normalizeRuleSets(rawSettings);
  const models = mergeModels(rawSettings.models);

  // customRules など旧形式のフィールドは引き継がない
  return {
    // 組み込みモデルの入れ替えで消えた ID を選択していた場合はデフォルトに戻す
    activeModelId: models.some((model) => model.id === rawSettings.activeModelId)
      ? rawSettings.activeModelId as string
      : DEFAULT_SETTINGS.activeModelId,
    models,
    ruleSets,
    activeRuleSetIds: ensureActiveRuleSetIds(ruleSets, rawSettings.activeRuleSetIds ?? []),
    systemPrompt: rawSettings.systemPrompt ?? DEFAULT_SETTINGS.systemPrompt,
    shortcut: {
      ...DEFAULT_SETTINGS.shortcut,
      ...rawSettings.shortcut
    },
    autoPasteResult: rawSettings.autoPasteResult ?? DEFAULT_SETTINGS.autoPasteResult,
    providerApiKeys: {
      ...DEFAULT_SETTINGS.providerApiKeys,
      ...rawSettings.providerApiKeys
    }
  };
}

function isNotFound(error: unknown) {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
}

// 書き込み途中で落ちても壊れた JSON が残らないよう、一時ファイルから rename する
async function writeFileAtomic(file: string, content: string) {
  await mkdir(path.dirname(file), { recursive: true });
  const tempFile = `${file}.${process.pid}-${Date.now()}.tmp`;
  try {
    await writeFile(tempFile, content, 'utf8');
    await rename(tempFile, file);
  } catch (error) {
    await rm(tempFile, { force: true });
    throw error;
  }
}

async function readStoreFile(): Promise<string> {
  try {
    return await readFile(STORE_FILE(), 'utf8');
  } catch (error) {
    if (!isNotFound(error)) {
      throw error;
    }
  }

  for (const legacyFile of LEGACY_STORE_FILES()) {
    try {
      const legacyStore = await readFile(legacyFile, 'utf8');
      await writeFileAtomic(STORE_FILE(), legacyStore);
      return legacyStore;
    } catch {
      // 旧アプリ名の保存先が無ければ新規作成する
    }
  }

  const initial = JSON.stringify({ settings: DEFAULT_SETTINGS, history: [] } satisfies StoreShape, null, 2);
  await writeFileAtomic(STORE_FILE(), initial);
  return initial;
}

async function parseStoreFile(raw: string): Promise<Partial<PersistedStoreShape>> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Partial<PersistedStoreShape>;
    }
  } catch {
    // 下で退避する
  }

  // 壊れたファイルは退避してデフォルトで続行する
  const backupFile = `${STORE_FILE()}.corrupt-${Date.now()}`;
  await rename(STORE_FILE(), backupFile);
  console.warn(`[store] 保存データが壊れていたため ${backupFile} に退避し、初期設定で起動します。`);
  return {};
}

async function readStore(): Promise<StoreShape> {
  const parsed = await parseStoreFile(await readStoreFile());
  const rawSettings = (parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : {}) as LegacySettingsShape;
  const encryptedSecrets = decryptSecrets(parsed.encryptedSecrets);
  const legacySecrets = extractSecretsFromSettings(rawSettings);
  const mergedSecrets = mergeSecrets(encryptedSecrets, legacySecrets);
  const settings = applySecrets(normalizeSettings(rawSettings), mergedSecrets);
  const history = (Array.isArray(parsed.history) ? parsed.history : []).map((item) => ({
    ...item,
    verification: item.verification ?? []
  }));

  // 平文で保存されていた旧形式の API キーを暗号化して保存し直す
  if (hasSecrets(legacySecrets)) {
    try {
      await writeStore({
        settings,
        history
      });
    } catch (error) {
      console.warn('[store] 旧形式の API キーの移行に失敗しました。', error);
    }
  }

  return {
    settings,
    history
  };
}

async function writeStore(next: StoreShape) {
  const persisted: PersistedStoreShape = {
    settings: sanitizeSettingsForStorage(normalizeSettings(next.settings)),
    history: next.history,
    encryptedSecrets: encryptSecrets(extractSecretsFromSettings(next.settings))
  };
  await writeFileAtomic(STORE_FILE(), JSON.stringify(persisted, null, 2));
}

// 読み書きを直列化して、同時更新で片方が失われないようにする
let storeQueue: Promise<unknown> = Promise.resolve();

function withStoreLock<T>(task: () => Promise<T>): Promise<T> {
  const result = storeQueue.then(task, task);
  storeQueue = result.catch(() => undefined);
  return result;
}

export async function getSettings() {
  return withStoreLock(async () => {
    const store = await readStore();
    return store.settings;
  });
}

export async function saveSettings(settings: AppSettings) {
  return withStoreLock(async () => {
    const store = await readStore();
    const next: StoreShape = {
      ...store,
      settings: normalizeSettings(settings)
    };
    await writeStore(next);
    return next.settings;
  });
}

export async function getHistory() {
  return withStoreLock(async () => {
    const store = await readStore();
    return store.history;
  });
}

export async function pushHistory(item: ProofreadHistoryItem) {
  return withStoreLock(async () => {
    const store = await readStore();
    const next: StoreShape = {
      ...store,
      history: [item, ...store.history].slice(0, 20)
    };
    await writeStore(next);
    return next.history;
  });
}
