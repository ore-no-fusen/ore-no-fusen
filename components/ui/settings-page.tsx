"use client"

import React, { useState, useMemo } from "react"
import { Monitor, Moon, Sun, Laptop, Save, FolderOpen, Info, Settings, Database, Type, Volume2, Globe, Reply } from "lucide-react"

// ★さっき作った「倉庫番」をインポート
import { useSettings, type AppSettings } from "@/lib/settings-store"
// ★翻訳関数をインポート
import { getTranslation, type TranslationKey, type Language } from "@/lib/i18n"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"

// [NEW] Props定義
type SettingsPageProps = {
    onClose?: () => void;
}

export default function SettingsPage({ onClose }: SettingsPageProps) {
    const [activeSection, setActiveSection] = useState("general")

    // ★ここで「倉庫番」を呼び出し！
    // loading: 読み込み中かどうか
    // settings: 現在の設定データ
    // saveSettings: 保存するための関数
    const { settings, saveSettings, loading } = useSettings()

    // ★翻訳関数を設定の言語から作成
    const t = useMemo(() => getTranslation((settings.language as Language) || 'ja'), [settings.language])

    // インポート機能用State
    const [importSourcePath, setImportSourcePath] = useState("")
    const [isImporting, setIsImporting] = useState(false)

    // 読み込み中は「読み込み中...」と出す（チラつき防止）
    if (loading) {
        return <div className="flex h-screen items-center justify-center bg-white">{t('common.loading')}</div>
    }

    // 設定を変更する共通の関数
    // key: 変えたい項目の名前（例: "autoStart"）
    // value: 新しい値
    const updateSetting = (key: keyof AppSettings, value: any) => {
        const newSettings = { ...settings, [key]: value }
        saveSettings(newSettings)
    }

    // コンテンツの切り替えロジック（データをプロップスとして渡す）
    const renderContent = () => {
        switch (activeSection) {
            case "general":
                return <GeneralSection settings={settings} onUpdate={updateSetting} t={t} />
            case "appearance":
                return <AppearanceSection settings={settings} onUpdate={updateSetting} t={t} />
            case "data":
                return <DataSection
                    settings={settings}
                    onUpdate={updateSetting}
                    t={t}
                    importSourcePath={importSourcePath}
                    setImportSourcePath={setImportSourcePath}
                    isImporting={isImporting}
                    setIsImporting={setIsImporting}
                />
            case "about":
                return <AboutSection t={t} />
            default:
                return <GeneralSection settings={settings} onUpdate={updateSetting} t={t} />
        }
    }

    return (
        <div className="flex h-screen w-full overflow-hidden bg-white text-foreground">
            {/* サイドバー */}
            <aside className="w-64 border-r bg-gray-50/50 p-6">
                <div className="mb-6 flex items-center gap-2 px-2 py-4">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                        <Settings className="h-5 w-5" />
                    </div>
                    <span className="text-xl font-black tracking-tighter">{t('settings.title')}</span>
                </div>
                <nav className="space-y-1">
                    <SidebarItem
                        icon={<Settings className="mr-3 h-4 w-4" />}
                        label={t('settings.general')}
                        isActive={activeSection === "general"}
                        onClick={() => setActiveSection("general")}
                    />
                    <SidebarItem
                        icon={<Monitor className="mr-3 h-4 w-4" />}
                        label={t('settings.appearance')}
                        isActive={activeSection === "appearance"}
                        onClick={() => setActiveSection("appearance")}
                    />
                    <SidebarItem
                        icon={<Database className="mr-3 h-4 w-4" />}
                        label={t('settings.data')}
                        isActive={activeSection === "data"}
                        onClick={() => setActiveSection("data")}
                    />
                    <SidebarItem
                        icon={<Info className="mr-3 h-4 w-4" />}
                        label={t('settings.about')}
                        isActive={activeSection === "about"}
                        onClick={() => setActiveSection("about")}
                    />
                </nav>
            </aside>

            {/* メインコンテンツエリア */}
            <main className="flex flex-1 flex-col overflow-hidden bg-white">
                <div className="flex-1 overflow-y-auto p-10 pt-12">
                    {renderContent()}
                </div>

                {/* フッター - 設定完了ボタン */}
                <div className="border-t bg-gray-50/30 px-10 py-6 flex justify-end gap-3">
                    <Button
                        variant="default"
                        size="lg"
                        className="min-w-[140px]"
                        onClick={async () => {
                            try {
                                // 設定を保存
                                await saveSettings(settings)

                                const { invoke } = await import("@tauri-apps/api/core")
                                const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow")

                                // setup_first_launch を呼び出してベースパスを設定
                                // ※ カスタムパスがある場合でも、ディレクトリ作成等のために必ず呼び出す必要がある
                                let basePath = settings.base_path
                                if (!basePath || basePath.trim() === "") {
                                    // デフォルトパスを使用してセットアップ
                                    basePath = await invoke<string>("setup_first_launch", {
                                        useDefault: true,
                                        customPath: null,
                                        importPath: null
                                    })
                                } else {
                                    // カスタムパスを使用してセットアップ
                                    basePath = await invoke<string>("setup_first_launch", {
                                        useDefault: false,
                                        customPath: basePath,
                                        importPath: isImporting ? importSourcePath : null
                                    })
                                }

                                // [Check] 既存のノートがあるか確認
                                const existingNotes = await invoke<any[]>("fusen_list_notes", { folderPath: basePath });

                                if (existingNotes.length === 0) {
                                    // ノートがない場合のみ、初期ノートを作成
                                    const newNote = await invoke<{
                                        meta: { path: string; x?: number; y?: number; width?: number; height?: number }
                                        frontmatter: string
                                    }>("fusen_create_note", {
                                        folderPath: basePath,
                                        context: "はじめての付箋（消してOK）"
                                    })

                                    // 初期内容を設定
                                    const initialContent = `はじめの付箋(消してOK)

すぐ書ける
**強調できる**
そこに残る！`

                                    await invoke("fusen_save_note", {
                                        path: newNote.meta.path,
                                        body: initialContent,
                                        frontmatterRaw: newNote.frontmatter || "",
                                        allowRename: false
                                    })

                                    // 付箋ウィンドウを開く
                                    const notePath = newNote.meta.path
                                    const safePath = notePath.replace(/\\/g, "/")
                                    const pathParam = encodeURIComponent(safePath)
                                    const url = `/?path=${pathParam}`

                                    // ウィンドウラベルを生成
                                    const normalizedPath = safePath.toLowerCase().replace(/\/+/g, "/").replace(/\/$/, "")
                                    let hash = 0
                                    for (let i = 0; i < normalizedPath.length; i++) {
                                        const char = normalizedPath.charCodeAt(i)
                                        hash = ((hash << 5) - hash) + char
                                        hash = hash & hash
                                    }
                                    const label = `note-${Math.abs(hash).toString(36)}`

                                    // 付箋ウィンドウを作成
                                    new WebviewWindow(label, {
                                        url,
                                        transparent: true,
                                        decorations: false,
                                        alwaysOnTop: false,
                                        visible: true,
                                        width: 400,
                                        height: 300,
                                        x: 100,
                                        y: 100,
                                        skipTaskbar: false,
                                        focus: true,
                                    })
                                }

                                // [Reload] 設定適用を確実にするため、アプリ全体をリロードしない
                                // window.location.reload();
                                onClose?.();

                            } catch (e) {
                                console.error("設定の保存に失敗:", e)
                                alert("設定の保存に失敗しました: " + String(e))
                            }
                        }}
                    >
                        <Save className="mr-2 h-4 w-4" />
                        {t('settings.save')}
                    </Button>
                </div>
            </main>
        </div>
    )
}

