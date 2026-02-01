/**
 * SettingsManager - アプリ設定の一元管理ユーティリティ
 * 設定値をキャッシュし、各コンポーネントで簡単に利用できるようにします
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// 設定の型定義
export type AppSettings = {
    base_path: string;
    language: 'ja' | 'en';
    auto_start: boolean;
    font_size: number;
    sound_enabled: boolean;
};

// デフォルト値
const DEFAULT_SETTINGS: AppSettings = {
    base_path: '',
    language: 'ja',
    auto_start: false,
    font_size: 16,
    sound_enabled: true,
};

// キャッシュ
let settingsCache: AppSettings | null = null;
let lastCacheTime = 0;
const CACHE_DURATION = 5000; // 5秒間キャッシュ（イベントで更新されるので長くても本来OK）
let isListenerSetup = false;

// 環境判定 (Tauri v2対応)
const isTauri = typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
const isBrowser = !isTauri;

/**
 * リスナーのセットアップ（初回呼び出し時に実行）
 */
async function setupSettingsListener() {
    if (isListenerSetup || isBrowser) return;

    try {
        await listen<AppSettings>('settings_updated', (event) => {
            console.log('[SettingsManager] Received settings update:', event.payload);
            settingsCache = event.payload;
            lastCacheTime = Date.now();
        });
        isListenerSetup = true;
        console.log('[SettingsManager] Listener setup complete');
    } catch (e) {
        console.error('[SettingsManager] Failed to setup listener:', e);
    }
}

/**
 * 設定を取得（キャッシュ付き）
 */
export async function getSettings(): Promise<AppSettings> {
    const now = Date.now();

    // リスナーの遅延初期化
    if (!isListenerSetup && !isBrowser) {
        setupSettingsListener();
    }

    // キャッシュが有効な場合
    if (settingsCache !== null && (now - lastCacheTime) < CACHE_DURATION) {
        return settingsCache;
    }

    try {
        if (isBrowser) {
            // ブラウザ環境（開発用）
            const saved = localStorage.getItem('ore-no-fusen-settings');
            if (saved) {
                const parsed = JSON.parse(saved);
                settingsCache = {
                    ...DEFAULT_SETTINGS,
                    base_path: parsed.base_path ?? parsed.basePath ?? DEFAULT_SETTINGS.base_path,
                    language: parsed.language ?? DEFAULT_SETTINGS.language,
                    auto_start: parsed.auto_start ?? parsed.autoStart ?? DEFAULT_SETTINGS.auto_start,
                    font_size: parsed.font_size ?? parsed.fontSize ?? DEFAULT_SETTINGS.font_size,
                    sound_enabled: parsed.sound_enabled ?? parsed.soundEnabled ?? DEFAULT_SETTINGS.sound_enabled,
                };
            } else {
                settingsCache = DEFAULT_SETTINGS;
            }
        } else {
            // Tauri環境
            const loaded = await invoke<any>('get_settings');
            // Rust側もエイリアス付きで定義されているが、返却はsnake_case
            const normalized = {
                base_path: loaded.base_path,
                language: loaded.language,
                auto_start: loaded.auto_start,
                font_size: loaded.font_size,
                sound_enabled: loaded.sound_enabled,
            }
            settingsCache = { ...DEFAULT_SETTINGS, ...normalized };
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
    return getSetting('font_size');
}

/**
 * soundEnabledを取得
 */
export async function isSoundEnabled(): Promise<boolean> {
    return getSetting('sound_enabled');
}

