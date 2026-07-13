/**
 * 設定管理ユーティリティ (SettingsManager)
 *
 * 責務:
 * - アプリケーション設定のキャッシュ管理
 * - 設定変更イベントのリスニングと自動更新
 * - 環境（Browser/Tauri）に応じた設定読み込み
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { type AppSettings } from '@/lib/settings-store';


// デフォルト値
const DEFAULT_SETTINGS: AppSettings = {
    base_path: '',
    language: 'ja',
    auto_start: true,
    font_size: 12,
    sound_enabled: true,
    iphone_send_enabled: false,
    shortcut_new_note: 'ctrl+n',
    new_note_trigger: 'shortcut',
    shortcut_toggle_visibility: 'ctrl+shift+h',
    shortcut_arrange: 'ctrl+shift+l',
    shortcut_quick_launcher: 'ctrl+p',
    shortcut_bold: 'ctrl+b', shortcut_heading: 'ctrl+h', shortcut_bullet_list: 'ctrl+l', shortcut_checkbox: 'ctrl+shift+c',
    quick_launcher_triple_right_click: false,
    monthly_backup_enabled: true,
    backup_include_trash: false,
    monthly_backup_interval_days: 30,
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
async function getSettings(): Promise<AppSettings> {
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
                    iphone_send_enabled: parsed.iphone_send_enabled ?? parsed.iphoneSendEnabled ?? DEFAULT_SETTINGS.iphone_send_enabled,
                    shortcut_new_note: parsed.shortcut_new_note ?? DEFAULT_SETTINGS.shortcut_new_note,
                    new_note_trigger: parsed.new_note_trigger ?? DEFAULT_SETTINGS.new_note_trigger,
                    shortcut_toggle_visibility: parsed.shortcut_toggle_visibility ?? DEFAULT_SETTINGS.shortcut_toggle_visibility,
                    shortcut_arrange: parsed.shortcut_arrange ?? DEFAULT_SETTINGS.shortcut_arrange,
                    shortcut_quick_launcher: parsed.shortcut_quick_launcher ?? DEFAULT_SETTINGS.shortcut_quick_launcher,
                    shortcut_bold: parsed.shortcut_bold ?? DEFAULT_SETTINGS.shortcut_bold,
                    shortcut_heading: parsed.shortcut_heading ?? DEFAULT_SETTINGS.shortcut_heading,
                    shortcut_bullet_list: parsed.shortcut_bullet_list ?? DEFAULT_SETTINGS.shortcut_bullet_list,
                    shortcut_checkbox: parsed.shortcut_checkbox ?? DEFAULT_SETTINGS.shortcut_checkbox,
                    quick_launcher_triple_right_click: parsed.quick_launcher_triple_right_click ?? DEFAULT_SETTINGS.quick_launcher_triple_right_click,
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
                iphone_send_enabled: loaded.iphone_send_enabled,
                shortcut_new_note: loaded.shortcut_new_note,
                new_note_trigger: loaded.new_note_trigger,
                shortcut_toggle_visibility: loaded.shortcut_toggle_visibility,
                shortcut_arrange: loaded.shortcut_arrange,
                shortcut_quick_launcher: loaded.shortcut_quick_launcher,
                shortcut_bold: loaded.shortcut_bold, shortcut_heading: loaded.shortcut_heading,
                shortcut_bullet_list: loaded.shortcut_bullet_list, shortcut_checkbox: loaded.shortcut_checkbox,
                quick_launcher_triple_right_click: loaded.quick_launcher_triple_right_click,
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
 * soundEnabledを取得
 */
export async function isSoundEnabled(): Promise<boolean> {
    const settings = await getSettings();
    return settings.sound_enabled;
}
