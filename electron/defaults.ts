import type { AppSettings, RuleSet } from './types';

export const DEFAULT_RULE_SETS: RuleSet[] = [
  {
    id: 'standard',
    name: '標準校正',
    rules: [
      '自然で読みやすい日本語を優先する',
      '冗長な表現は簡潔にする',
      '意味が変わる言い換えは避ける'
    ]
  },
  {
    id: 'business',
    name: 'ビジネス整文',
    rules: [
      '過度に砕けた表現は避ける',
      '結論が先に伝わる構成に寄せる',
      '曖昧な主語や責任範囲を明確にする'
    ]
  }
];

export const DEFAULT_SETTINGS: AppSettings = {
  activeModelId: 'gpt-5.4-mini',
  activeRuleSetIds: ['standard'],
  autoPasteResult: false,
  shortcut: {
    proofread: 'CommandOrControl+Shift+K',
    reopen: 'CommandOrControl+Shift+L'
  },
  providerApiKeys: {},
  ruleSets: DEFAULT_RULE_SETS,
  systemPrompt:
    'あなたは日本語と英語の文章を整える校正アシスタントです。文意を保持しながら、語調・文法・可読性・一貫性を改善してください。',
  models: [
    {
      id: 'gpt-5.4',
      name: 'GPT-5.4',
      provider: 'openai-compatible',
      model: 'gpt-5.4',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      builtin: true
    },
    {
      id: 'gpt-5.4-mini',
      name: 'GPT-5.4 mini',
      provider: 'openai-compatible',
      model: 'gpt-5.4-mini',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      builtin: true
    },
    {
      id: 'gpt-5.4-nano',
      name: 'GPT-5.4 nano',
      provider: 'openai-compatible',
      model: 'gpt-5.4-nano',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      builtin: true
    },
    {
      id: 'claude-opus-4-6',
      name: 'Claude Opus 4.6',
      provider: 'anthropic',
      model: 'claude-opus-4-6',
      endpoint: 'https://api.anthropic.com/v1/messages',
      builtin: true
    },
    {
      id: 'claude-sonnet-4-6',
      name: 'Claude Sonnet 4.6',
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      endpoint: 'https://api.anthropic.com/v1/messages',
      builtin: true
    },
    {
      id: 'claude-haiku-4-5',
      name: 'Claude Haiku 4.5',
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
      endpoint: 'https://api.anthropic.com/v1/messages',
      builtin: true
    },
    {
      id: 'ollama-llama3',
      name: 'Ollama Llama 3.1',
      provider: 'ollama',
      model: 'llama3.1',
      endpoint: 'http://127.0.0.1:11434/api/chat',
      builtin: true
    }
  ]
};
