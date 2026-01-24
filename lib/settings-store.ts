import { useState, useEffect } from "react"
// Tauri v2 用のインポート（v1の場合は @tauri-apps/api/tauri）
import { invoke } from "@tauri-apps/api/core"

// --- 1. 定義書（データの型） ---
export type AppSettings = {
    // Rustの snake_case に合わせて修正！
    base_path: string
    language: "ja" | "en"
    auto_start: boolean
    font_size: number
    sound_enabled: boolean
}

// デフォルト値
const DEFAULT_SETTINGS: AppSettings = {
    base_path: "",
    language: "ja",
    auto_start: false,
    font_size: 16,
    sound_enabled: true,
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
                        font_size: parsed.font_size ?? parsed.fontSize ?? DEFAULT_SETTINGS.font_size,
                        sound_enabled: parsed.sound_enabled ?? parsed.soundEnabled ?? DEFAULT_SETTINGS.sound_enabled,
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
                    font_size: loaded.font_size,
                    sound_enabled: loaded.sound_enabled,
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