/**
 * 設定画面 (Settings Page)
 *
 * 責務:
 * - アプリケーション全体の設定UI（全般、外観、データ、情報）の構築
 * - `useSettings` ストアとの連携による設定値の読み書き
 * - 言語切り替え、自動起動設定、インポート機能の実装
 */

"use client"

import React, { useState, useMemo, useEffect } from "react"
import { Monitor, Moon, Sun, Laptop, Save, FolderOpen, Info, Settings, Database, Type, Volume2, Globe, Reply, Smartphone } from "lucide-react"

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
    defaultTab?: string;
    iphoneDriveDisconnected?: boolean;
}

export default function SettingsPage({ onClose, defaultTab, iphoneDriveDisconnected }: SettingsPageProps) {
    const [activeSection, setActiveSection] = useState(defaultTab ?? "general")

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

    // バックアップ機能用State
    const [backupDestPath, setBackupDestPath] = useState("")
    const [isBackingUp, setIsBackingUp] = useState(false)

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
                    backupDestPath={backupDestPath}
                    setBackupDestPath={setBackupDestPath}
                    isBackingUp={isBackingUp}
                    setIsBackingUp={setIsBackingUp}
                />
            case "about":
                return <AboutSection t={t} />
            case "iphone":
                return <IphoneSection t={t} iphoneDriveDisconnected={iphoneDriveDisconnected ?? false} />
            case "feedback":
                return <FeedbackSection t={t} />
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
                        icon={<Smartphone className="mr-3 h-4 w-4" />}
                        label={t('settings.iphone')}
                        isActive={activeSection === "iphone"}
                        onClick={() => setActiveSection("iphone")}
                        badge={iphoneDriveDisconnected}
                    />
                    <SidebarItem
                        icon={<Info className="mr-3 h-4 w-4" />}
                        label={t('settings.about')}
                        isActive={activeSection === "about"}
                        onClick={() => setActiveSection("about")}
                    />
                    <div className="pt-4 pb-2">
                        <Separator />
                        <span className="text-xs font-bold text-muted-foreground px-4 py-2 block uppercase tracking-wider">Help & Feedback</span>
                    </div>
                    <SidebarItem
                        icon={<div className="mr-3 h-4 w-4">📨</div>}
                        label={t('settings.feedback.menuTitle')}
                        isActive={activeSection === "feedback"}
                        onClick={() => setActiveSection("feedback")}
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

function SidebarItem({
  icon, label, isActive, onClick, badge
}: {
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
  badge?: boolean;
}) {
    return (
        <Button
            variant={isActive ? "secondary" : "ghost"}
            className={`w-full justify-start ${isActive ? "bg-secondary font-medium" : ""}`}
            onClick={onClick}
        >
            {icon}
            <span className="flex-1 text-left">{label}</span>
            {badge && (
                <span className="ml-auto h-2 w-2 rounded-full bg-red-500 flex-shrink-0" />
            )}
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
    backupDestPath: string;
    setBackupDestPath: (path: string) => void;
    isBackingUp: boolean;
    setIsBackingUp: (val: boolean) => void;
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
    setIsImporting,
    backupDestPath,
    setBackupDestPath,
    isBackingUp,
    setIsBackingUp,
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

                                    // 付箋一覧を再描画
                                    const { emit } = await import("@tauri-apps/api/event");
                                    await emit("fusen:notes_updated");
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

            {/* --- バックアップセクション --- */}
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/50 p-6">
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <Database className="h-4 w-4" />
                            {t('settings.data.backup')}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">
                            {t('settings.data.backupDesc')}
                        </p>
                    </div>
                </div>

                <div className="flex flex-col gap-3">
                    <div className="flex gap-2">
                        <Input
                            readOnly
                            placeholder={t('settings.data.backupPlaceholder')}
                            value={backupDestPath}
                            className="font-mono text-sm bg-white"
                        />
                        <Button variant="outline" onClick={async () => {
                            try {
                                const { invoke } = await import("@tauri-apps/api/core");
                                const path = await invoke<string | null>("fusen_pick_folder");
                                if (path) setBackupDestPath(path);
                            } catch (e) {
                                console.error("フォルダ選択失敗:", e);
                            }
                        }}>
                            <FolderOpen className="mr-2 h-4 w-4" /> {t('settings.data.browse')}
                        </Button>
                    </div>

                    <div className="flex justify-end">
                        <Button
                            disabled={!backupDestPath || isBackingUp || !settings.base_path}
                            onClick={async () => {
                                if (!backupDestPath || !settings.base_path) return;
                                setIsBackingUp(true);
                                try {
                                    const { invoke } = await import("@tauri-apps/api/core");
                                    const count = await invoke<number>("fusen_backup", {
                                        sourcePath: settings.base_path,
                                        destPath: backupDestPath,
                                    });
                                    alert(t('settings.data.backupDone') + count + '件');
                                } catch (e) {
                                    console.error("バックアップ失敗:", e);
                                    alert("バックアップに失敗しました: " + String(e));
                                } finally {
                                    setIsBackingUp(false);
                                    setBackupDestPath("");
                                }
                            }}
                        >
                            {isBackingUp ? (
                                <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div> {t('common.loading')}</>
                            ) : (
                                <><Database className="mr-2 h-4 w-4" /> {t('settings.data.backupButton')}</>
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
                setVersion('')
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
                                    await open('https://ore-no-fusen.vercel.app');
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

// --- フィードバックセクション ---
function FeedbackSection({ t }: { t: (key: any) => string }) {
    const [type, setType] = useState<'bug' | 'feature' | 'other'>('bug')
    const [content, setContent] = useState('')
    const [contact, setContact] = useState('')
    const [isSending, setIsSending] = useState(false)
    const [sent, setSent] = useState(false)
    const [includeSystemInfo, setIncludeSystemInfo] = useState(true)

    const handleSubmit = async () => {
        if (!content.trim()) {
            alert(t('settings.feedback.errorEmpty'))
            return
        }

        setIsSending(true)
        try {
            // システム情報の収集
            let systemInfo = "Unknown";
            let appVersion = "Unknown";

            if (includeSystemInfo) {
                try {
                    const { type, version, arch } = await import('@tauri-apps/plugin-os');
                    const { getVersion } = await import('@tauri-apps/api/app');

                    const osType = await type();
                    const osVer = await version();
                    const osArch = await arch();
                    appVersion = await getVersion();

                    systemInfo = `${osType} ${osVer} (${osArch})`;
                } catch (e) {
                    console.error("Failed to get system info", e);
                }
            }

            // Vercel上のAPIに送信 (CORS対応済み)

            // 環境に応じてAPIのエンドポイントを切り替え
            const isDev = process.env.NODE_ENV === 'development';
            const apiUrl = isDev
                ? 'http://localhost:3002/api/feedback'
                : 'https://ore-no-fusen.vercel.app/api/feedback';

            console.log(`Sending feedback to: ${apiUrl}`);

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    type,
                    content,
                    contact,
                    systemInfo,
                    version: appVersion
                }),
            });

            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }

            setSent(true)
            setContent('')
        } catch (e) {
            console.error('Feedback failed:', e)
            alert(t('settings.feedback.errorSend') + ": " + String(e))
        } finally {
            setIsSending(false)
        }
    }

    if (sent) {
        return (
            <div className="flex flex-col items-center justify-center p-10 space-y-4 text-center">
                <div className="h-16 w-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4">
                    <Save className="h-8 w-8" />
                </div>
                <h3 className="text-2xl font-bold">{t('settings.feedback.successTitle')}</h3>
                <p className="text-muted-foreground">{t('settings.feedback.successDesc')}</p>
                <Button onClick={() => setSent(false)} variant="outline" className="mt-4">
                    {t('settings.feedback.sendAnother')}
                </Button>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="mb-8">
                <h2 className="text-3xl font-black tracking-tight text-gray-900 mb-2">{t('settings.feedback.title')}</h2>
                <p className="text-gray-500 text-sm">{t('settings.feedback.description')}</p>
            </div>
            <Separator />

            <div className="space-y-6 max-w-2xl">
                {/* 種類選択 */}
                <div className="space-y-3">
                    <Label>{t('settings.feedback.typeLabel')}</Label>
                    <div className="flex gap-4">
                        <label className={`flex-1 border rounded-lg p-4 cursor-pointer transition-all hover:bg-slate-50 ${type === 'bug' ? 'ring-2 ring-primary border-transparent bg-slate-50' : ''}`}>
                            <input type="radio" name="type" className="hidden" checked={type === 'bug'} onChange={() => setType('bug')} />
                            <div className="font-bold flex items-center gap-2">🐛 {t('settings.feedback.typeBug')}</div>
                            <div className="text-xs text-muted-foreground mt-1">{t('settings.feedback.typeBugDesc')}</div>
                        </label>
                        <label className={`flex-1 border rounded-lg p-4 cursor-pointer transition-all hover:bg-slate-50 ${type === 'feature' ? 'ring-2 ring-primary border-transparent bg-slate-50' : ''}`}>
                            <input type="radio" name="type" className="hidden" checked={type === 'feature'} onChange={() => setType('feature')} />
                            <div className="font-bold flex items-center gap-2">💡 {t('settings.feedback.typeFeature')}</div>
                            <div className="text-xs text-muted-foreground mt-1">{t('settings.feedback.typeFeatureDesc')}</div>
                        </label>
                        <label className={`flex-1 border rounded-lg p-4 cursor-pointer transition-all hover:bg-slate-50 ${type === 'other' ? 'ring-2 ring-primary border-transparent bg-slate-50' : ''}`}>
                            <input type="radio" name="type" className="hidden" checked={type === 'other'} onChange={() => setType('other')} />
                            <div className="font-bold flex items-center gap-2">💬 {t('settings.feedback.typeOther')}</div>
                            <div className="text-xs text-muted-foreground mt-1">{t('settings.feedback.typeOtherDesc')}</div>
                        </label>
                    </div>
                </div>

                {/* 内容 */}
                <div className="space-y-2">
                    <Label>{t('settings.feedback.contentLabel')}</Label>
                    <textarea
                        className="flex min-h-[150px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                        placeholder={t('settings.feedback.contentPlaceholder')}
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                    />
                </div>

                {/* 連絡先 */}
                <div className="space-y-2">
                    <Label>{t('settings.feedback.contactLabel')} <span className="text-xs text-muted-foreground">({t('common.optional')})</span></Label>
                    <Input
                        placeholder="Discord ID / Email"
                        value={contact}
                        onChange={(e) => setContact(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">{t('settings.feedback.contactDesc')}</p>
                </div>

                {/* システム情報送信の同意 */}
                <div className="flex items-center space-x-2 pt-2">
                    <Switch id="sys-info" checked={includeSystemInfo} onCheckedChange={setIncludeSystemInfo} />
                    <Label htmlFor="sys-info" className="text-sm font-normal cursor-pointer">
                        {t('settings.feedback.systemInfoLabel')}
                    </Label>
                </div>

                {/* 送信ボタン */}
                <div className="pt-4 flex justify-end">
                    <Button
                        size="lg"
                        onClick={handleSubmit}
                        disabled={isSending || !content.trim()}
                        className="min-w-[150px]"
                    >
                        {isSending ? (
                            <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div> {t('settings.feedback.sending')}</>
                        ) : (
                            <><div className="mr-2">📨</div> {t('settings.feedback.sendButton')}</>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    )
}

// --- デバイス管理 ---
type PushDevice = {
    device_id: string;
    endpoint: string;
    registered_at: string;
    device_name?: string;
    google_account_email?: string;
    google_account_name?: string;
    google_account_photo?: string;
}

type GoogleAccount = {
    emailAddress?: string;
    displayName?: string;
    photoLink?: string;
}

function endpointLabel(endpoint: string): string {
    if (endpoint.includes('web.push.apple.com')) return 'Apple (Safari)'
    if (endpoint.includes('fcm.googleapis.com') || endpoint.includes('fcm.google.com') || endpoint.includes('push.googleapis.com')) return 'Google (Chrome)'
    return 'Other'
}

function formatDate(iso: string): string {
    if (!iso) return '不明'
    try {
        return new Date(iso).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    } catch {
        return iso
    }
}

// --- iPhone連携セクション ---
const PWA_URL = 'https://ore-no-fusen.vercel.app/viewer'

function QrCodeCanvas({ url }: { url: string }) {
    const canvasRef = React.useRef<HTMLCanvasElement>(null)

    React.useEffect(() => {
        if (!canvasRef.current) return
        import('qrcode').then((QRCode) => {
            QRCode.toCanvas(canvasRef.current!, url, {
                width: 120,
                margin: 2,
                color: { dark: '#1a1a1a', light: '#ffffff' },
            })
        }).catch(console.error)
    }, [url])

    return (
        <canvas
            ref={canvasRef}
            className="rounded-lg border border-gray-200 shadow-sm"
            style={{ width: 120, height: 120 }}
        />
    )
}

function IphoneSection({ t, iphoneDriveDisconnected }: {
  t: (key: any) => string;
  iphoneDriveDisconnected: boolean;
}) {
    const [status, setStatus] = useState<'loading' | 'connected' | 'disconnected'>('loading')
    const [isConnecting, setIsConnecting] = useState(false)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)
    const [devices, setDevices] = useState<PushDevice[] | null>(null)
    const [devicesLoading, setDevicesLoading] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [pcAccount, setPcAccount] = useState<GoogleAccount | null>(null)

    const loadPcAccount = async () => {
        try {
            const { invoke } = await import('@tauri-apps/api/core')
            const account = await invoke<GoogleAccount>('fusen_get_google_account')
            setPcAccount(account)
        } catch (e) {
            console.error('[google-account]', e)
            setPcAccount(null)
        }
    }

    const loadDevices = async () => {
        setDevicesLoading(true)
        try {
            const { invoke } = await import('@tauri-apps/api/core')
            const list = await invoke<PushDevice[]>('fusen_list_push_devices')
            setDevices(list)
        } catch (e) {
            console.error('[devices]', e)
            setDevices([])
        } finally {
            setDevicesLoading(false)
        }
    }

    useEffect(() => {
        const check = async () => {
            try {
                const { invoke } = await import('@tauri-apps/api/core')
                const ok = await invoke<boolean>('fusen_check_pro_setup')
                setStatus(ok ? 'connected' : 'disconnected')
                if (ok) {
                    loadPcAccount()
                    loadDevices()
                } else {
                    setPcAccount(null)
                }
            } catch {
                setStatus('disconnected')
                setPcAccount(null)
            }
        }
        check()
    }, [])

    const handleConnect = async () => {
        setIsConnecting(true)
        setErrorMsg(null)
        try {
            const { invoke } = await import('@tauri-apps/api/core')
            await invoke('fusen_oauth_connect')
            const ok = await invoke<boolean>('fusen_check_pro_setup')
            setStatus(ok ? 'connected' : 'disconnected')
            if (ok) {
                await loadPcAccount()
                await loadDevices()
            } else {
                setPcAccount(null)
            }
            if (!ok) setErrorMsg('接続しましたが、iPhoneのセットアップがまだ完了していません。iPhoneでPWAを開いてセットアップしてください。')
        } catch (e: unknown) {
            setErrorMsg('接続に失敗しました: ' + String(e))
            setStatus('disconnected')
        } finally {
            setIsConnecting(false)
        }
    }

    const pcEmail = pcAccount?.emailAddress?.toLowerCase()
    const registeredDeviceEmails = (devices ?? [])
        .map((d) => d.google_account_email)
        .filter((email): email is string => !!email)
    const hasIphoneAccountInfo = registeredDeviceEmails.length > 0
    const hasAccountMismatch = !!pcEmail && registeredDeviceEmails.some((email) => email.toLowerCase() !== pcEmail)
    const hasRegisteredDevice = (devices ?? []).length > 0
    const pcConnected = status === 'connected' && !!pcAccount?.emailAddress
    const accountsReady = pcConnected && hasIphoneAccountInfo && !hasAccountMismatch

    const setupSteps = [
        {
            no: 1,
            title: 'iPhoneでPWAをインストール',
            detail: 'QRコードをSafariで開き、ホーム画面に追加します。',
            done: hasRegisteredDevice,
            status: hasRegisteredDevice ? '完了' : '未確認',
        },
        {
            no: 2,
            title: 'iPhone側でGoogleドライブに接続',
            detail: hasIphoneAccountInfo ? registeredDeviceEmails[0] : 'iPhone側PWAを開くと確認されます。',
            done: hasIphoneAccountInfo,
            status: hasIphoneAccountInfo ? '接続済み' : '未取得',
        },
        {
            no: 3,
            title: 'PC側でGoogleドライブに接続',
            detail: pcAccount?.emailAddress ?? 'このPCでGoogleドライブに接続します。',
            done: pcConnected,
            status: pcConnected ? '接続済み' : status === 'loading' ? '確認中' : '未接続',
        },
        {
            no: 4,
            title: '同じGoogleアカウントで送信準備',
            detail: hasAccountMismatch
                ? 'PCとiPhoneで別のGoogleアカウントが使われています。'
                : accountsReady
                    ? '付箋を右クリックして「iPhoneに送る」を使えます。'
                    : 'PC側とiPhone側の接続がそろうと送信できます。',
            done: accountsReady,
            status: hasAccountMismatch ? '不一致' : accountsReady ? 'OK' : '未完了',
            warning: hasAccountMismatch,
        },
    ]

    const nextAction = (() => {
        if (hasAccountMismatch) {
            return 'PCとiPhoneで同じGoogleアカウントに再接続してください。'
        }
        if (!hasRegisteredDevice) {
            return 'まずiPhoneでQRコードを開き、PWAをホーム画面に追加してGoogleドライブに接続してください。'
        }
        if (!hasIphoneAccountInfo) {
            return 'iPhoneでホーム画面の「俺の付箋」を開いてください。iPhone側のGoogleアカウント情報が更新されます。'
        }
        if (!pcConnected) {
            return 'このPCでGoogleドライブに接続してください。'
        }
        return '準備完了です。付箋を右クリックして「iPhoneに送る」を押してください。'
    })()

    const handleCopy = () => {
        navigator.clipboard.writeText(PWA_URL).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        })
    }

    return (
        <div className="space-y-6">
            <div className="mb-8">
                <h2 className="text-3xl font-black tracking-tight text-gray-900 mb-2">iPhone連携</h2>
                <p className="text-gray-500 text-sm">付箋をiPhoneのロック画面に送信するための設定です。</p>
            </div>
            <Separator />

            {/* --- PWA QRコードパネル --- */}
            <div className="rounded-lg border border-slate-200 bg-white p-6 space-y-5">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900">iPhoneに送る準備</h3>
                        <p className="text-sm text-gray-500 mt-1">初回は上から順に進めてください。次に必要な作業だけが分かるように表示します。</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        accountsReady
                            ? 'bg-green-100 text-green-700'
                            : hasAccountMismatch
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-slate-100 text-slate-600'
                    }`}>
                        {accountsReady ? '準備完了' : hasAccountMismatch ? '確認が必要' : 'セットアップ中'}
                    </span>
                </div>

                <div className="grid gap-3">
                    {setupSteps.map((step) => (
                        <div
                            key={step.no}
                            className={`flex gap-3 rounded-md border px-4 py-3 ${
                                step.warning
                                    ? 'border-amber-200 bg-amber-50'
                                    : step.done
                                        ? 'border-green-100 bg-green-50'
                                        : 'border-gray-100 bg-gray-50'
                            }`}
                        >
                            <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                step.warning
                                    ? 'bg-amber-500 text-white'
                                    : step.done
                                        ? 'bg-green-500 text-white'
                                        : 'bg-white text-gray-500 border border-gray-200'
                            }`}>
                                {step.done ? '✓' : step.no}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-sm font-semibold text-gray-800">{step.title}</p>
                                    <span className={`shrink-0 text-xs font-medium ${
                                        step.warning ? 'text-amber-700' : step.done ? 'text-green-700' : 'text-gray-400'
                                    }`}>
                                        {step.status}
                                    </span>
                                </div>
                                <p className="text-xs text-gray-500 mt-1 break-all">{step.detail}</p>
                            </div>
                        </div>
                    ))}
                </div>

                <div className={`rounded-md px-4 py-3 text-sm ${
                    hasAccountMismatch
                        ? 'bg-amber-100 text-amber-800'
                        : accountsReady
                            ? 'bg-green-100 text-green-800'
                            : 'bg-blue-50 text-blue-800'
                }`}>
                    <span className="font-semibold">次にやること: </span>{nextAction}
                </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-6">
                <h3 className="font-semibold text-gray-800 mb-1 flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-slate-500" />
                    iPhoneでPWAを開く
                </h3>
                <p className="text-xs text-gray-500 mb-4">
                    iPhoneのSafariでQRコードを読み取るか、URLをコピーして開いてください。
                </p>
                <div className="flex items-start gap-6">
                    {/* QRコード */}
                    <div className="flex-shrink-0">
                        <QrCodeCanvas url={PWA_URL} />
                    </div>
                    {/* URL + コピー */}
                    <div className="flex flex-col justify-center gap-3 min-w-0">
                        <div className="flex flex-col gap-1">
                            <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">PWA アドレス</span>
                            <code className="text-sm font-mono text-gray-700 bg-white border border-gray-200 rounded px-3 py-2 whitespace-nowrap overflow-x-auto block">
                                {PWA_URL}
                            </code>
                        </div>
                        <button
                            onClick={handleCopy}
                            className={`flex items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-all duration-200 ${
                                copied
                                    ? 'border-green-300 bg-green-50 text-green-700'
                                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                            }`}
                        >
                            {copied ? (
                                <>
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    コピーしました
                                </>
                            ) : (
                                <>
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                    URLをコピー
                                </>
                            )}
                        </button>
                        <p className="text-xs text-gray-400">
                            ①SafariでURLを開く → ②「ホーム画面に追加」→ ③ログイン
                        </p>
                    </div>
                </div>
            </div>

            {/* --- Google Drive接続パネル --- */}
            <div className="rounded-lg border p-6 space-y-4">
                <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-800">Googleドライブ接続</h3>
                    {iphoneDriveDisconnected && (
                        <span className="h-2 w-2 rounded-full bg-red-500 flex-shrink-0" title="Driveに接続されていません" />
                    )}
                </div>
                <p className="text-sm text-gray-500">PCとiPhoneのデータ中継にGoogleドライブを使用します。</p>

                {status === 'loading' && (
                    <p className="text-sm text-gray-400">確認中...</p>
                )}

                {status === 'connected' && (
                    <div className="space-y-3">
                        <div className="flex items-center gap-3">
                            <span className="text-green-600 font-semibold">✅ 接続済み</span>
                            <Button variant="outline" size="sm" onClick={handleConnect} disabled={isConnecting}>
                                再接続
                            </Button>
                        </div>
                        <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
                            <div className="text-xs font-medium text-gray-500">PC側 Googleアカウント</div>
                            <div className="mt-1 flex items-center gap-2 text-sm text-gray-800">
                                {pcAccount?.photoLink && (
                                    <img src={pcAccount.photoLink} alt="" className="h-5 w-5 rounded-full" />
                                )}
                                <span className="font-medium">{pcAccount?.emailAddress ?? '取得中...'}</span>
                                {pcAccount?.displayName && (
                                    <span className="text-xs text-gray-400">{pcAccount.displayName}</span>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {status === 'disconnected' && (
                    <Button onClick={handleConnect} disabled={isConnecting}>
                        {isConnecting ? (
                            <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />接続中...</>
                        ) : (
                            <><Smartphone className="mr-2 h-4 w-4" />Googleドライブに接続</>
                        )}
                    </Button>
                )}

                {errorMsg && (
                    <p className="text-sm text-amber-600 bg-amber-50 rounded p-3">{errorMsg}</p>
                )}
            </div>

            {status === 'connected' && (
                <div className={`rounded-lg border p-6 ${hasAccountMismatch ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'}`}>
                    <p className={`text-sm font-medium ${hasAccountMismatch ? 'text-amber-700' : 'text-green-700'}`}>
                        {hasAccountMismatch ? '⚠ PCとiPhoneのGoogleアカウントが違います' : '✅ iPhoneへの送信が有効です'}
                    </p>
                    <p className={`text-sm mt-1 ${hasAccountMismatch ? 'text-amber-700' : 'text-green-600'}`}>
                        {hasAccountMismatch
                            ? '同じGoogleアカウントで再接続してください。違うDriveを見ているため、送信に失敗します。'
                            : hasIphoneAccountInfo
                                ? 'PCとiPhoneは同じGoogleアカウントで接続されています。'
                                : '付箋を右クリック →「iPhoneに送る」で送信できます。iPhone側アカウントはPWAを開くと表示されます。'}
                    </p>
                </div>
            )}

            {/* --- デバイス管理パネル --- */}
            {status === 'connected' && (
                <div className="rounded-lg border border-slate-200 bg-white p-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-gray-800 text-sm">通知デバイス管理</h3>
                        <div className="flex gap-2">
                            <button
                                onClick={loadDevices}
                                disabled={devicesLoading}
                                className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-2 py-1"
                            >
                                {devicesLoading ? '読み込み中...' : '更新'}
                            </button>
                            {devices && devices.length > 0 && (
                                <button
                                    onClick={async () => {
                                        if (!confirm('全デバイスを削除しますか？\niPhoneで再登録が必要になります。')) return
                                        setDevicesLoading(true)
                                        try {
                                            const { invoke } = await import('@tauri-apps/api/core')
                                            await invoke('fusen_delete_all_push_devices')
                                            setDevices([])
                                        } catch (e) {
                                            alert('削除に失敗しました: ' + String(e))
                                        } finally {
                                            setDevicesLoading(false)
                                        }
                                    }}
                                    className="text-xs text-red-500 hover:text-red-700 border border-red-200 rounded px-2 py-1"
                                >
                                    全て削除
                                </button>
                            )}
                        </div>
                    </div>
                    <p className="text-xs text-gray-400">通知の送信先デバイス一覧です。不要なデバイスを削除できます。</p>

                    {devicesLoading && (
                        <p className="text-xs text-gray-400">読み込み中...</p>
                    )}

                    {!devicesLoading && devices !== null && devices.length === 0 && (
                        <p className="text-xs text-gray-400">登録デバイスなし。iPhoneのPWAで通知を有効にしてください。</p>
                    )}

                    {!devicesLoading && devices && devices.length > 0 && (
                        <div className="space-y-2">
                            {devices.map((d) => (
                                <div key={d.device_id} className="flex items-center justify-between rounded-md border border-gray-100 bg-gray-50 px-3 py-2 gap-2">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-medium text-gray-700">
                                                {d.device_name ?? endpointLabel(d.endpoint)}
                                            </span>
                                            <span className="text-xs text-gray-400 truncate max-w-[100px]">
                                                {endpointLabel(d.endpoint)}
                                            </span>
                                        </div>
                                        <div className="text-xs text-gray-400 mt-0.5">{formatDate(d.registered_at)}</div>
                                        <div className={`text-xs mt-1 ${pcEmail && d.google_account_email && d.google_account_email.toLowerCase() !== pcEmail ? 'text-amber-600 font-medium' : 'text-gray-500'}`}>
                                            Google: {d.google_account_email ?? '未取得（iPhone側PWAを開くと更新されます）'}
                                            {d.google_account_name && (
                                                <span className="text-gray-400"> / {d.google_account_name}</span>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        disabled={deletingId === d.device_id}
                                        onClick={async () => {
                                            setDeletingId(d.device_id)
                                            try {
                                                const { invoke } = await import('@tauri-apps/api/core')
                                                await invoke('fusen_delete_push_device', { deviceId: d.device_id })
                                                setDevices(prev => prev ? prev.filter(x => x.device_id !== d.device_id) : prev)
                                            } catch (e) {
                                                alert('削除に失敗しました: ' + String(e))
                                            } finally {
                                                setDeletingId(null)
                                            }
                                        }}
                                        className="text-xs text-red-400 hover:text-red-600 flex-shrink-0 disabled:opacity-40"
                                    >
                                        {deletingId === d.device_id ? '削除中...' : '削除'}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {status === 'disconnected' && !isConnecting && (
                <div className="rounded-lg border p-6 space-y-2 bg-gray-50">
                    <h3 className="font-semibold text-gray-700 text-sm">セットアップ手順</h3>
                    <ol className="text-sm text-gray-500 space-y-1 list-decimal list-inside">
                        <li>上のQRコードをiPhoneのカメラで読み取る（またはURLをコピー）</li>
                        <li>SafariでPWAを開き「ホーム画面に追加」</li>
                        <li>上の「Googleドライブに接続」ボタンをクリックし、Googleアカウントにログイン</li>
                        <li>iPhoneのPWAでもGoogleアカウントにログインしてセットアップを完了</li>
                        <li>付箋を右クリック →「iPhoneに送る」</li>
                    </ol>
                </div>
            )}
        </div>
    )
}
