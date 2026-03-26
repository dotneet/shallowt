import type { AppSettings, ProofreadHistoryItem } from './types';
export declare function getSettings(): Promise<AppSettings>;
export declare function saveSettings(settings: AppSettings): Promise<AppSettings>;
export declare function getHistory(): Promise<ProofreadHistoryItem[]>;
export declare function pushHistory(item: ProofreadHistoryItem): Promise<ProofreadHistoryItem[]>;
