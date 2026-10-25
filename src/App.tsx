import { useEffect, useRef, useState, type ReactNode } from 'react';
import { buildDisplaySegments } from './diff';
import { mockApi } from './mockApi';
import type {
  AppSettings,
  ModelProfile,
  ProofreadHistoryItem,
  Provider,
  RuleSet,
  ShortcutConfig,
  StatusPayload,
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
    proofread: 'Command+Shift+K',
    reopen: 'Command+Shift+L'
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

const api = typeof window !== 'undefined' && window.shallowTWrite ? window.shallowTWrite : mockApi;
const isApplePlatform = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const shortcutFieldMeta: Record<keyof ShortcutConfig, { title: string }> = {
  proofread: {
    title: '校正'
  },
  reopen: {
    title: '再表示'
  }
};
const modifierOnlyKeys = new Set(['Meta', 'Control', 'Shift', 'Alt', 'AltGraph']);

function getAcceleratorKeyFromEvent(event: KeyboardEvent) {
  const { code, key } = event;

  if (/^Key[A-Z]$/.test(code)) {
    return code.slice(3);
  }

  if (/^Digit[0-9]$/.test(code)) {
    return code.slice(5);
  }

  if (/^F([1-9]|1[0-9]|2[0-4])$/i.test(key)) {
    return key.toUpperCase();
  }

  switch (key) {
    case ' ':
    case 'Spacebar':
      return 'Space';
    case 'Enter':
      return 'Return';
    case 'Tab':
      return 'Tab';
    case 'Backspace':
      return 'Backspace';
    case 'Delete':
      return 'Delete';
    case 'Insert':
      return 'Insert';
    case 'Home':
      return 'Home';
    case 'End':
      return 'End';
    case 'PageUp':
      return 'PageUp';
    case 'PageDown':
      return 'PageDown';
    case 'ArrowUp':
      return 'Up';
    case 'ArrowDown':
      return 'Down';
    case 'ArrowLeft':
      return 'Left';
    case 'ArrowRight':
      return 'Right';
    case 'Escape':
      return 'Escape';
    default:
      return /^[a-z0-9]$/i.test(key) ? key.toUpperCase() : null;
  }
}

function formatShortcutForDisplay(accelerator: string) {
  const labelMap: Record<string, string> = {
    Command: isApplePlatform ? 'Command' : 'Super',
    CommandOrControl: isApplePlatform ? 'Command' : 'Control',
    Control: 'Control',
    Alt: isApplePlatform ? 'Option' : 'Alt',
    Shift: 'Shift',
    Super: 'Super',
    Return: 'Return',
    Space: 'Space',
    Escape: 'Esc',
    Up: '↑',
    Down: '↓',
    Left: '←',
    Right: '→',
    PageUp: 'Page Up',
    PageDown: 'Page Down',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Insert: 'Insert',
    Home: 'Home',
    End: 'End',
    Tab: 'Tab'
  };

  return accelerator
    .split('+')
    .filter(Boolean)
    .map((segment) => labelMap[segment] ?? segment)
    .join(' + ');
}

/** ステータスバーやヒント用の短い表記 (例: ⌘⇧K) */
function formatShortcutCompact(accelerator: string) {
  if (!isApplePlatform) {
    return formatShortcutForDisplay(accelerator).replaceAll(' + ', '+');
  }

  const symbolMap: Record<string, string> = {
    Command: '⌘',
    CommandOrControl: '⌘',
    Control: '⌃',
    Alt: '⌥',
    Shift: '⇧',
    Return: '↩',
    Escape: '⎋',
    Space: '␣'
  };

  return accelerator
    .split('+')
    .filter(Boolean)
    .map((segment) => symbolMap[segment] ?? formatShortcutForDisplay(segment))
    .join('');
}

type IconName = 'history' | 'settings' | 'copy' | 'check' | 'edit' | 'chevron' | 'spark';

/** 装飾ではなく操作の手がかりとして使う最小限のアイコン */
function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    history: (
      <>
        <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
        <path d="M3.5 4.5v4h4" />
        <path d="M12 7.5V12l3 2" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
      </>
    ),
    copy: (
      <>
        <rect x="9" y="9" width="11" height="11" rx="2.5" />
        <path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15" />
      </>
    ),
    check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
    edit: (
      <>
        <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z" />
        <path d="M13.5 6.5l4 4" />
      </>
    ),
    chevron: <path d="M7 10l5 5 5-5" />,
    spark: (
      <path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9L12 3.5zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" />
    )
  };

  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  );
}

