export type Provider = 'openai-compatible' | 'anthropic' | 'ollama';
export type ModelProfile = {
    id: string;
    name: string;
    provider: Provider;
    model: string;
    endpoint: string;
    apiKey?: string;
};
export type ShortcutConfig = {
    proofread: string;
    reopen: string;
};
export type AppSettings = {
    activeModelId: string;
    models: ModelProfile[];
    customRules: string[];
    systemPrompt: string;
    shortcut: ShortcutConfig;
    autoPasteResult: boolean;
};
export type ProofreadHistoryItem = {
    id: string;
    createdAt: string;
    source: string;
    output: string;
    modelName: string;
    rulesApplied: string[];
};
export type ProofreadResponse = {
    output: string;
    modelName: string;
    promptPreview: string;
};
