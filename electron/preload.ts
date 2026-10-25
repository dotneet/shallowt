import { contextBridge, ipcRenderer } from 'electron';
import type { AppSettings, ProofreadHistoryItem, ProofreadResponse, StatusPayload } from './types';

type CompletedPayload = ProofreadResponse & {
  source: string;
  history: ProofreadHistoryItem[];
};

contextBridge.exposeInMainWorld('shallowTWrite', {
  getSettings: () => ipcRenderer.invoke('settings:get') as Promise<AppSettings>,
  saveSettings: (settings: AppSettings) => ipcRenderer.invoke('settings:save', settings) as Promise<AppSettings>,
  listHistory: () => ipcRenderer.invoke('history:list') as Promise<ProofreadHistoryItem[]>,
  runProofread: (source: string) =>
    ipcRenderer.invoke('proofread:run', source) as Promise<ProofreadResponse & { history: ProofreadHistoryItem[] }>,
  proofreadSelection: () => ipcRenderer.invoke('selection:proofread') as Promise<void>,
  openAccessibilitySettings: () => ipcRenderer.invoke('accessibility:open-settings') as Promise<void>,
  pasteResult: (text: string) => ipcRenderer.invoke('selection:paste-result', text) as Promise<void>,
  suspendShortcuts: () => ipcRenderer.invoke('shortcuts:suspend') as Promise<void>,
  resumeShortcuts: () => ipcRenderer.invoke('shortcuts:resume') as Promise<void>,
  onCaptured: (listener: (payload: { source: string }) => void) => {
    const handler = (_event: unknown, payload: { source: string }) => listener(payload);
    ipcRenderer.on('proofread:captured', handler);
    return () => ipcRenderer.removeListener('proofread:captured', handler);
  },
  onCompleted: (listener: (payload: CompletedPayload) => void) => {
    const handler = (_event: unknown, payload: CompletedPayload) => listener(payload);
    ipcRenderer.on('proofread:completed', handler);
    return () => ipcRenderer.removeListener('proofread:completed', handler);
  },
  onStatus: (listener: (payload: StatusPayload) => void) => {
    const handler = (_event: unknown, payload: StatusPayload) => listener(payload);
    ipcRenderer.on('proofread:status', handler);
    return () => ipcRenderer.removeListener('proofread:status', handler);
  }
});
