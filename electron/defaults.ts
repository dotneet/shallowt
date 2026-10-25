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
  activeModelId: 'gpt-6-luna',
  activeRuleSetIds: ['standard'],
  autoPasteResult: false,
  shortcut: {
    proofread: 'Command+Shift+K',
    reopen: 'Command+Shift+L'
  },
  providerApiKeys: {},
  ruleSets: DEFAULT_RULE_SETS,
  systemPrompt:
    'あなたは日本語と英語の文章を整える校正アシスタントです。文意を保持しながら、語調・文法・可読性・一貫性を改善してください。',
  models: [
    {
      id: 'gpt-6-astra',
      name: 'GPT-6 Astra',
      provider: 'openai-compatible',
      model: 'gpt-6-astra',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      builtin: true
    },
    {
      id: 'gpt-6.1-sol',
      name: 'GPT-6.1 Sol',
      provider: 'openai-compatible',
      model: 'gpt-6.1-sol',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      builtin: true
    },
    {
      id: 'gpt-6-luna',
      name: 'GPT-6 Luna',
      provider: 'openai-compatible',
      model: 'gpt-6-luna',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      builtin: true
    },
    {
      id: 'claude-opus-5-5',
      name: 'Claude Opus 5.5',
      provider: 'anthropic',
      model: 'claude-opus-5-5',
      endpoint: 'https://api.anthropic.com/v1/messages',
      builtin: true
    },
    {
      id: 'claude-sonnet-5-5',
      name: 'Claude Sonnet 5.5',
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
      endpoint: 'https://api.anthropic.com/v1/messages',
      builtin: true
    },
    {
      id: 'claude-haiku-5-5',
      name: 'Claude Haiku 5.5',
      provider: 'anthropic',
      model: 'claude-haiku-5-5',
      endpoint: 'https://api.anthropic.com/v1/messages',
      builtin: true
    },
    {
      id: 'grok-4.7',
      name: 'Grok 4.7',
      provider: 'xai',
      model: 'grok-4.7',
      endpoint: 'https://api.x.ai/v1/chat/completions',
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