// --- 以下、各セクションの部品 ---
// ※設定データを受け取れるように改造しました

function SidebarItem({ icon, label, isActive, onClick }: { icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void }) {
    return (
        <Button
            variant={isActive ? "secondary" : "ghost"}
            className={`w-full justify-start ${isActive ? "bg-secondary font-medium" : ""}`}
            onClick={onClick}
        >
            {icon}
            {label}
        </Button>
    )
}

// プロップスの型定義
type SectionProps = {
    settings: AppSettings
    onUpdate: (key: keyof AppSettings, value: any) => void
    t: (key: any) => string
}

// DataSection用の拡張Props
type DataSectionProps = SectionProps & {
    importSourcePath: string;
    setImportSourcePath: (path: string) => void;
    isImporting: boolean;
    setIsImporting: (val: boolean) => void;
}

function GeneralSection({ settings, onUpdate, t }: SectionProps) {
    return (
        <div className="space-y-6">
            <div className="mb-8">
                <h2 className="text-3xl font-black tracking-tight text-gray-900 mb-2">{t('settings.general.title')}</h2>
                <p className="text-gray-500 text-sm">{t('settings.general.description')}</p>
            </div>
            <Separator />
            <div className="grid gap-4">
                <div className="grid gap-2">
                    <Label>{t('settings.general.language')}</Label>
                    <div className="flex gap-2">
                        <Button
                            variant={settings.language === "ja" ? "default" : "outline"}
                            className="w-32 justify-start"
                            onClick={() => onUpdate("language", "ja")}
                        >
                            <Globe className="mr-2 h-4 w-4" /> 日本語
                        </Button>
                        <Button
                            variant={settings.language === "en" ? "default" : "ghost"}
                            className="w-32 justify-start"
                            onClick={() => onUpdate("language", "en")}
                        >
                            English
                        </Button>
                    </div>
                </div>

                {/* 自動起動スイッチ */}
                <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                        <Label className="text-base">{t('settings.general.autoStart')}</Label>
                        <p className="text-sm text-muted-foreground">{t('settings.general.autoStartDesc')}</p>
                    </div>
                    <Switch
                        checked={settings.auto_start}
                        onCheckedChange={async (val) => {
                            onUpdate("auto_start", val)
                            // autostart pluginを呼び出し
                            try {
                                const { enable, disable } = await import("@tauri-apps/plugin-autostart")
                                if (val) {
                                    await enable()
                                    console.log("[AutoStart] Enabled")
                                } else {
                                    await disable()
                                    console.log("[AutoStart] Disabled")
                                }
                            } catch (e) {
                                console.error("[AutoStart] Failed to set autostart:", e)
                            }
                        }}
                    />
                </div>

                {/* 効果音スイッチ */}
                <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                        <Label className="text-base">{t('settings.general.sound')}</Label>
                        <p className="text-sm text-muted-foreground">{t('settings.general.soundDesc')}</p>
                    </div>
                    <Switch
                        checked={settings.sound_enabled}
                        onCheckedChange={(val) => onUpdate("sound_enabled", val)}
                    />
                </div>
            </div>
        </div>
    )
}

