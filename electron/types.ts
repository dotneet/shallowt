export type Provider = 'openai-compatible' | 'anthropic' | 'xai' | 'ollama';

export type ModelProfile = {
  id: string;
  name: string;
  provider: Provider;
  model: string;
  endpoint: string;
  apiKey?: string;
  builtin?: true;
};

export type ShortcutConfig = {
  proofread: string;
  reopen: string;
};

export type RuleSet = {
  id: string;
  name: string;
  rules: string[];
};

export type VerificationIssue = {
  id: string;
  severity: 'warning' | 'issue';
  title: string;
  detail: string;
  sourceQuote?: string;
};

export type AppSettings = {
  activeModelId: string;
  models: ModelProfile[];
  ruleSets: RuleSet[];
  activeRuleSetIds: string[];
  systemPrompt: string;
  shortcut: ShortcutConfig;
  autoPasteResult: boolean;
  providerApiKeys: Partial<Record<Provider, string>>;
};

export type ProofreadHistoryItem = {
  id: string;
  createdAt: string;
  source: string;
  output: string;
  modelName: string;
  rulesApplied: string[];
  verification: VerificationIssue[];
};

export type ProofreadResponse = {
  output: string;
  modelName: string;
  promptPreview: string;
  verification: VerificationIssue[];
};
