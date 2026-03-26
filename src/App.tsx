import { useEffect, useRef, useState } from 'react';
import { buildDisplaySegments } from './diff';
import { mockApi } from './mockApi';
import type {
  AppSettings,
  ModelProfile,
  ProofreadHistoryItem,
  RuleSet,
  VerificationIssue
} from '../electron/types';

const emptyModel: ModelProfile = {
  id: '',
  name: '',
  provider: 'openai-compatible',
  model: '',
  endpoint: '',
  apiKey: ''
};

const emptyRuleSet: RuleSet = {
  id: '',
  name: '',
  rules: []
};

const fallbackSettings: AppSettings = {
  activeModelId: 'preview-model',
  activeRuleSetIds: ['default-rule-set'],
  autoPasteResult: false,
  shortcut: {
    proofread: 'CommandOrControl+Shift+K',
    reopen: 'CommandOrControl+Shift+L'
  },
  providerApiKeys: {},
  ruleSets: [
    {
      id: 'default-rule-set',
      name: '標準校正',
      rules: [
        '自然で読みやすい日本語を優先する',
        '冗長な表現は簡潔にする',
        '意味が変わる言い換えは避ける'
      ]
    }
  ],
  systemPrompt: 'あなたは文章校正アシスタントです。',
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

const api = typeof window !== 'undefined' && window.kousei ? window.kousei : mockApi;

function parseRules(text: string) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function createRuleSetId(label: string) {
  const normalized = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || `rule-set-${Date.now()}`;
}

function normalizeSettings(candidate: Partial<AppSettings> | AppSettings | null | undefined): AppSettings {
  const models = Array.isArray(candidate?.models) && candidate.models.length ? candidate.models : fallbackSettings.models;
  const ruleSets = Array.isArray(candidate?.ruleSets) && candidate.ruleSets.length ? candidate.ruleSets : fallbackSettings.ruleSets;
  const activeModelId = typeof candidate?.activeModelId === 'string' && candidate.activeModelId ? candidate.activeModelId : models[0].id;
  const activeRuleSetIds = Array.isArray(candidate?.activeRuleSetIds) && candidate.activeRuleSetIds.length
    ? candidate.activeRuleSetIds.filter((id) => ruleSets.some((ruleSet) => ruleSet.id === id))
    : [ruleSets[0].id];

  return {
    activeModelId,
    activeRuleSetIds: activeRuleSetIds.length ? activeRuleSetIds : [ruleSets[0].id],
    autoPasteResult: Boolean(candidate?.autoPasteResult),
    shortcut: {
      proofread: candidate?.shortcut?.proofread || fallbackSettings.shortcut.proofread,
      reopen: candidate?.shortcut?.reopen || fallbackSettings.shortcut.reopen
    },
    providerApiKeys: candidate?.providerApiKeys ?? {},
    ruleSets,
    systemPrompt: candidate?.systemPrompt || fallbackSettings.systemPrompt,
    models
  };
}

function normalizeVerificationList(value: VerificationIssue[] | undefined | null) {
  if (!Array.isArray(value)) {
    return [] as VerificationIssue[];
  }

  return value.filter(
    (issue): issue is VerificationIssue =>
      Boolean(issue) &&
      (issue.severity === 'issue' || issue.severity === 'warning') &&
      typeof issue.title === 'string' &&
      typeof issue.detail === 'string'
  );
}

export function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [history, setHistory] = useState<ProofreadHistoryItem[]>([]);
  const [source, setSource] = useState('');
  const [result, setResult] = useState('');
  const [verification, setVerification] = useState<VerificationIssue[]>([]);
  const [promptPreview, setPromptPreview] = useState('');
  const [status, setStatus] = useState('起動中...');
  const [busy, setBusy] = useState(false);
  const [draftModel, setDraftModel] = useState<ModelProfile>(emptyModel);
  const [draftRuleSet, setDraftRuleSet] = useState<RuleSet>(emptyRuleSet);
  const [draftRuleText, setDraftRuleText] = useState('');
  const [copied, setCopied] = useState(false);
  const [ruleSetSaved, setRuleSetSaved] = useState(false);
  const ruleSetDialogRef = useRef<HTMLDialogElement>(null);
  const modelDialogRef = useRef<HTMLDialogElement>(null);
  const apiKeyDialogRef = useRef<HTMLDialogElement>(null);
  const pastedRef = useRef(false);

  useEffect(() => {
    const boot = async () => {
      const [rawSettings, loadedHistory] = await Promise.all([
        api.getSettings(),
        api.listHistory()
      ]);
      const loadedSettings = normalizeSettings(rawSettings);
      setSettings(loadedSettings);
      setHistory(loadedHistory);
      setDraftModel(loadedSettings.models[0] ?? emptyModel);
      const initialRuleSet = loadedSettings.ruleSets[0] ?? emptyRuleSet;
      setDraftRuleSet(initialRuleSet);
      setDraftRuleText(initialRuleSet.rules.join('\n'));
      setStatus('待機中。ショートカットまたは左上の操作から校正できます。');
    };

    void boot();

    const offCaptured = api.onCaptured(({ source: capturedSource }) => {
      setBusy(true);
      setSource(capturedSource);
      setStatus('選択テキストを取得しました。校正中です...');
    });
    const offCompleted = api.onCompleted((payload) => {
      setBusy(false);
      setSource(payload.source);
      setResult(payload.output);
      setVerification(normalizeVerificationList(payload.verification));
      setPromptPreview(payload.promptPreview);
      setHistory(payload.history);
      setStatus(`${payload.modelName} で校正しました。`);
    });
    const offStatus = api.onStatus((payload) => {
      setBusy(false);
      setStatus(payload.message);
    });

    return () => {
      offCaptured();
      offCompleted();
      offStatus();
    };
  }, []);

  async function runManualProofread(sourceOverride?: string) {
    const textToProofread = sourceOverride ?? source;
    if (!textToProofread.trim()) {
      setStatus('校正する本文を入力してください。');
      return;
    }

    setBusy(true);
    setStatus('本文を校正しています...');
    try {
      const response = await api.runProofread(textToProofread, currentSettings);
      setResult(response.output);
      setVerification(normalizeVerificationList(response.verification));
      setPromptPreview(response.promptPreview);
      setHistory(response.history);
      const currentModel = settings?.models.find((model) => model.id === settings.activeModelId);
      setStatus(`${currentModel?.name ?? 'LLM'} で校正しました。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '校正に失敗しました。');
    } finally {
      setBusy(false);
    }
  }

  async function copyResult() {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function saveCurrentSettings(next: AppSettings) {
    const saved = normalizeSettings(await api.saveSettings(normalizeSettings(next)));
    setSettings(saved);
    if (!saved.models.find((model) => model.id === draftModel.id)) {
      setDraftModel(saved.models[0] ?? emptyModel);
    }
    setStatus('設定を保存しました。ショートカットはすぐ反映されます。');
  }

  if (!settings) {
    return <div className="loading">Kousei を読み込んでいます...</div>;
  }

  const currentSettings = normalizeSettings(settings);
  const activeModel = currentSettings.models.find((m) => m.id === currentSettings.activeModelId) ?? currentSettings.models[0];
  const activeRuleSets = currentSettings.ruleSets.filter((rs) => currentSettings.activeRuleSetIds.includes(rs.id));
  const displaySegments = buildDisplaySegments(source, result);
  const safeVerification = normalizeVerificationList(verification);
  const statusTone = busy ? 'running' : safeVerification.length ? 'attention' : result ? 'clear' : 'idle';

  async function toggleRuleSet(ruleSetId: string, checked: boolean) {
    const nextActiveRuleSetIds = checked
      ? Array.from(new Set([...currentSettings.activeRuleSetIds, ruleSetId]))
      : currentSettings.activeRuleSetIds.filter((id) => id !== ruleSetId);

    const safeActiveIds = nextActiveRuleSetIds.length
      ? nextActiveRuleSetIds
      : currentSettings.ruleSets[0]
        ? [currentSettings.ruleSets[0].id]
        : [];

    await saveCurrentSettings({
      ...currentSettings,
      activeRuleSetIds: safeActiveIds
    });
  }

  async function saveDraftRuleSet() {
    const normalizedName = draftRuleSet.name.trim() || `ルールセット ${currentSettings.ruleSets.length + 1}`;
    const normalizedRuleSet: RuleSet = {
      ...draftRuleSet,
      id: draftRuleSet.id || createRuleSetId(normalizedName),
      name: normalizedName,
      rules: parseRules(draftRuleText)
    };

    const exists = currentSettings.ruleSets.some((ruleSet) => ruleSet.id === normalizedRuleSet.id);
    const nextSettings: AppSettings = {
      ...currentSettings,
      ruleSets: exists
        ? currentSettings.ruleSets.map((ruleSet) =>
            ruleSet.id === normalizedRuleSet.id ? normalizedRuleSet : ruleSet
          )
        : [...currentSettings.ruleSets, normalizedRuleSet]
    };

    await saveCurrentSettings(nextSettings);
    setDraftRuleSet(normalizedRuleSet);
    setDraftRuleText(normalizedRuleSet.rules.join('\n'));
    setRuleSetSaved(true);
    setTimeout(() => setRuleSetSaved(false), 2000);
  }

  async function deleteDraftModel() {
    if (draftModel.builtin || currentSettings.models.filter((m) => !m.builtin).length === 0) return;
    const nextModels = currentSettings.models.filter((m) => m.id !== draftModel.id);
    const nextActiveModelId = currentSettings.activeModelId === draftModel.id
      ? nextModels[0]?.id ?? ''
      : currentSettings.activeModelId;
    await saveCurrentSettings({ ...currentSettings, models: nextModels, activeModelId: nextActiveModelId });
    setDraftModel(nextModels[0] ?? emptyModel);
  }

  async function deleteDraftRuleSet() {
    if (!draftRuleSet.id || currentSettings.ruleSets.length === 1) {
      return;
    }

    const nextRuleSets = currentSettings.ruleSets.filter((ruleSet) => ruleSet.id !== draftRuleSet.id);
    const nextActiveRuleSetIds = currentSettings.activeRuleSetIds.filter((id) => id !== draftRuleSet.id);
    const safeActiveIds = nextActiveRuleSetIds.length ? nextActiveRuleSetIds : [nextRuleSets[0].id];

    await saveCurrentSettings({
      ...currentSettings,
      ruleSets: nextRuleSets,
      activeRuleSetIds: safeActiveIds
    });
    const nextDraft = nextRuleSets[0] ?? emptyRuleSet;
    setDraftRuleSet(nextDraft);
    setDraftRuleText(nextDraft.rules.join('\n'));
  }

  return (
    <main className="shell">
      <div className="statusLine">
        <span className={`statusDot ${statusTone}`} />
        <span className="subtle">{status}</span>
      </div>

      <section className="workspace">
        <article className="pane editorPane">
          <div className="paneHeader">
            <h2>入力エディタ</h2>
            <button className="accent" onClick={() => void runManualProofread()} disabled={busy}>
              校正
            </button>
          </div>
          <textarea
            className="editor"
            value={source}
            onPaste={(event) => {
              const pasted = event.clipboardData.getData('text');
              if (pasted.length > 10) pastedRef.current = true;
            }}
            onChange={(event) => {
              const newValue = event.target.value;
              setSource(newValue);
              if (pastedRef.current) {
                pastedRef.current = false;
                void runManualProofread(newValue);
              }
            }}
            placeholder="ここに校正したい文章を入力するか、他アプリで文章を選択してショートカットを押してください。"
            disabled={busy}
          />
        </article>

        <article className="pane resultPane">
          <div className="paneHeader">
            <h2>校正結果</h2>
            <span style={{ color: 'var(--muted)', fontSize: '0.85rem', flex: 1 }}>
              {busy ? '校正中...' : safeVerification.length ? `${safeVerification.length} 件の確認` : ''}
            </span>
            <button
              className={`copyButton${copied ? ' copied' : ''}`}
              onClick={() => void copyResult()}
              disabled={!result || busy}
            >
              {copied ? 'コピー済み' : 'コピー'}
            </button>
          </div>
          <div className="resultCanvas">
            {displaySegments.length ? (
              displaySegments
                .filter((segment) => segment.kind !== 'deleted')
                .map((segment) => (
                  <span
                    className={`diffSegment diff-${segment.kind}`}
                    key={segment.id}
                    data-original={segment.kind === 'replaced' ? (segment.originalText ?? undefined) : undefined}
                  >
                    {segment.text}
                  </span>
                ))
            ) : (
              <p className="emptyState">校正結果がここに表示されます。</p>
            )}
          </div>
          <section className="verificationPanel">
            <div className="subPanelHeader">
              <h3>内容検証</h3>
              <span>{safeVerification.length ? '要確認あり' : '問題なし'}</span>
            </div>
            {safeVerification.length ? (
              <div className="verificationList">
                {safeVerification.map((issue) => (
                  <article className={`verificationItem verification-${issue.severity}`} key={issue.id}>
                    <strong>{issue.title}</strong>
                    <p>{issue.detail}</p>
                    {issue.sourceQuote ? <blockquote>{issue.sourceQuote}</blockquote> : null}
                  </article>
                ))}
              </div>
            ) : (
              <p className="verificationClear">
                明らかな内容矛盾や事実誤りは検出されませんでした。
              </p>
            )}
          </section>
          <details className="promptBox">
            <summary>送信プロンプトを確認</summary>
            <pre>{promptPreview || 'まだ校正していません。'}</pre>
          </details>
        </article>

        <article className="pane settingsPane">
          <div className="paneHeader">
            <h2>実行条件</h2>
          </div>

          <label className="field">
            <span>モデル</span>
            <select
              value={currentSettings.activeModelId}
              onChange={(event) =>
                void saveCurrentSettings({ ...currentSettings, activeModelId: event.target.value })
              }
            >
              {currentSettings.models.map((model) => (
                <option value={model.id} key={model.id}>{model.name}</option>
              ))}
            </select>
          </label>

          <div className="sidebarSection">
            <div className="sidebarSectionHeader">
              <span>ルールセット</span>
              <button className="linkButton" onClick={() => ruleSetDialogRef.current?.showModal()}>編集</button>
            </div>
            <div className="chipRow">
              {activeRuleSets.map((rs) => (
                <span className="chip" key={rs.id}>{rs.name}</span>
              ))}
            </div>
          </div>

          <div className="sidebarSection">
            <div className="sidebarSectionHeader">
              <span>モデル設定</span>
              <button className="linkButton" onClick={() => {
                setDraftModel(currentSettings.models.find((m) => m.id === currentSettings.activeModelId) ?? currentSettings.models[0] ?? emptyModel);
                modelDialogRef.current?.showModal();
              }}>編集</button>
            </div>
            <span className="sidebarMeta">{activeModel?.name}</span>
          </div>

          <div className="sidebarSection">
            <div className="sidebarSectionHeader">
              <span>API キー</span>
              <button className="linkButton" onClick={() => apiKeyDialogRef.current?.showModal()}>編集</button>
            </div>
            <div className="apiKeyStatusList">
              {(['openai-compatible', 'anthropic'] as const).map((provider) => {
                const hasKey = !!currentSettings.providerApiKeys[provider];
                return (
                  <span key={provider} className={`apiKeyStatus${hasKey ? ' set' : ''}`}>
                    {provider === 'openai-compatible' ? 'OpenAI' : 'Anthropic'}
                    {hasKey ? ' ✓' : ' 未設定'}
                  </span>
                );
              })}
            </div>
          </div>

          <details className="subPanel collapsible">
            <summary className="collapseSummary">
              <span>ショートカット</span>
            </summary>
            <div className="fieldGroup">
              <label className="field">
                <span>校正</span>
                <input
                  value={currentSettings.shortcut.proofread}
                  onChange={(event) => setSettings({ ...currentSettings, shortcut: { ...currentSettings.shortcut, proofread: event.target.value } })}
                />
              </label>
              <label className="field">
                <span>再表示</span>
                <input
                  value={currentSettings.shortcut.reopen}
                  onChange={(event) => setSettings({ ...currentSettings, shortcut: { ...currentSettings.shortcut, reopen: event.target.value } })}
                />
              </label>
              <button onClick={() => void saveCurrentSettings(currentSettings)} disabled={busy}>保存</button>
            </div>
          </details>

          <details className="subPanel collapsible">
            <summary className="collapseSummary">
              <span>履歴</span>
              <span>{history.length} 件</span>
            </summary>
            <div className="historyList">
              {history.map((item) => (
                <button className="historyItem" key={item.id} onClick={() => {
                  setSource(item.source);
                  setResult(item.output);
                  setVerification(item.verification);
                  setStatus(`${item.modelName} の履歴を読み込みました。`);
                }}>
                  <strong>{item.modelName}</strong>
                  <span>{new Date(item.createdAt).toLocaleString()}</span>
                  <p>{item.source.slice(0, 96)}</p>
                </button>
              ))}
            </div>
          </details>
        </article>
      </section>

      {/* ルールセットダイアログ */}
      <dialog ref={ruleSetDialogRef} className="kDialog">
        <div className="dialogHeader">
          <h2>ルールセット</h2>
          <button className="dialogClose" onClick={() => ruleSetDialogRef.current?.close()}>✕</button>
        </div>
        <div className="dialogBody" style={{ flexDirection: 'row', gap: 0, padding: 0, overflow: 'hidden' }}>
          {/* 左カラム：一覧 */}
          <div className="ruleSetSidebar">
            <div className="ruleSetSidebarHeader">
              <span>一覧</span>
              <button className="linkButton" onClick={() => { setDraftRuleSet({ ...emptyRuleSet }); setDraftRuleText(''); }}>
                + 新規
              </button>
            </div>
            <div className="ruleSetList">
              {currentSettings.ruleSets.map((ruleSet) => {
                const isActive = currentSettings.activeRuleSetIds.includes(ruleSet.id);
                const isEditing = draftRuleSet.id === ruleSet.id;
                return (
                  <button
                    key={ruleSet.id}
                    className={`ruleSetListItem${isEditing ? ' editing' : ''}`}
                    onClick={() => {
                      setDraftRuleSet(ruleSet);
                      setDraftRuleText(ruleSet.rules.join('\n'));
                    }}
                  >
                    <span className={`ruleSetActiveIndicator${isActive ? ' active' : ''}`} title={isActive ? '使用中' : '未使用'} />
                    <span className="ruleSetListItemName">{ruleSet.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 右カラム：編集フォーム */}
          <div className="ruleSetEditor">
            <div className="ruleSetEditorInner">
              {/* ステータス行 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 28 }}>
                <p className="ruleSetEditorHint" style={{ flex: 1, margin: 0 }}>
                  {draftRuleSet.id
                    ? currentSettings.activeRuleSetIds.includes(draftRuleSet.id)
                      ? '校正で使用中'
                      : '未使用'
                    : '新規作成'}
                </p>
                {draftRuleSet.id && (
                  <button
                    className="linkButton"
                    onClick={() => void toggleRuleSet(draftRuleSet.id, !currentSettings.activeRuleSetIds.includes(draftRuleSet.id))}
                  >
                    {currentSettings.activeRuleSetIds.includes(draftRuleSet.id) ? '使用を外す' : '校正に使用する'}
                  </button>
                )}
              </div>

              {/* 編集フォーム */}
              <label className="field" style={{ marginTop: 0 }}>
                <span>ルールセット名</span>
                <input
                  value={draftRuleSet.name}
                  onChange={(e) => setDraftRuleSet({ ...draftRuleSet, name: e.target.value })}
                  placeholder="例: プレスリリース調整"
                />
              </label>
              <label className="field" style={{ marginTop: 0 }}>
                <span>ルール（1行1件）</span>
                <textarea
                  className="rules"
                  value={draftRuleText}
                  onChange={(e) => setDraftRuleText(e.target.value)}
                  placeholder="自然で読みやすい日本語を優先する&#10;冗長な表現は簡潔にする"
                />
              </label>
            </div>
            <div className="ruleSetEditorFooter">
              {ruleSetSaved && <span className="ruleSetSavedNote">保存しました</span>}
              <div style={{ flex: 1 }} />
              {draftRuleSet.id && (
                <button
                  onClick={() => void deleteDraftRuleSet()}
                  disabled={busy || currentSettings.ruleSets.length === 1}
                >
                  削除
                </button>
              )}
              <button
                className={`accent${ruleSetSaved ? ' saved' : ''}`}
                onClick={() => void saveDraftRuleSet()}
                disabled={busy || ruleSetSaved}
              >
                {ruleSetSaved ? '保存済み' : draftRuleSet.id ? '保存' : '作成'}
              </button>
            </div>
          </div>
        </div>
      </dialog>

      {/* モデル設定ダイアログ */}
      <dialog ref={modelDialogRef} className="kDialog">
        <div className="dialogHeader">
          <h2>モデル設定</h2>
          <button className="dialogClose" onClick={() => modelDialogRef.current?.close()}>✕</button>
        </div>
        <div className="dialogBody" style={{ flexDirection: 'row', gap: 0, padding: 0, overflow: 'hidden' }}>
          {/* 左カラム：モデル一覧 */}
          <div className="ruleSetSidebar">
            <div className="ruleSetSidebarHeader">
              <span>一覧</span>
              <button className="linkButton" onClick={() => setDraftModel({ ...emptyModel, id: `custom-${Date.now()}` })}>
                + 追加
              </button>
            </div>
            <div className="ruleSetList">
              {currentSettings.models.map((model) => {
                const isActive = model.id === currentSettings.activeModelId;
                const isEditing = draftModel.id === model.id;
                return (
                  <button
                    key={model.id}
                    className={`ruleSetListItem${isEditing ? ' editing' : ''}`}
                    onClick={() => setDraftModel(model)}
                  >
                    <span className={`ruleSetActiveIndicator${isActive ? ' active' : ''}`} title={isActive ? '使用中' : ''} />
                    <span className="ruleSetListItemName">{model.name}</span>
                  </button>
                );
              })}
              {!currentSettings.models.some((m) => m.id === draftModel.id) && draftModel.id && (
                <button className="ruleSetListItem editing">
                  <span className="ruleSetActiveIndicator" />
                  <span className="ruleSetListItemName">{draftModel.name || '新規モデル'}</span>
                </button>
              )}
            </div>
          </div>

          {/* 右カラム：詳細・編集 */}
          <div className="ruleSetEditor">
            <div className="ruleSetEditorInner">
              {/* 使用状況 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 28 }}>
                <p className="ruleSetEditorHint" style={{ flex: 1, margin: 0 }}>
                  {draftModel.id === currentSettings.activeModelId
                    ? '現在の校正で使用中'
                    : currentSettings.models.some((m) => m.id === draftModel.id)
                      ? '未選択'
                      : '新規作成'}
                </p>
                {draftModel.id && draftModel.id !== currentSettings.activeModelId && currentSettings.models.some((m) => m.id === draftModel.id) && (
                  <button className="linkButton" onClick={() => void saveCurrentSettings({ ...currentSettings, activeModelId: draftModel.id })}>
                    このモデルを使用
                  </button>
                )}
              </div>

              {/* 組み込みモデル：読み取り専用表示 */}
              {draftModel.builtin ? (
                <>
                  <div className="modelInfoGrid">
                    <span className="modelInfoLabel">Provider</span>
                    <span>{draftModel.provider === 'openai-compatible' ? 'OpenAI compatible' : draftModel.provider === 'anthropic' ? 'Anthropic' : 'Ollama'}</span>
                    <span className="modelInfoLabel">Model ID</span>
                    <span>{draftModel.model}</span>
                    <span className="modelInfoLabel">Endpoint</span>
                    <span className="modelInfoEndpoint">{draftModel.endpoint}</span>
                  </div>
                  <p className="ruleSetEditorHint">組み込みモデルは変更できません。「複製」で独自設定を追加できます。</p>
                </>
              ) : (
                /* ユーザー追加モデル：編集フォーム */
                <div className="fieldGrid">
                  <label className="field full">
                    <span>表示名</span>
                    <input value={draftModel.name} onChange={(e) => setDraftModel({ ...draftModel, name: e.target.value })} placeholder="例: GPT-4o カスタム" />
                  </label>
                  <label className="field">
                    <span>Provider</span>
                    <select value={draftModel.provider} onChange={(e) => setDraftModel({ ...draftModel, provider: e.target.value as ModelProfile['provider'] })}>
                      <option value="openai-compatible">OpenAI compatible</option>
                      <option value="anthropic">Anthropic</option>
                      <option value="ollama">Ollama</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Model ID</span>
                    <input value={draftModel.model} onChange={(e) => setDraftModel({ ...draftModel, model: e.target.value })} placeholder="例: gpt-4o" />
                  </label>
                  <label className="field full">
                    <span>Endpoint</span>
                    <input value={draftModel.endpoint} onChange={(e) => setDraftModel({ ...draftModel, endpoint: e.target.value })} placeholder="https://api.openai.com/v1/chat/completions" />
                  </label>
                  <label className="field full">
                    <span>API キー（このモデル専用・任意）</span>
                    <input
                      type="password"
                      placeholder="未入力の場合はプロバイダー共通キーを使用"
                      value={draftModel.apiKey ?? ''}
                      onChange={(e) => setDraftModel({ ...draftModel, apiKey: e.target.value })}
                    />
                  </label>
                </div>
              )}

              {!draftModel.builtin && draftModel.provider !== 'ollama' && (
                <p className="ruleSetEditorHint" style={{ marginTop: 0 }}>
                  API キーは「API キー設定」で一括管理できます。
                </p>
              )}
            </div>

            <div className="ruleSetEditorFooter">
              <button onClick={() => {
                const { builtin: _builtin, ...rest } = draftModel;
                const nextModel: ModelProfile = { ...rest, id: `${draftModel.id || 'model'}-copy-${Date.now()}`, name: `${draftModel.name} (コピー)` };
                setSettings({ ...currentSettings, models: [...currentSettings.models, nextModel] });
                setDraftModel(nextModel);
              }}>
                複製
              </button>
              {!draftModel.builtin && currentSettings.models.some((m) => m.id === draftModel.id) && (
                <button onClick={() => void deleteDraftModel()} disabled={busy}>
                  削除
                </button>
              )}
              <div style={{ flex: 1 }} />
              {!draftModel.builtin && (
                <button
                  className="accent"
                  disabled={busy || !draftModel.name || !draftModel.model}
                  onClick={() => {
                    void saveCurrentSettings({
                      ...currentSettings,
                      models: currentSettings.models.some((m) => m.id === draftModel.id)
                        ? currentSettings.models.map((m) => (m.id === draftModel.id ? draftModel : m))
                        : [...currentSettings.models, draftModel]
                    });
                  }}
                >
                  保存
                </button>
              )}
            </div>
          </div>
        </div>
      </dialog>

      {/* API キー設定ダイアログ */}
      <dialog ref={apiKeyDialogRef} className="kDialog kDialog--narrow">
        <div className="dialogHeader">
          <h2>API キー設定</h2>
          <button className="dialogClose" onClick={() => apiKeyDialogRef.current?.close()}>✕</button>
        </div>
        <div className="dialogBody">
          <p className="apiKeyDialogDesc">
            各プロバイダーの API キーをここで管理します。設定したキーは同じプロバイダーのすべてのモデルに適用されます。
          </p>

          <div className="apiKeyProviderGroup">
            <div className="apiKeyProviderHeader">
              <span className="apiKeyProviderName">OpenAI compatible</span>
              <span className="apiKeyProviderDesc">GPT-5.4 シリーズなど</span>
            </div>
            <label className="field">
              <span>API キー</span>
              <input
                type="password"
                placeholder="sk-..."
                value={currentSettings.providerApiKeys['openai-compatible'] ?? ''}
                onChange={(e) => void saveCurrentSettings({
                  ...currentSettings,
                  providerApiKeys: { ...currentSettings.providerApiKeys, 'openai-compatible': e.target.value }
                })}
              />
            </label>
          </div>

          <div className="apiKeyProviderGroup">
            <div className="apiKeyProviderHeader">
              <span className="apiKeyProviderName">Anthropic</span>
              <span className="apiKeyProviderDesc">Claude シリーズ</span>
            </div>
            <label className="field">
              <span>API キー</span>
              <input
                type="password"
                placeholder="sk-ant-..."
                value={currentSettings.providerApiKeys['anthropic'] ?? ''}
                onChange={(e) => void saveCurrentSettings({
                  ...currentSettings,
                  providerApiKeys: { ...currentSettings.providerApiKeys, anthropic: e.target.value }
                })}
              />
            </label>
          </div>

          <div className="apiKeyProviderGroup">
            <div className="apiKeyProviderHeader">
              <span className="apiKeyProviderName">Ollama</span>
              <span className="apiKeyProviderDesc">ローカル実行・API キー不要</span>
            </div>
            <p className="ruleSetEditorHint" style={{ margin: 0 }}>Ollama は認証なしでローカルに接続します。</p>
          </div>
        </div>
        <div className="dialogFooter">
          <p className="ruleSetEditorHint" style={{ margin: 0 }}>変更は即時保存されます。</p>
          <div style={{ flex: 1 }} />
          <button onClick={() => apiKeyDialogRef.current?.close()}>閉じる</button>
        </div>
      </dialog>
    </main>
  );
}
