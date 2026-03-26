import type { AppSettings, ProofreadHistoryItem, ProofreadResponse } from '../electron/types';

const previewSettings: AppSettings = {
  activeModelId: 'preview-model',
  activeRuleSetIds: ['preview-standard'],
  autoPasteResult: false,
  shortcut: {
    proofread: 'CommandOrControl+Shift+K',
    reopen: 'CommandOrControl+Shift+L'
  },
  providerApiKeys: {},
  ruleSets: [
    {
      id: 'preview-standard',
      name: '標準校正',
      rules: [
        '自然で読みやすい日本語を優先する',
        '冗長な表現は簡潔にする',
        '意味が変わる言い換えは避ける'
      ]
    },
    {
      id: 'preview-business',
      name: 'ビジネス整文',
      rules: [
        '結論を先に置く',
        '曖昧な主語を減らす',
        '語調の一貫性を保つ'
      ]
    }
  ],
  systemPrompt: 'Browser preview mode',
  models: [
    {
      id: 'preview-model',
      name: 'Preview Mock',
      provider: 'openai-compatible',
      model: 'preview',
      endpoint: 'http://localhost/mock'
    }
  ]
};

const sampleSource =
  '本日は3月32日です。先週の会議は来週に開催済みで、売上は前年より120%減少しながら過去最高を更新しました。';
const sampleOutput =
  '本日は3月32日です。先週予定していた会議は来週に延期され、売上は前年から大きく変動した一方で、過去最高を更新したと記載されています。';

const sampleHistory: ProofreadHistoryItem[] = [
  {
    id: 'sample-history-1',
    createdAt: new Date().toISOString(),
    source: sampleSource,
    output: sampleOutput,
    modelName: 'Preview Mock',
    rulesApplied: previewSettings.ruleSets[0]?.rules ?? [],
    verification: [
      {
        id: 'preview-verification-1',
        severity: 'issue',
        title: '日付が成立していません',
        detail: '「3月32日」は実在しない日付です。',
        sourceQuote: '本日は3月32日です。'
      },
      {
        id: 'preview-verification-2',
        severity: 'warning',
        title: '時系列の説明が衝突しています',
        detail: '「先週の会議は来週に開催済み」は時制が矛盾しています。',
        sourceQuote: '先週の会議は来週に開催済み'
      }
    ]
  }
];

const sampleResponse: ProofreadResponse = {
  output: sampleOutput,
  modelName: 'Preview Mock',
  promptPreview: 'Browser preview mode',
  verification: sampleHistory[0].verification
};

let inMemorySettings: AppSettings = structuredClone(previewSettings);
let inMemoryHistory = [...sampleHistory];

export const mockApi = {
  getSettings: async () => structuredClone(inMemorySettings),
  saveSettings: async (settings: AppSettings) => {
    inMemorySettings = structuredClone(settings);
    return structuredClone(inMemorySettings);
  },
  listHistory: async () => structuredClone(inMemoryHistory),
  runProofread: async (_source: string, _settings: AppSettings) => ({
    ...structuredClone(sampleResponse),
    history: structuredClone(inMemoryHistory)
  }),
  proofreadSelection: async () => undefined,
  pasteResult: async (_text: string) => undefined,
  onCaptured: (_listener: (payload: { source: string }) => void) => () => undefined,
  onCompleted: (_listener: (payload: ProofreadResponse & { source: string; history: ProofreadHistoryItem[] }) => void) =>
    () => undefined,
  onStatus: (_listener: (payload: { kind: 'error'; message: string }) => void) => () => undefined
};
