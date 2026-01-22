/**
 * SettingsManager - アプリ設定の一元管理ユーティリティ
 * 設定値をキャッシュし、各コンポーネントで簡単に利用できるようにします
 */

import { invoke } from '@tauri-apps/api/core';

// 設定の型定義
export type AppSettings = {
    basePath: string;
    language: 'ja' | 'en';
    autoStart: boolean;
    fontSize: number;
    soundEnabled: boolean;
};

// デフォルト値
const DEFAULT_SETTINGS: AppSettings = {
    basePath: '',
    language: 'ja',
    autoStart: false,
    fontSize: 16,
    soundEnabled: true,
};

// キャッシュ
let settingsCache: AppSettings | null = null;
let lastCacheTime = 0;
const CACHE_DURATION = 5000; // 5秒間キャッシュ

// ブラウザ環境かどうか
const isBrowser = typeof window !== 'undefined' && !('__TAURI__' in window);

/**
 * 設定を取得（キャッシュ付き）
 */
export async function getSettings(): Promise<AppSettings> {
    const now = Date.now();

    // キャッシュが有効な場合
    if (settingsCache !== null && (now - lastCacheTime) < CACHE_DURATION) {
        return settingsCache;
    }

    try {
        if (isBrowser) {
            // ブラウザ環境（開発用）
            const saved = localStorage.getItem('ore-no-fusen-settings');
            if (saved) {
                settingsCache = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
            } else {
                settingsCache = DEFAULT_SETTINGS;
            }
        } else {
            // Tauri環境
            const loaded = await invoke<AppSettings>('get_settings');
            settingsCache = { ...DEFAULT_SETTINGS, ...loaded };
        }

        lastCacheTime = now;
        return settingsCache ?? DEFAULT_SETTINGS;
    } catch (e) {
        console.error('[SettingsManager] Failed to get settings:', e);
        return DEFAULT_SETTINGS;
    }
}

/**
 * 特定の設定値を取得
 */
export async function getSetting<K extends keyof AppSettings>(key: K): Promise<AppSettings[K]> {
    const settings = await getSettings();
    return settings[key];
}

/**
 * fontSizeを取得
 */
export async function getFontSize(): Promise<number> {
    return getSetting('fontSize');
}

/**
 * soundEnabledを取得
 */
export async function isSoundEnabled(): Promise<boolean> {
    return getSetting('soundEnabled');
}

/**
 * キャッシュをクリア（設定変更時に呼び出す）
 */
export function clearSettingsCache(): void {
    settingsCache = null;
    lastCacheTime = 0;
}
