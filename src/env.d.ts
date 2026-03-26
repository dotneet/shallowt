import type { AppSettings, ProofreadHistoryItem, ProofreadResponse } from '../electron/types';

declare global {
  interface Window {
    kousei: {
      getSettings: () => Promise<AppSettings>;
      saveSettings: (settings: AppSettings) => Promise<AppSettings>;
      listHistory: () => Promise<ProofreadHistoryItem[]>;
      runProofread: (source: string, settings: AppSettings) => Promise<ProofreadResponse & { history: ProofreadHistoryItem[] }>;
      proofreadSelection: () => Promise<void>;
      pasteResult: (text: string) => Promise<void>;
      onCaptured: (listener: (payload: { source: string }) => void) => () => void;
      onCompleted: (
        listener: (payload: ProofreadResponse & { source: string; history: ProofreadHistoryItem[] }) => void
      ) => () => void;
      onStatus: (listener: (payload: { kind: 'error'; message: string }) => void) => () => void;
    };
  }
}

export {};
