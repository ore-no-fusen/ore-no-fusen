import { useState, useEffect } from "react"
// Tauri v2 用のインポート（v1の場合は @tauri-apps/api/tauri）
import { invoke } from "@tauri-apps/api/core"

// --- 1. 定義書（データの型） ---
export type AppSettings = {
    // Rustの camelCase に合わせて修正！
    basePath: string
    language: "ja" | "en"
    autoStart: boolean
    fontSize: number
    soundEnabled: boolean
}

// デフォルト値
const DEFAULT_SETTINGS: AppSettings = {
    basePath: "",
    language: "ja",
    autoStart: false,
    fontSize: 16,
    soundEnabled: true,
}

// --- 2. 倉庫番（保存ロジック） ---

// ブラウザ環境かどうかを判定
const isBrowser = typeof window !== "undefined" && !("__TAURI__" in window)

export function useSettings() {
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
    const [loading, setLoading] = useState(true)

    // 起動時にロード
    useEffect(() => {
        loadSettings()
    }, [])

    const loadSettings = async () => {
        try {
            if (isBrowser) {
                // 【A. テスト環境】ブラウザの保存領域から読む
                const saved = localStorage.getItem("ore-no-fusen-settings")
                if (saved) {
                    setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) })
                }
            } else {
                // 【B. 本番環境】Rustから読み込む
                // 戻り値の型 AppSettings に合わせて自動変換されます
                const loaded = await invoke<AppSettings>("get_settings")
                console.log("Rustから設定ロード:", loaded)
                setSettings({ ...DEFAULT_SETTINGS, ...loaded })
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