/** ヘッダーのブランドマーク */
function BrandMark() {
  return (
    <svg className="brandMark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="brandFlame" x1="0" y1="1" x2="0.4" y2="0">
          <stop offset="0" stopColor="#505bd5" />
          <stop offset="0.55" stopColor="#5fa8ec" />
          <stop offset="1" stopColor="#92e7eb" />
        </linearGradient>
      </defs>
      <path
        d="M16 2.5c1.2 4.3 6.8 7.4 7.6 13.2.8 5.9-3.4 11.3-7.6 11.8-4.6.5-9-3.1-9.1-8.6-.1-3.5 1.9-6 3.6-7.6-.1 2.3.6 4.3 2.4 5.3-.6-5.4 1.6-9.9 3.1-14.1z"
        fill="url(#brandFlame)"
      />
      <path d="M16.2 16.5c2.4 1.9 3.2 4.2 2.6 6.2-.5 1.9-2.1 2.9-3.4 2.8-1.7-.1-3-1.6-2.8-3.6.2-2 1.9-3.2 3.6-5.4z" fill="#e565d4" />
    </svg>
  );
}

type ShortcutCaptureResult =
  | { error: string }
  | {
      accelerator: string;
      display: string;
    };

function captureShortcut(event: KeyboardEvent): ShortcutCaptureResult {
  if (modifierOnlyKeys.has(event.key)) {
    return { error: '修飾キーだけでは登録できません。文字キーや矢印キーを組み合わせてください。' };
  }

  const mainKey = getAcceleratorKeyFromEvent(event);
  if (!mainKey) {
    return { error: `「${event.key}」はまだショートカット入力に対応していません。` };
  }

  const modifiers: string[] = [];
  if (event.metaKey) modifiers.push(isApplePlatform ? 'Command' : 'Super');
  if (event.ctrlKey) modifiers.push('Control');
  if (event.altKey) modifiers.push('Alt');
  if (event.shiftKey) modifiers.push('Shift');

  if (!modifiers.length) {
    return { error: '誤操作を防ぐため、Command / Control / Option / Shift のいずれかを含めてください。' };
  }

  const accelerator = [...modifiers, mainKey].join('+');
  return {
    accelerator,
    display: formatShortcutForDisplay(accelerator)
  };
}

type ShortcutRecorderCardProps = {
  title: string;
  value: string;
  isRecording: boolean;
  onStart: () => void;
  onCancel: () => void;
  onReset: () => void;
};