function AppearanceSection({ settings, onUpdate, t }: SectionProps) {
    return (
        <div className="space-y-6">
            <div className="mb-8">
                <h2 className="text-3xl font-black tracking-tight text-gray-900 mb-2">{t('settings.appearance.title')}</h2>
                <p className="text-gray-500 text-sm">{t('settings.appearance.description')}</p>
            </div>
            <Separator />

            <div className="space-y-4 pt-4">
                <div className="flex justify-between">
                    <Label>{t('settings.appearance.fontSize')}</Label>
                    <span className="text-sm text-muted-foreground">{t('settings.appearance.fontSizeCurrent')}: {settings.font_size}px</span>
                </div>
                {/* スライダーの値と連携 */}
                <Slider
                    defaultValue={[settings.font_size]}
                    value={[settings.font_size]}
                    max={32}
                    min={10}
                    step={1}
                    className="w-[60%]"
                    onValueChange={(vals) => onUpdate("font_size", vals[0])}
                />
                <div className="h-20 w-full rounded border p-4 flex items-center justify-center bg-muted/20">
                    <p style={{ fontSize: `${settings.font_size}px` }}>
                        {t('settings.appearance.preview')}
                    </p>
                </div>
            </div>
        </div>
    )
}

function DataSection({
    settings,
    onUpdate,
    t,
    importSourcePath,
    setImportSourcePath,
    isImporting,
    setIsImporting
}: DataSectionProps) {
    const handleSelectFolder = async () => {
        try {
            const { invoke } = await import("@tauri-apps/api/core")
            const folder = await invoke<string | null>("fusen_select_folder")
            if (folder) {
                onUpdate("base_path", folder)
            }
        } catch (e) {
            console.error("フォルダ選択に失敗:", e)
            alert("フォルダ選択に失敗しました: " + String(e))
        }
    }

    return (
        <div className="space-y-6">
            <div className="mb-8">
                <h2 className="text-3xl font-black tracking-tight text-gray-900 mb-2">{t('settings.data.title')}</h2>
                <p className="text-gray-500 text-sm">{t('settings.data.description')}</p>
            </div>
            <Separator />

            <div className="grid gap-4">
                <div className="grid gap-2">
                    <Label htmlFor="path">{t('settings.data.basePath')}</Label>
                    <div className="flex gap-2">
                        <Input
                            id="path"
                            value={settings.base_path}
                            readOnly
                            placeholder={t('settings.data.basePathPlaceholder')}
                            className="font-mono text-sm bg-muted"
                        />
                        <Button variant="outline" onClick={handleSelectFolder}>
                            <FolderOpen className="mr-2 h-4 w-4" /> {t('settings.data.browse')}
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        {settings.base_path ? t('settings.data.selected') : t('settings.data.notSet')}
                    </p>
                </div>

            </div>

            {/* --- インポートセクション --- */}
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/50 p-6">
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <Database className="h-4 w-4" />
                            {t('settings.data.import')}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">
                            {t('settings.data.importDesc')}
                        </p>
                    </div>
                </div>

                <div className="flex flex-col gap-3">
                    <div className="flex gap-2">
                        <Input
                            readOnly
                            placeholder={t('settings.data.importPlaceholder')}
                            value={importSourcePath}
                            className="font-mono text-sm bg-white"
                        />
                        <Button variant="outline" onClick={async () => {
                            try {
                                const { invoke } = await import("@tauri-apps/api/core");
                                // 副作用のないフォルダ選択を使う
                                const path = await invoke<string | null>("fusen_pick_folder");
                                if (path) setImportSourcePath(path);
                            } catch (e) {
                                console.error("フォルダ選択失敗:", e);
                            }
                        }}>
                            <FolderOpen className="mr-2 h-4 w-4" /> {t('settings.data.browse')}
                        </Button>
                    </div>

                    <div className="flex justify-end">
                        <Button
                            disabled={!importSourcePath || isImporting}
                            onClick={async () => {
                                if (!importSourcePath) return;
                                setIsImporting(true);
                                try {
                                    const { invoke } = await import("@tauri-apps/api/core");
                                    type Stats = { total_files: number, imported_md: number, imported_images: number, skipped: number, errors: string[] };
                                    const stats = await invoke<Stats>("fusen_import_from_folder", {
                                        sourcePath: importSourcePath,
                                        targetPath: settings.base_path
                                    });

                                    let msg = `インポート完了！\n\n`;
                                    msg += `📝 ノート: ${stats.imported_md}件\n`;
                                    msg += `🖼️ 画像: ${stats.imported_images}件\n`;
                                    if (stats.errors.length > 0) {
                                        msg += `⚠️ エラー: ${stats.errors.length}件\n`;
                                        console.error("Import Errors:", stats.errors);
                                    }

                                    alert(msg);

                                    // リロードは不要（設定画面を閉じない）
                                    // 保存時に反映、もしくは既にアクティブなフォルダなら次回更新時に反映される
                                } catch (e) {
                                    console.error("インポート失敗:", e);
                                    alert("インポートに失敗しました: " + String(e));
                                } finally {
                                    setIsImporting(false);
                                    setImportSourcePath("");
                                }
                            }}
                        >
                            {isImporting ? (
                                <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div> {t('common.loading')}</>
                            ) : (
                                <><Reply className="mr-2 h-4 w-4" /> {t('settings.data.importButton')}</>
                            )}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}

function AboutSection({ t }: { t: (key: any) => string }) {
    const [version, setVersion] = React.useState<string>('...')

    React.useEffect(() => {
        // Tauriのバージョン情報を取得
        import('@tauri-apps/api/app')
            .then(({ getVersion }) => getVersion())
            .then(v => setVersion(v))
            .catch(e => {
                console.error('Failed to get version:', e)
                setVersion('0.1.2') // フォールバック
            })
    }, [])

    return (
        <div className="space-y-6">
            <div className="mb-8">
                <h2 className="text-3xl font-black tracking-tight text-gray-900 mb-2">{t('settings.about.title')}</h2>
                <p className="text-gray-500 text-sm">{t('settings.about.description')}</p>
            </div>
            <Separator />

            {/* メインカード */}
            <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
                <div className="flex items-start space-x-4">
                    {/* 黄色いアイコン */}
                    <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-yellow-100">
                        <div className="h-8 w-8 text-yellow-600">
                            {/* 簡易的な付箋アイコン */}
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="h-8 w-8"
                            >
                                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                                <polyline points="14 2 14 8 20 8" />
                            </svg>
                        </div>
                    </div>

                    {/* タイトルとバージョン */}
                    <div className="space-y-1">
                        <h3 className="font-bold text-xl leading-none">{t('settings.about.appName')}</h3>
                        <p className="text-sm text-muted-foreground">OreNoFusen</p>
                        <p className="text-xs text-muted-foreground pt-1">{t('settings.about.version')} {version}</p>
                    </div>
                </div>

                <div className="mt-6 space-y-4">
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        {t('settings.about.appDesc')}
                    </p>

                    <div className="space-y-2 pt-2">
                        <Button
                            variant="outline"
                            className="w-full justify-start h-12 text-base font-normal"
                            onClick={async () => {
                                try {
                                    const { open } = await import('@tauri-apps/plugin-shell');
                                    await open('https://github.com/ore-no-fusen/ore-no-fusen');
                                } catch (e) {
                                    console.error('Failed to open link:', e);
                                }
                            }}
                        >
                            <Globe className="mr-3 h-5 w-5" />
                            {t('settings.about.website')}
                        </Button>
                        <Button
                            variant="outline"
                            className="w-full justify-start h-12 text-base font-normal"
                            onClick={async () => {
                                try {
                                    const { open } = await import('@tauri-apps/plugin-shell');
                                    await open('https://github.com/ore-no-fusen/ore-no-fusen');
                                } catch (e) {
                                    console.error('Failed to open link:', e);
                                }
                            }}
                        >
                            <div className="mr-3 h-5 w-5 flex items-center justify-center">
                                <svg role="img" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><title>GitHub</title><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" /></svg>
                            </div>
                            GitHub
                        </Button>
                    </div>
                </div>

                <div className="mt-8 text-center text-xs text-muted-foreground border-t pt-4">
                    {t('settings.about.copyright')}
                </div>
            </div>
        </div>
    )
}