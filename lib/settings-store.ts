import { useState, useEffect } from "react"

// --- 1. 定義書（データの型） ---
// 既存の json と UI の項目を全部あわせた「完全な姿」を定義します
export type AppSettings = {
    // 既存の settings.json にある項目
    base_path: string

    // UIで新しく追加したい項目（JSONにはまだない）
    language: "ja" | "en"
    autoStart: boolean
    fontSize: number
    soundEnabled: boolean
}

// デフォルト値（初回起動時や、JSONに項目がない場合に使われます）
const DEFAULT_SETTINGS: AppSettings = {
    base_path: "C:\\Users\\uck\\Documents\\OreNoFusen", // 初期値
    language: "ja",
    autoStart: false,
    fontSize: 16,
    soundEnabled: true,
}

// --- 2. 倉庫番（保存ロジック） ---

// ブラウザ環境かどうかを判定（テスト用）
const isBrowser = typeof window !== "undefined" && !("__TAURI__" in window)

export function useSettings() {
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
    const [loading, setLoading] = useState(true)

    // 起動時にロードする
    useEffect(() => {
        loadSettings()
    }, [])

    // 読み込み処理
    const loadSettings = async () => {
        try {
            if (isBrowser) {
                // 【テスト環境】ブラウザの保存領域から読む
                const saved = localStorage.getItem("ore-no-fusen-settings")
                if (saved) {
                    // 保存データがあれば、デフォルト値の上に上書きしてマージする
                    setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) })
                }
            } else {
                // 【本番環境】ここで settings.json を読み込む（後で実装）
                console.log("Tauri環境: settings.json を読み込み予定")

                // ※今は仮にデフォルトをセットしておきます
                // 将来ここに invoke('get_settings') などを書きます
            }
        } catch (e) {
            console.error("設定の読み込みに失敗:", e)
        } finally {
            setLoading(false)
        }
    }

    // 保存処理
    const saveSettings = async (newSettings: AppSettings) => {
        // 画面の見た目を即座に更新（サクサク感のため）
        setSettings(newSettings)

        try {
            if (isBrowser) {
                // 【テスト環境】ブラウザに保存
                localStorage.setItem("ore-no-fusen-settings", JSON.stringify(newSettings))
                console.log("ブラウザに保存しました:", newSettings)
            } else {
                // 【本番環境】ここで settings.json に書き込む（後で実装）
                console.log("Tauri環境: settings.json に保存予定:", newSettings)

                // 将来ここに invoke('save_settings', { settings: newSettings }) などを書きます
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