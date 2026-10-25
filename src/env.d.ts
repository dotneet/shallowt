import type { AppSettings, ProofreadHistoryItem, ProofreadResponse, StatusPayload } from '../electron/types';

declare global {
  interface Window {
    shallowTWrite: {
      getSettings: () => Promise<AppSettings>;
      saveSettings: (settings: AppSettings) => Promise<AppSettings>;
      listHistory: () => Promise<ProofreadHistoryItem[]>;
      runProofread: (source: string) => Promise<ProofreadResponse & { history: ProofreadHistoryItem[] }>;
      proofreadSelection: () => Promise<void>;
      openAccessibilitySettings: () => Promise<void>;
      pasteResult: (text: string) => Promise<void>;
      suspendShortcuts: () => Promise<void>;
      resumeShortcuts: () => Promise<void>;
      onCaptured: (listener: (payload: { source: string }) => void) => () => void;
      onCompleted: (
        listener: (payload: ProofreadResponse & { source: string; history: ProofreadHistoryItem[] }) => void
      ) => () => void;
      onStatus: (listener: (payload: StatusPayload) => void) => () => void;
    };
  }
}

export {};
