/**
 * アプリケーション設定ストア (Global State)
 *
 * 責務:
 * - アプリ全体の共通設定（パス、言語、起動設定など）の管理
 * - Reactコンポーネントへの設定値の提供
 * - Rustバックエンドとの設定同期（読み込み・保存）
 */

import { useState, useEffect } from "react"
// Tauri v2 用のインポート（v1の場合は @tauri-apps/api/tauri）
import { invoke } from "@tauri-apps/api/core"

// --- 1. 定義書（データの型） ---
export type AppSettings = {
    // Rustの snake_case に合わせて修正！
    base_path: string
    language: "ja" | "en"
    auto_start: boolean
    desktop_shortcut_prompted: boolean
    analytics_consent?: "granted" | "denied"
    font_size: number
    sound_enabled: boolean
    iphone_send_enabled: boolean
    shortcut_new_note?: string
    new_note_trigger?: "shortcut" | "double_ctrl" | "double_shift"
    shortcut_toggle_visibility?: string
    shortcut_arrange?: string
    shortcut_quick_launcher?: string
    shortcut_bold?: string
    shortcut_heading?: string
    shortcut_bullet_list?: string
    shortcut_checkbox?: string
    quick_launcher_triple_right_click?: boolean
    /**
     * この PC を一意に識別する UUID。Rust 側が自動生成し settings.json に保存する。
     * ユーザーには見せない内部フィールド。フロントは設定 UI には出さず、保存時に Rust に往復させて消えないようにする。
     */
    pc_id?: string
    backup_history?: Array<{ path: string; created_at: string; file_count: number }>
    monthly_backup_enabled: boolean
    monthly_backup_next_prompt?: string
    monthly_backup_skip_count?: number
    monthly_backup_record?: { path: string; created_at: string; file_count: number }
    monthly_backup_interval_days: number
    backup_include_trash: boolean
}

// デフォルト値（Rust側 state.rs の default_auto_start() と統一）
const DEFAULT_SETTINGS: AppSettings = {
    base_path: "",
    language: "ja",
    auto_start: true,
    desktop_shortcut_prompted: false,
    font_size: 16,
    sound_enabled: true,
    iphone_send_enabled: false,
    shortcut_new_note: "ctrl+n",
    new_note_trigger: "shortcut",
    shortcut_toggle_visibility: "ctrl+shift+h",
    shortcut_arrange: "ctrl+shift+l",
    shortcut_quick_launcher: "ctrl+p",
    shortcut_bold: "ctrl+b",
    shortcut_heading: "ctrl+h",
    shortcut_bullet_list: "ctrl+l",
    shortcut_checkbox: "ctrl+shift+c",
    quick_launcher_triple_right_click: false,
    backup_history: [],
    monthly_backup_enabled: true,
    monthly_backup_skip_count: 0,
    backup_include_trash: false,
    monthly_backup_interval_days: 30,
}


// --- 2. 倉庫番（保存ロジック） ---

// ブラウザ環境かどうかを判定
// ブラウザ環境かどうかを判定
// Tauri v2では __TAURI__ がない場合があるため __TAURI_INTERNALS__ もチェック
const isTauri = typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
const isBrowser = !isTauri;
console.log("[STORE] Environment detection - isTauri:", isTauri, "isBrowser:", isBrowser);

