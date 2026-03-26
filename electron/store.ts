import { app } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_SETTINGS } from './defaults';
import { ensureActiveRuleSetIds } from './rules';
import type { AppSettings, ProofreadHistoryItem, RuleSet } from './types';

type StoreShape = {
  settings: AppSettings;
  history: ProofreadHistoryItem[];
};

const STORE_DIR = () => path.join(app.getPath('userData'), 'data');
const STORE_FILE = () => path.join(STORE_DIR(), 'kousei-store.json');

type LegacySettingsShape = Partial<AppSettings> & {
  customRules?: string[];
};

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
  // 組み込みモデルは常にデフォルト定義で上書き、ユーザー追加モデルはそのまま保持
  const builtinIds = new Set(DEFAULT_SETTINGS.models.map((m) => m.id));
  const userModels = saved.filter((m) => !builtinIds.has(m.id));
  return [...DEFAULT_SETTINGS.models, ...userModels];
}

function normalizeSettings(rawSettings: LegacySettingsShape): AppSettings {
  const ruleSets = normalizeRuleSets(rawSettings);
  const models = mergeModels(rawSettings.models);

  return {
    ...DEFAULT_SETTINGS,
    ...rawSettings,
    activeModelId:
      typeof rawSettings.activeModelId === 'string' && rawSettings.activeModelId.length
        ? rawSettings.activeModelId
        : models[0]?.id ?? DEFAULT_SETTINGS.activeModelId,
    shortcut: {
      ...DEFAULT_SETTINGS.shortcut,
      ...rawSettings.shortcut
    },
    providerApiKeys: {
      ...DEFAULT_SETTINGS.providerApiKeys,
      ...rawSettings.providerApiKeys
    },
    models,
    ruleSets,
    activeRuleSetIds: ensureActiveRuleSetIds(ruleSets, rawSettings.activeRuleSetIds ?? [])
  };
}

async function ensureStoreFile() {
  await mkdir(STORE_DIR(), { recursive: true });
  try {
    await readFile(STORE_FILE(), 'utf8');
  } catch {
    const initial: StoreShape = {
      settings: DEFAULT_SETTINGS,
      history: []
    };
    await writeFile(STORE_FILE(), JSON.stringify(initial, null, 2), 'utf8');
  }
}

async function readStore(): Promise<StoreShape> {
  await ensureStoreFile();
  const raw = await readFile(STORE_FILE(), 'utf8');
  const parsed = JSON.parse(raw) as Partial<StoreShape>;
  const rawSettings = (parsed.settings ?? {}) as LegacySettingsShape;
  return {
    settings: normalizeSettings(rawSettings),
    history: (parsed.history ?? []).map((item) => ({
      ...item,
      verification: item.verification ?? []
    }))
  };
}

async function writeStore(next: StoreShape) {
  await ensureStoreFile();
  await writeFile(STORE_FILE(), JSON.stringify(next, null, 2), 'utf8');
}

export async function getSettings() {
  const store = await readStore();
  return store.settings;
}

export async function saveSettings(settings: AppSettings) {
  const store = await readStore();
  const next: StoreShape = {
    ...store,
    settings: normalizeSettings(settings)
  };
  await writeStore(next);
  return next.settings;
}

export async function getHistory() {
  const store = await readStore();
  return store.history;
}

export async function pushHistory(item: ProofreadHistoryItem) {
  const store = await readStore();
  const next: StoreShape = {
    ...store,
    history: [item, ...store.history].slice(0, 20)
  };
  await writeStore(next);
  return next.history;
}