function ShortcutRecorderCard({
  title,
  value,
  isRecording,
  onStart,
  onCancel,
  onReset
}: ShortcutRecorderCardProps) {
  return (
    <section className={`shortcutRecorderCard${isRecording ? ' recording' : ''}`}>
      <div className="shortcutRecorderHeader">
        <strong>{title}</strong>
        <span className={`shortcutRecorderBadge${isRecording ? ' recording' : ''}`}>
          {isRecording ? '録音中' : '現在の設定'}
        </span>
      </div>

      <div className="shortcutRecorderValue" aria-live="polite">
        <span className="shortcutRecorderDisplay">{formatShortcutForDisplay(value)}</span>
        <code>{value}</code>
      </div>

      <p className="shortcutRecorderHint">
        {isRecording
          ? 'キーを押してください。Esc でキャンセル'
          : '記録開始後にキーを入力'}
      </p>

      <div className="shortcutRecorderActions">
        <button className={isRecording ? 'accent' : ''} onClick={isRecording ? onCancel : onStart}>
          {isRecording ? 'キャンセル' : '記録開始'}
        </button>
        <button onClick={onReset}>初期値に戻す</button>
      </div>
    </section>
  );
}

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
  // 案内ボタンは、それを出したステータス文言が表示されている間だけ出す
  const [statusAction, setStatusAction] = useState<{ message: string; action: NonNullable<StatusPayload['action']> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [draftModel, setDraftModel] = useState<ModelProfile>(emptyModel);
  const [draftRuleSet, setDraftRuleSet] = useState<RuleSet>(emptyRuleSet);
  const [draftRuleText, setDraftRuleText] = useState('');
  const [copied, setCopied] = useState(false);
  const [ruleSetSaved, setRuleSetSaved] = useState(false);
  const [recordingShortcut, setRecordingShortcut] = useState<keyof ShortcutConfig | null>(null);
  const [shortcutNotice, setShortcutNotice] = useState('');
  const [draftProviderApiKeys, setDraftProviderApiKeys] = useState<AppSettings['providerApiKeys']>({});
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [resultView, setResultView] = useState<'diff' | 'clean'>('diff');
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const ruleSetDialogRef = useRef<HTMLDialogElement>(null);
  const modelDialogRef = useRef<HTMLDialogElement>(null);
  const shortcutDialogRef = useRef<HTMLDialogElement>(null);
  const historyDialogRef = useRef<HTMLDialogElement>(null);
  const apiKeyDialogRef = useRef<HTMLDialogElement>(null);
  const committedProviderApiKeysRef = useRef<AppSettings['providerApiKeys']>({});
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
      setStatus('準備完了');
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
      setStatusAction(payload.action ? { message: payload.message, action: payload.action } : null);
    });

    return () => {
      offCaptured();
      offCompleted();
      offStatus();
    };
  }, []);

  useEffect(() => {
    if (!recordingShortcut) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (event.key === 'Escape') {
        setRecordingShortcut(null);
        setShortcutNotice('ショートカットの記録をキャンセルしました。');
        return;
      }

      const captured = captureShortcut(event);
      if ('error' in captured) {
        setShortcutNotice(captured.error);
        return;
      }

      setSettings((prev) => {
        if (!prev) {
          return prev;
        }

        const normalized = normalizeSettings(prev);
        return {
          ...normalized,
          shortcut: {
            ...normalized.shortcut,
            [recordingShortcut]: captured.accelerator
          }
        };
      });
      setRecordingShortcut(null);
      setShortcutNotice(`${shortcutFieldMeta[recordingShortcut].title} を ${captured.display} に設定しました。保存すると反映されます。`);
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [recordingShortcut]);

  useEffect(() => {
    if (!settingsMenuOpen) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!settingsMenuRef.current?.contains(event.target as Node)) {
        setSettingsMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSettingsMenuOpen(false);
      }
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [settingsMenuOpen]);

  useEffect(() => {
    if (!recordingShortcut) {
      return;
    }

    void api.suspendShortcuts();

    return () => {
      void api.resumeShortcuts();
    };
  }, [recordingShortcut]);

  async function runManualProofread(sourceOverride?: string) {
    const textToProofread = sourceOverride ?? source;
    if (!textToProofread.trim()) {
      setStatus('校正する本文を入力してください。');
      return;
    }

    setBusy(true);
    setStatus('本文を校正しています...');
    try {
      const response = await api.runProofread(textToProofread);
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
    return <div className="loading">ShallowT Write を読み込んでいます...</div>;
  }

  const currentSettings = normalizeSettings(settings);
  const activeModel = currentSettings.models.find((m) => m.id === currentSettings.activeModelId) ?? currentSettings.models[0];
  const activeRuleSets = currentSettings.ruleSets.filter((rs) => currentSettings.activeRuleSetIds.includes(rs.id));
  const displaySegments = buildDisplaySegments(source, result);
  const safeVerification = normalizeVerificationList(verification);
  const statusTone = busy ? 'running' : safeVerification.length ? 'attention' : result ? 'clear' : 'idle';
  const shortcutConflict = currentSettings.shortcut.proofread === currentSettings.shortcut.reopen;
  const shortcutMessage = shortcutConflict
    ? '「校正」と「再表示」に同じショートカットは設定できません。別の組み合わせにしてください。'
    : shortcutNotice;

  function openShortcutDialog() {
    setShortcutNotice('');
    shortcutDialogRef.current?.showModal();
  }

  function openHistoryDialog() {
    historyDialogRef.current?.showModal();
  }

  function closeShortcutDialog() {
    setRecordingShortcut(null);
    shortcutDialogRef.current?.close();
  }

  function closeHistoryDialog() {
    historyDialogRef.current?.close();
  }

  function openApiKeyDialog() {
    committedProviderApiKeysRef.current = currentSettings.providerApiKeys;
    setDraftProviderApiKeys(currentSettings.providerApiKeys);
    apiKeyDialogRef.current?.showModal();
  }

  function updateDraftProviderApiKey(provider: Provider, value: string) {
    setDraftProviderApiKeys((current) => ({ ...current, [provider]: value }));
  }

  async function commitProviderApiKeys() {
    const committed = committedProviderApiKeysRef.current;
    const providers = new Set([...Object.keys(committed), ...Object.keys(draftProviderApiKeys)] as Provider[]);
    const changed = [...providers].some((provider) => (committed[provider] ?? '') !== (draftProviderApiKeys[provider] ?? ''));
    if (!changed) return;

    // blur と close が続けて発火しても二重保存しないよう、保存前に確定扱いにする
    committedProviderApiKeysRef.current = draftProviderApiKeys;
    try {
      await saveCurrentSettings({ ...currentSettings, providerApiKeys: draftProviderApiKeys });
    } catch (error) {
      committedProviderApiKeysRef.current = committed;
      setStatus(error instanceof Error ? error.message : 'API キーの保存に失敗しました。');
    }
  }

  function startShortcutRecording(target: keyof ShortcutConfig) {
    setRecordingShortcut(target);
    setShortcutNotice('');
  }

  function cancelShortcutRecording() {
    setRecordingShortcut(null);
    setShortcutNotice('ショートカットの記録をキャンセルしました。');
  }

  function resetShortcut(target: keyof ShortcutConfig) {
    const nextValue = fallbackSettings.shortcut[target];
    setSettings({
      ...currentSettings,
      shortcut: {
        ...currentSettings.shortcut,
        [target]: nextValue
      }
    });
    setShortcutNotice(`${shortcutFieldMeta[target].title}ショートカットを初期値に戻しました。保存すると反映されます。`);
  }

  function resetAllShortcuts() {
    setSettings({
      ...currentSettings,
      shortcut: { ...fallbackSettings.shortcut }
    });
    setShortcutNotice('ショートカットをすべて初期値に戻しました。保存すると反映されます。');
  }

  function loadHistoryItem(item: ProofreadHistoryItem) {
    setSource(item.source);
    setResult(item.output);
    setVerification(item.verification);
    setPromptPreview('');
    setStatus(`${item.modelName} の履歴を読み込みました。`);
    closeHistoryDialog();
  }

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

  function openModelDialog() {
    setDraftModel(activeModel ?? emptyModel);
    modelDialogRef.current?.showModal();
  }

  function openFromSettingsMenu(open: () => void) {
    setSettingsMenuOpen(false);
    open();
  }

  const statusActionVisible = statusAction?.message === status;
  const hasResult = displaySegments.length > 0;
  const issueCount = safeVerification.filter((issue) => issue.severity === 'issue').length;
  const missingApiKey = activeModel && activeModel.provider !== 'ollama' && !activeModel.apiKey && !currentSettings.providerApiKeys[activeModel.provider];

  return (
    <main className={`shell${busy ? ' isBusy' : ''}`}>
      <header className="topBar">
        <div className="brand">
          <BrandMark />
          <span className="brandName">ShallowT <em>Write</em></span>
        </div>

        <div className="toolbar" role="toolbar" aria-label="校正の条件">
          <label className="modelPicker">
            <span className="visuallyHidden">モデル</span>
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
            <Icon name="chevron" />
          </label>

          <div className="ruleChips" role="group" aria-label="ルールセット（クリックで切り替え）">
            {currentSettings.ruleSets.map((ruleSet) => {
              const isActive = currentSettings.activeRuleSetIds.includes(ruleSet.id);
              return (
                <button
                  key={ruleSet.id}
                  className={`ruleChip${isActive ? ' active' : ''}`}
                  aria-pressed={isActive}
                  title={ruleSet.rules.join('\n')}
                  onClick={() => void toggleRuleSet(ruleSet.id, !isActive)}
                >
                  {ruleSet.name}
                </button>
              );
            })}
            <button className="iconButton" title="ルールセットを編集" aria-label="ルールセットを編集" onClick={() => ruleSetDialogRef.current?.showModal()}>
              <Icon name="edit" />
            </button>
          </div>
        </div>

        <div className="topActions">
          <button className="ghostButton" aria-label={`履歴（${history.length} 件）`} onClick={openHistoryDialog}>
            <Icon name="history" />
            <span>履歴</span>
            <span className="countBadge">{history.length}</span>
          </button>
          <div className="menuAnchor" ref={settingsMenuRef}>
            <button
              className={`ghostButton${missingApiKey ? ' needsAttention' : ''}`}
              aria-label={missingApiKey ? '設定（API キーが未設定です）' : '設定'}
              aria-haspopup="menu"
              aria-expanded={settingsMenuOpen}
              onClick={() => setSettingsMenuOpen((open) => !open)}
            >
              <Icon name="settings" />
              <span>設定</span>
            </button>
            {settingsMenuOpen && (
              <div className="menu" role="menu">
                <button role="menuitem" onClick={() => openFromSettingsMenu(openModelDialog)}>
                  <span>モデル</span>
                  <small>{activeModel?.name}</small>
                </button>
                <button role="menuitem" onClick={() => openFromSettingsMenu(() => ruleSetDialogRef.current?.showModal())}>
                  <span>ルールセット</span>
                  <small>{activeRuleSets.map((ruleSet) => ruleSet.name).join('・')}</small>
                </button>
                <button role="menuitem" onClick={() => openFromSettingsMenu(openShortcutDialog)}>
                  <span>ショートカット</span>
                  <small>{formatShortcutCompact(currentSettings.shortcut.proofread)} / {formatShortcutCompact(currentSettings.shortcut.reopen)}</small>
                </button>
                <button role="menuitem" onClick={() => openFromSettingsMenu(openApiKeyDialog)}>
                  <span>API キー</span>
                  <small className={missingApiKey ? 'warn' : ''}>
                    {(['openai-compatible', 'anthropic', 'xai'] as const)
                      .filter((provider) => currentSettings.providerApiKeys[provider])
                      .map((provider) => ({ 'openai-compatible': 'OpenAI', anthropic: 'Anthropic', xai: 'xAI' })[provider])
                      .join('・') || '未設定'}
                  </small>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <section className="workspace">
        <article className="card sourceCard">
          <div className="cardHeader">
            <h2>原文</h2>
            <span className="meta">{source.length.toLocaleString()} 文字</span>
          </div>
          <textarea
            className="editor"
            value={source}
            aria-label="原文"
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
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !busy) {
                event.preventDefault();
                void runManualProofread();
              }
            }}
            placeholder="校正したい文章を入力・貼り付け"
            disabled={busy}
          />
          <div className="cardFooter">
            <span className="hint">
              <kbd>{isApplePlatform ? '⌘' : 'Ctrl'}</kbd><kbd>↩</kbd> で校正・貼り付けると自動で校正
            </span>
            <button className="primaryButton" onClick={() => void runManualProofread()} disabled={busy || !source.trim()}>
              <Icon name="spark" />
              {busy ? '校正中…' : '校正する'}
            </button>
          </div>
        </article>

        <article className={`card resultCard${busy ? ' busy' : ''}`} aria-busy={busy}>
          <div className="cardHeader">
            <h2>校正結果</h2>
            {hasResult && <span className="meta">{result.length.toLocaleString()} 文字</span>}
            <div className="cardHeaderActions">
              <div className="segmented" role="radiogroup" aria-label="表示">
                <button role="radio" aria-checked={resultView === 'diff'} className={resultView === 'diff' ? 'active' : ''} onClick={() => setResultView('diff')}>
                  差分
                </button>
                <button role="radio" aria-checked={resultView === 'clean'} className={resultView === 'clean' ? 'active' : ''} onClick={() => setResultView('clean')}>
                  仕上がり
                </button>
              </div>
              <button
                className={`ghostButton copyButton${copied ? ' copied' : ''}`}
                aria-label={copied ? 'コピーしました' : '校正結果をコピー'}
                onClick={() => void copyResult()}
                disabled={!result || busy}
              >
                <Icon name={copied ? 'check' : 'copy'} />
                <span>{copied ? 'コピーしました' : 'コピー'}</span>
              </button>
            </div>
          </div>

          <div className={`resultCanvas view-${resultView}`}>
            {busy && !hasResult ? (
              <div className="skeleton" aria-hidden="true">
                <span /><span /><span />
              </div>
            ) : hasResult ? (
              resultView === 'clean' ? (
                <p className="cleanText">{result}</p>
              ) : (
                <p className="diffText">
                  {displaySegments.map((segment) => {
                    if (segment.kind === 'deleted') {
                      return <del className="diffSegment diff-deleted" key={segment.id} title="削除">{segment.originalText}</del>;
                    }
                    if (segment.kind === 'replaced') {
                      return (
                        <span className="diffSegment diff-replaced" key={segment.id}>
                          <del title="変更前">{segment.originalText}</del>
                          <ins title="変更後">{segment.text}</ins>
                        </span>
                      );
                    }
                    if (segment.kind === 'added') {
                      return <ins className="diffSegment diff-added" key={segment.id} title="追加">{segment.text}</ins>;
                    }
                    return <span key={segment.id}>{segment.text}</span>;
                  })}
                </p>
              )
            ) : (
              <div className="emptyState">
                <p className="emptyTitle">ここに校正結果が表示されます</p>
                <p>
                  原文を入力して <kbd>{isApplePlatform ? '⌘' : 'Ctrl'}</kbd><kbd>↩</kbd>、
                  または他のアプリで文章を選んで <kbd>{formatShortcutCompact(currentSettings.shortcut.proofread)}</kbd>
                </p>
              </div>
            )}
          </div>

          {hasResult && resultView === 'diff' && (
            <div className="diffLegend" aria-hidden="true">
              <span className="legend-added">追加</span>
              <span className="legend-replaced">変更</span>
              <span className="legend-deleted">削除</span>
            </div>
          )}

          <section className={`checkPanel${safeVerification.length ? ' hasIssues' : ''}`}>
            <div className="checkHeader">
              <h3>内容チェック</h3>
              {hasResult && (
                safeVerification.length ? (
                  <span className="checkBadge attention">{safeVerification.length} 件{issueCount ? `（要修正 ${issueCount}）` : ''}</span>
                ) : (
                  <span className="checkBadge clear">問題なし</span>
                )
              )}
            </div>
            {safeVerification.length ? (
              <ul className="checkList">
                {safeVerification.map((issue) => (
                  <li className={`checkItem severity-${issue.severity}`} key={issue.id}>
                    <span className="severityTag">{issue.severity === 'issue' ? '要修正' : '注意'}</span>
                    <div>
                      <strong>{issue.title}</strong>
                      <p>{issue.detail}</p>
                      {issue.sourceQuote ? <blockquote>{issue.sourceQuote}</blockquote> : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="checkEmpty">
                {hasResult ? '明らかな矛盾や事実の誤りは見つかりませんでした。' : '校正と同時に、矛盾や事実の誤りもチェックします。'}
              </p>
            )}
          </section>

          {promptPreview && (
            <details className="promptBox">
              <summary>送信したプロンプト</summary>
              <pre>{promptPreview}</pre>
            </details>
          )}
        </article>
      </section>

      <footer className="statusBar" role="status" aria-live="polite">
        <span className={`statusDot ${statusTone}`} />
        <span className="statusText">{status}</span>
        {statusActionVisible && statusAction.action === 'open-accessibility-settings' && (
          <button className="statusActionButton" onClick={() => void api.openAccessibilitySettings()}>
            システム設定を開く
          </button>
        )}
        <span className="statusSpacer" />
        <span className="statusShortcut">
          <kbd>{formatShortcutCompact(currentSettings.shortcut.proofread)}</kbd> 選択テキストを校正
        </span>
        <span className="statusShortcut">
          <kbd>{formatShortcutCompact(currentSettings.shortcut.reopen)}</kbd> 再表示
        </span>
      </footer>

      <dialog
        ref={shortcutDialogRef}
        className="kDialog"
        onClose={() => {
          setRecordingShortcut(null);
        }}
      >
        <div className="dialogHeader">
          <h2>ショートカットの設定</h2>
          <button className="dialogClose" onClick={closeShortcutDialog}>✕</button>
        </div>
        <div className="dialogBody">
          <div className="shortcutRecorderPanel">
            <ShortcutRecorderCard
              title={shortcutFieldMeta.proofread.title}
              value={currentSettings.shortcut.proofread}
              isRecording={recordingShortcut === 'proofread'}
              onStart={() => startShortcutRecording('proofread')}
              onCancel={cancelShortcutRecording}
              onReset={() => resetShortcut('proofread')}
            />

            <ShortcutRecorderCard
              title={shortcutFieldMeta.reopen.title}
              value={currentSettings.shortcut.reopen}
              isRecording={recordingShortcut === 'reopen'}
              onStart={() => startShortcutRecording('reopen')}
              onCancel={cancelShortcutRecording}
              onReset={() => resetShortcut('reopen')}
            />

            <div className={`shortcutRecorderNotice${shortcutConflict ? ' error' : ''}`}>
              {shortcutMessage || '保存後すぐにグローバルショートカットへ再登録されます。'}
            </div>
          </div>
        </div>
        <div className="dialogFooter">
          <button onClick={resetAllShortcuts}>すべて初期値に戻す</button>
          <div style={{ flex: 1 }} />
          <button onClick={closeShortcutDialog}>閉じる</button>
          <button
            className="accent"
            onClick={() => void saveCurrentSettings(currentSettings)}
            disabled={busy || recordingShortcut !== null || shortcutConflict}
          >
            保存して反映
          </button>
        </div>
      </dialog>

      <dialog ref={historyDialogRef} className="kDialog">
        <div className="dialogHeader">
          <h2>履歴</h2>
          <button className="dialogClose" onClick={closeHistoryDialog}>✕</button>
        </div>
        <div className="dialogBody">
          <div className="historyList">
            {history.length ? history.map((item) => (
              <button className="historyItem" key={item.id} onClick={() => loadHistoryItem(item)}>
                <strong>{item.modelName}</strong>
                <span>{new Date(item.createdAt).toLocaleString()}</span>
                <p>{item.source.slice(0, 96)}</p>
              </button>
            )) : (
              <p className="emptyState">履歴はまだありません。</p>
            )}
          </div>
        </div>
        <div className="dialogFooter">
          <div style={{ flex: 1 }} />
          <button onClick={closeHistoryDialog}>閉じる</button>
        </div>
      </dialog>

      {/* ルールセットダイアログ */}
      <dialog ref={ruleSetDialogRef} className="kDialog kDialog--wide">
        <div className="dialogHeader">
          <h2>ルールセット</h2>
          <button className="dialogClose" onClick={() => ruleSetDialogRef.current?.close()}>✕</button>
        </div>
        <div className="dialogBody dialogBody--flush">
          <div className="twoColumnLayout">
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
                <div className="dialogStatusRow">
                  <p className="ruleSetEditorHint dialogStatusText">
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
            </div>
          </div>
        </div>
        <div className="dialogFooter">
          <p className="dialogFooterNote">保存すると次回の校正から反映されます。</p>
          {ruleSetSaved && <span className="ruleSetSavedNote">保存しました</span>}
          <div style={{ flex: 1 }} />
          {draftRuleSet.id && (
            <button onClick={() => void deleteDraftRuleSet()} disabled={busy || currentSettings.ruleSets.length === 1}>
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
      </dialog>

      {/* モデル設定ダイアログ */}
      <dialog ref={modelDialogRef} className="kDialog kDialog--wide">
        <div className="dialogHeader">
          <h2>モデル設定</h2>
          <button className="dialogClose" onClick={() => modelDialogRef.current?.close()}>✕</button>
        </div>
        <div className="dialogBody dialogBody--flush">
          <div className="twoColumnLayout">
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
              <div className="dialogStatusRow">
                <p className="ruleSetEditorHint dialogStatusText">
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
                  <div className="dialogCard dialogCard--muted">
                    <div className="modelInfoGrid">
                      <span className="modelInfoLabel">Provider</span>
                      <span>{
                        draftModel.provider === 'openai-compatible' ? 'OpenAI compatible'
                          : draftModel.provider === 'anthropic' ? 'Anthropic'
                            : draftModel.provider === 'xai' ? 'xAI'
                              : 'Ollama'
                      }</span>
                      <span className="modelInfoLabel">Model ID</span>
                      <span>{draftModel.model}</span>
                      <span className="modelInfoLabel">Endpoint</span>
                      <span className="modelInfoEndpoint">{draftModel.endpoint}</span>
                    </div>
                    <p className="ruleSetEditorHint">組み込みモデルは変更できません。「複製」で独自設定を追加できます。</p>
                  </div>
                </>
              ) : (
                /* ユーザー追加モデル：編集フォーム */
                <div className="dialogCard">
                  <div className="fieldGrid modelFieldGrid">
                    <label className="field full">
                      <span>表示名</span>
                      <input value={draftModel.name} onChange={(e) => setDraftModel({ ...draftModel, name: e.target.value })} placeholder="例: GPT-4o カスタム" />
                    </label>
                    <label className="field">
                      <span>Provider</span>
                      <select value={draftModel.provider} onChange={(e) => setDraftModel({ ...draftModel, provider: e.target.value as ModelProfile['provider'] })}>
                        <option value="openai-compatible">OpenAI compatible</option>
                        <option value="anthropic">Anthropic</option>
                        <option value="xai">xAI</option>
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
                </div>
              )}

              {!draftModel.builtin && draftModel.provider !== 'ollama' && (
                <p className="ruleSetEditorHint" style={{ marginTop: 0 }}>
                  API キーは「API キー設定」で一括管理できます。
                </p>
              )}
            </div>

          </div>
          </div>
        </div>
        <div className="dialogFooter">
          <p className="dialogFooterNote">組み込みモデルは複製してから編集します。</p>
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
      </dialog>

      {/* API キー設定ダイアログ */}
      <dialog
        ref={apiKeyDialogRef}
        className="kDialog kDialog--narrow"
        onClose={() => void commitProviderApiKeys()}
      >
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
              <span className="apiKeyProviderDesc">GPT-6 シリーズなど</span>
            </div>
            <label className="field">
              <span>API キー</span>
              <input
                type="password"
                placeholder="sk-..."
                value={draftProviderApiKeys['openai-compatible'] ?? ''}
                onChange={(e) => updateDraftProviderApiKey('openai-compatible', e.target.value)}
                onBlur={() => void commitProviderApiKeys()}
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
                value={draftProviderApiKeys['anthropic'] ?? ''}
                onChange={(e) => updateDraftProviderApiKey('anthropic', e.target.value)}
                onBlur={() => void commitProviderApiKeys()}
              />
            </label>
          </div>

          <div className="apiKeyProviderGroup">
            <div className="apiKeyProviderHeader">
              <span className="apiKeyProviderName">xAI</span>
              <span className="apiKeyProviderDesc">Grok シリーズ</span>
            </div>
            <label className="field">
              <span>API キー</span>
              <input
                type="password"
                placeholder="xai-..."
                value={draftProviderApiKeys.xai ?? ''}
                onChange={(e) => updateDraftProviderApiKey('xai', e.target.value)}
                onBlur={() => void commitProviderApiKeys()}
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
          <p className="ruleSetEditorHint" style={{ margin: 0 }}>入力欄を離れるか、閉じると保存されます。</p>
          <div style={{ flex: 1 }} />
          <button onClick={() => apiKeyDialogRef.current?.close()}>閉じる</button>
        </div>
      </dialog>
    </main>
  );
}