export function useSettings() {
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
    const [loading, setLoading] = useState(true)

    // 起動時にロード
    useEffect(() => {
        loadSettings()

        // 【NEW】他のウィンドウでの設定変更を検知して同期する
        let unlisten: (() => void) | undefined;
        if (!isBrowser) {
            import("@tauri-apps/api/event").then(async ({ listen }) => {
                unlisten = await listen<AppSettings>("settings_updated", (event) => {
                    console.log("[STORE] Settings updated from backend:", event.payload);
                    setSettings(event.payload);
                });
            });
        }
        return () => { if (unlisten) unlisten(); };
    }, [])

    const loadSettings = async () => {
        try {
            if (isBrowser) {
                // 【A. テスト環境】ブラウザの保存領域から読む
                const saved = localStorage.getItem("ore-no-fusen-settings")
                if (saved) {
                    const parsed = JSON.parse(saved)
                    // Migration: camelCase -> snake_case if needed
                    const migrated = {
                        base_path: parsed.base_path ?? parsed.basePath ?? DEFAULT_SETTINGS.base_path,
                        language: parsed.language ?? DEFAULT_SETTINGS.language,
                        auto_start: parsed.auto_start ?? parsed.autoStart ?? DEFAULT_SETTINGS.auto_start,
                        desktop_shortcut_prompted: parsed.desktop_shortcut_prompted ?? false,
                        analytics_consent: parsed.analytics_consent,
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
                        backup_history: parsed.backup_history ?? DEFAULT_SETTINGS.backup_history,
                        monthly_backup_enabled: parsed.monthly_backup_enabled ?? true,
                        monthly_backup_next_prompt: parsed.monthly_backup_next_prompt,
                        monthly_backup_skip_count: parsed.monthly_backup_skip_count ?? 0,
                        monthly_backup_record: parsed.monthly_backup_record,
                        backup_include_trash: parsed.backup_include_trash ?? false,
                        monthly_backup_interval_days: parsed.monthly_backup_interval_days ?? 30,
                    }
                    setSettings(migrated)
                }
            } else {
                // 【B. 本番環境】Rustから読み込む
                // 戻り値の型 AppSettings に合わせて自動変換されます
                const loaded = await invoke<any>("get_settings")
                console.log("Rustから設定ロード:", loaded)
                // Rust側もエイリアス付きで定義されているが、返却はsnake_caseのはず
                const normalized = {
                    base_path: loaded.base_path,
                    language: loaded.language,
                    auto_start: loaded.auto_start,
                    desktop_shortcut_prompted: loaded.desktop_shortcut_prompted ?? false,
                    analytics_consent: loaded.analytics_consent,
                    font_size: loaded.font_size,
                    sound_enabled: loaded.sound_enabled,
                    iphone_send_enabled: loaded.iphone_send_enabled,
                    shortcut_new_note: loaded.shortcut_new_note,
                    new_note_trigger: loaded.new_note_trigger,
                    shortcut_toggle_visibility: loaded.shortcut_toggle_visibility,
                    shortcut_arrange: loaded.shortcut_arrange,
                    shortcut_quick_launcher: loaded.shortcut_quick_launcher,
                    shortcut_bold: loaded.shortcut_bold,
                    shortcut_heading: loaded.shortcut_heading,
                    shortcut_bullet_list: loaded.shortcut_bullet_list,
                    shortcut_checkbox: loaded.shortcut_checkbox,
                    quick_launcher_triple_right_click: loaded.quick_launcher_triple_right_click,
                    pc_id: loaded.pc_id,
                    backup_history: loaded.backup_history ?? [],
                    monthly_backup_enabled: loaded.monthly_backup_enabled ?? true,
                    monthly_backup_next_prompt: loaded.monthly_backup_next_prompt,
                    monthly_backup_skip_count: loaded.monthly_backup_skip_count ?? 0,
                    monthly_backup_record: loaded.monthly_backup_record,
                    backup_include_trash: loaded.backup_include_trash ?? false,
                    monthly_backup_interval_days: loaded.monthly_backup_interval_days ?? 30,
                }
                setSettings({ ...DEFAULT_SETTINGS, ...normalized })
            }
        } catch (e) {
            console.error("設定の読み込みに失敗:", e)
        } finally {
            setLoading(false)
        }
    }

    const saveSettings = async (newSettings: AppSettings) => {
        // 画面を即座に更新
        setSettings(newSettings)

        try {
            if (isBrowser) {
                // 【A. テスト環境】
                localStorage.setItem("ore-no-fusen-settings", JSON.stringify(newSettings))
            } else {
                // 【B. 本番環境】Rustに保存
                // Rust側の引数名は自動で解決されます
                await invoke("save_settings", { settings: newSettings })
                console.log("Rustに設定セーブ完了")
            }
        } catch (e) {
            console.error("設定の保存に失敗:", e)
        }
    }

    return {
        settings,
        saveSettings,
        loading,
    }
}
