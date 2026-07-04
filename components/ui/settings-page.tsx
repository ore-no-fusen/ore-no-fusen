/**
 * 設定画面 (Settings Page)
 *
 * 責務:
 * - アプリケーション全体の設定UI（全般、外観、データ、情報）の構築
 * - `useSettings` ストアとの連携による設定値の読み書き
 * - 言語切り替え、自動起動設定、インポート機能の実装
 */

"use client"

import React, { useState, useMemo, useEffect, useCallback } from "react"
import { invoke } from "@tauri-apps/api/core"
import { Monitor, Moon, Sun, Laptop, Save, FolderOpen, Info, Settings, Database, Type, Volume2, Globe, Reply, Smartphone, HelpCircle, MousePointer2, Keyboard, ShieldCheck, Sparkles, Pin, Search, AlertCircle, ChevronRight, Wrench, ExternalLink, HardDrive, Cloud, RefreshCw, Send, Inbox, Trash2, FileJson, Copy, X, Activity, ImageIcon, Video, FileText, Heart } from "lucide-react"

// ★さっき作った「倉庫番」をインポート
import { useSettings, type AppSettings } from "@/lib/settings-store"
// ★翻訳関数をインポート
import { getTranslation, type TranslationKey, type Language } from "@/lib/i18n"
import { formatShortcutLabel, keyboardEventToShortcut } from "@/app/utils/shortcutKey"
import {
    ackFeedbackConversationMessages,
    getDeveloperFeedbackApiBaseUrl,
    getFeedbackApiBaseUrl,
    getFeedbackConversationIdentity,
    getOrCreateFeedbackConversationIdentity,
    getUnreadDeveloperReplyIds,
    hasUnreadDeveloperReply,
    pollFeedbackConversationMessages,
    saveFeedbackConversationIdentity,
    setFeedbackConversationUnreadState,
} from "@/app/utils/feedbackConversation"

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
    /** 保存先フォルダが消えていて再セットアップ中の通知を出すか */
    baseFolderMissing?: boolean;
    /** 失われた保存先フォルダのパス（バナー表示用） */
    missingFolderPath?: string | null;
}

const DISCORD_INGEST_SECRET_STORAGE_KEY = 'ore-no-fusen.feedback.discord_ingest_secret';
const PRODUCTION_SUPPORT_PAGE_URL = 'https://ore-no-fusen.vercel.app/endroll';
const DEVELOP_SUPPORT_PAGE_URL = 'https://ore-no-fusen-git-develop-uch54s-projects.vercel.app/endroll';

function getSupportPageUrl(): string {
    return process.env.NODE_ENV === 'development'
        ? DEVELOP_SUPPORT_PAGE_URL
        : PRODUCTION_SUPPORT_PAGE_URL;
}

function getStoredDiscordIngestSecret(): string {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem(DISCORD_INGEST_SECRET_STORAGE_KEY) ?? '';
}

export default function SettingsPage({ onClose, defaultTab, iphoneDriveDisconnected, baseFolderMissing, missingFolderPath }: SettingsPageProps) {
    const [activeSection, setActiveSection] = useState(defaultTab ?? "general")

    useEffect(() => {
        if (defaultTab) setActiveSection(defaultTab)
    }, [defaultTab])

    useEffect(() => {
        let cancelled = false

        const resizeWindow = async () => {
            try {
                const { getCurrentWindow } = await import("@tauri-apps/api/window")
                const { LogicalSize } = await import("@tauri-apps/api/dpi")
                const win = getCurrentWindow()
                if (cancelled || win.label !== "main") return
                await win.setSize(new LogicalSize(1100, 760))
                await win.center()
            } catch {
                // Browser preview does not have a Tauri window.
            }
        }

        resizeWindow()
        const retry = window.setTimeout(resizeWindow, 150)
        return () => {
            cancelled = true
            window.clearTimeout(retry)
        }
    }, [])

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
            case "hotkeys":
                return <HotkeySection settings={settings} saveSettings={saveSettings} />
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
                return <IphoneSection settings={settings} onUpdate={updateSetting} t={t} iphoneDriveDisconnected={iphoneDriveDisconnected ?? false} />
            case "help":
                return <HelpSection t={t} />
            case "feedback":
                return <FeedbackSection t={t} />
            case "conversation":
                return <DeveloperConversationSection />
            case "advanced":
                return <AdvancedSection settings={settings} t={t} />
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
                        icon={<Keyboard className="mr-3 h-4 w-4" />}
                        label="ホットキー"
                        isActive={activeSection === "hotkeys"}
                        onClick={() => setActiveSection("hotkeys")}
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
                        icon={<HelpCircle className="mr-3 h-4 w-4" />}
                        label={t('settings.help.menuTitle')}
                        isActive={activeSection === "help"}
                        onClick={() => setActiveSection("help")}
                    />
                    <SidebarItem
                        icon={<div className="mr-3 h-4 w-4">📨</div>}
                        label={t('settings.feedback.menuTitle')}
                        isActive={activeSection === "feedback"}
                        onClick={() => setActiveSection("feedback")}
                    />
                    <SidebarItem
                        icon={<Inbox className="mr-3 h-4 w-4" />}
                        label="開発者とのやりとり"
                        isActive={activeSection === "conversation"}
                        onClick={() => setActiveSection("conversation")}
                    />
                    <SidebarItem
                        icon={<Heart className="mr-3 h-4 w-4" />}
                        label={t('settings.support.menuTitle')}
                        isActive={false}
                        onClick={async () => {
                            const url = getSupportPageUrl()
                            try {
                                const { open } = await import('@tauri-apps/plugin-shell')
                                await open(url)
                            } catch (e) {
                                console.error('Failed to open support page:', e)
                                window.open(url, '_blank')
                            }
                        }}
                    />

                    <div className="pt-4 pb-2">
                        <Separator />
                        <span className="text-xs font-bold text-muted-foreground px-4 py-2 block uppercase tracking-wider">{t('settings.advanced.section')}</span>
                    </div>
                    <SidebarItem
                        icon={<Wrench className="mr-3 h-4 w-4" />}
                        label={t('settings.advanced.menuTitle')}
                        isActive={activeSection === "advanced"}
                        onClick={() => setActiveSection("advanced")}
                    />
                </nav>
            </aside>

            {/* メインコンテンツエリア */}
            <main className="flex flex-1 flex-col overflow-hidden bg-white">
                <div className="flex-1 overflow-y-auto p-10 pt-12">
                    {baseFolderMissing && (
                        <div className="mb-8 rounded-lg border border-amber-300 bg-amber-50 p-4 flex items-start gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 text-xl font-bold">!</div>
                            <div className="flex-1 text-sm leading-6 text-amber-900">
                                <p className="font-bold text-amber-900 mb-1">
                                    保存先フォルダが見つかりませんでした。
                                </p>
                                {missingFolderPath && (
                                    <p className="text-xs text-amber-800 mb-2 font-mono break-all">
                                        以前の場所: {missingFolderPath}
                                    </p>
                                )}
                                <p className="text-amber-800 mb-3">
                                    自動で新しいデフォルトフォルダを作成しました。場所を変更したいときは「データ管理」タブから保存先を編集してください。
                                </p>
                                {activeSection !== 'data' && (
                                    <button
                                        type="button"
                                        onClick={() => setActiveSection('data')}
                                        className="inline-flex items-center gap-1.5 rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100 transition-colors"
                                    >
                                        データ管理タブを開く →
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
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

type HotkeyAction = 'new_note' | 'toggle_visibility' | 'arrange';
type NewNoteTrigger = 'shortcut' | 'double_ctrl' | 'double_shift';
type HotkeyBindings = {
    new_note_trigger: NewNoteTrigger;
    new_note: string;
    toggle_visibility: string;
    arrange: string;
}
type HotkeyCheckResult = {
    available: boolean;
    reason: 'ok' | 'self' | 'internal' | 'external' | 'reserved';
    conflict_action?: HotkeyAction | null;
}

const HOTKEY_ACTION_LABELS: Record<HotkeyAction, string> = {
    new_note: '新規付箋',
    toggle_visibility: '表示切替',
    arrange: '整列',
}

function HotkeySection({ settings, saveSettings }: {
    settings: AppSettings;
    saveSettings: (settings: AppSettings) => Promise<void>;
}) {
    const [bindings, setBindings] = useState<HotkeyBindings | null>(null)
    const [captureAction, setCaptureAction] = useState<HotkeyAction | null>(null)
    const [candidateShortcut, setCandidateShortcut] = useState<string | null>(null)
    const [checkResult, setCheckResult] = useState<HotkeyCheckResult | null>(null)
    const [message, setMessage] = useState("")
    const [isSaving, setIsSaving] = useState(false)

    const loadBindings = useCallback(async (): Promise<HotkeyBindings | null> => {
        try {
            const result = await invoke<HotkeyBindings>('hotkey_get_bindings')
            setBindings(result)
            return result
        } catch (e) {
            setMessage(`ホットキー設定の読み込みに失敗しました: ${String(e)}`)
            return null
        }
    }, [])

    useEffect(() => {
        loadBindings()
    }, [loadBindings])

    useEffect(() => {
        if (!captureAction) return

        const onKeyDown = async (event: KeyboardEvent) => {
            event.preventDefault()
            event.stopPropagation()

            if (event.key === 'Escape') {
                setCaptureAction(null)
                setCandidateShortcut(null)
                setCheckResult(null)
                setMessage("")
                return
            }

            const shortcut = keyboardEventToShortcut(event)
            if (!shortcut) {
                setMessage("修飾キーと通常キーを組み合わせて押してください。Esc でキャンセルできます。")
                return
            }

            setCandidateShortcut(shortcut)
            try {
                const result = await invoke<HotkeyCheckResult>('hotkey_check', {
                    action: captureAction,
                    shortcut,
                })
                setCheckResult(result)
                setMessage(hotkeyCheckMessage(result))
            } catch (e) {
                setCheckResult(null)
                setMessage(`判定に失敗しました: ${String(e)}`)
            }
        }

        window.addEventListener('keydown', onKeyDown, true)
        return () => window.removeEventListener('keydown', onKeyDown, true)
    }, [captureAction])

    const beginCapture = (action: HotkeyAction) => {
        setCaptureAction(action)
        setCandidateShortcut(null)
        setCheckResult(null)
        setMessage("押してください...（Escでキャンセル）")
    }

    const applyShortcut = async () => {
        if (!bindings || !captureAction || !candidateShortcut || !checkResult?.available) return
        setIsSaving(true)
        try {
            await invoke('hotkey_apply', {
                action: captureAction,
                config: captureAction === 'new_note'
                    ? { shortcut: candidateShortcut, new_note_trigger: 'shortcut' }
                    : { shortcut: candidateShortcut },
            })
            const nextBindings = await loadBindings()
            if (nextBindings) await syncSettingsStore(settings, saveSettings, nextBindings)
            setCaptureAction(null)
            setCandidateShortcut(null)
            setCheckResult(null)
            setMessage("保存しました。")
        } catch (e) {
            setMessage(`保存に失敗しました: ${String(e)}`)
        } finally {
            setIsSaving(false)
        }
    }

    const applyNewNoteTrigger = async (trigger: NewNoteTrigger) => {
        if (!bindings) return
        setIsSaving(true)
        try {
            await invoke('hotkey_apply', {
                action: 'new_note',
                config: trigger === 'shortcut'
                    ? { shortcut: bindings.new_note, new_note_trigger: 'shortcut' }
                    : { new_note_trigger: trigger },
            })
            const nextBindings = await loadBindings()
            if (nextBindings) await syncSettingsStore(settings, saveSettings, nextBindings)
            setMessage("保存しました。")
        } catch (e) {
            setMessage(`保存に失敗しました: ${String(e)}`)
        } finally {
            setIsSaving(false)
        }
    }

    if (!bindings) {
        return <div className="text-sm text-muted-foreground">ホットキー設定を読み込み中...</div>
    }

    return (
        <div className="space-y-6">
            <div className="mb-8">
                <h2 className="text-3xl font-black tracking-tight text-gray-900 mb-2">ホットキー</h2>
                <p className="text-gray-500 text-sm">新規付箋、表示切替、整列のグローバルホットキーを設定します。</p>
            </div>
            <Separator />

            <div className="space-y-4">
                <div className="rounded-lg border p-4 space-y-4">
                    <div>
                        <Label className="text-base font-bold text-gray-900">新規付箋トリガー</Label>
                        <p className="text-sm text-muted-foreground mt-1">付箋を作る操作を選びます。</p>
                    </div>

                    <label className="flex items-center justify-between gap-4 rounded-md border border-gray-100 bg-gray-50 px-4 py-3">
                        <div className="flex items-center gap-3">
                            <input
                                type="radio"
                                name="new-note-trigger"
                                checked={bindings.new_note_trigger === 'shortcut'}
                                onChange={() => applyNewNoteTrigger('shortcut')}
                            />
                            <div>
                                <p className="text-sm font-semibold text-gray-800">カスタムキー</p>
                                <p className="text-xs text-gray-500">{formatShortcutLabel(bindings.new_note)}</p>
                            </div>
                        </div>
                        <Button variant="outline" size="sm" onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            beginCapture('new_note')
                        }}>
                            変更
                        </Button>
                    </label>

                    <label className="flex items-start gap-3 rounded-md border border-gray-100 px-4 py-3">
                        <input
                            type="radio"
                            name="new-note-trigger"
                            className="mt-1"
                            checked={bindings.new_note_trigger === 'double_ctrl'}
                            onChange={() => applyNewNoteTrigger('double_ctrl')}
                        />
                        <div>
                            <p className="text-sm font-semibold text-gray-800">Ctrl 2回押し</p>
                            <p className="text-xs text-gray-500 mt-1">※ 2回押しは他のアプリとキーを奪い合いません（同じ操作を使うアプリがあると両方反応します）</p>
                        </div>
                    </label>

                    <label className="flex items-start gap-3 rounded-md border border-gray-100 px-4 py-3">
                        <input
                            type="radio"
                            name="new-note-trigger"
                            className="mt-1"
                            checked={bindings.new_note_trigger === 'double_shift'}
                            onChange={() => applyNewNoteTrigger('double_shift')}
                        />
                        <div>
                            <p className="text-sm font-semibold text-gray-800">Shift 2回押し</p>
                            <p className="text-xs text-gray-500 mt-1">※ 2回押しは他のアプリとキーを奪い合いません（同じ操作を使うアプリがあると両方反応します）</p>
                        </div>
                    </label>
                </div>

                <HotkeyShortcutRow
                    title="表示切替"
                    description="すべての付箋の表示/非表示を切り替えます。"
                    shortcut={bindings.toggle_visibility}
                    onChange={() => beginCapture('toggle_visibility')}
                />
                <HotkeyShortcutRow
                    title="整列"
                    description="タグごとに付箋を整列します。"
                    shortcut={bindings.arrange}
                    onChange={() => beginCapture('arrange')}
                />

                {captureAction && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <p className="text-sm font-bold text-blue-950">{HOTKEY_ACTION_LABELS[captureAction]} の変更</p>
                                <p className="text-sm text-blue-800 mt-1">
                                    {candidateShortcut ? formatShortcutLabel(candidateShortcut) : "押してください..."}
                                </p>
                                {message && (
                                    <p className={`mt-2 text-sm ${checkResult?.available ? 'text-green-700' : checkResult ? 'text-red-700' : 'text-blue-700'}`}>
                                        {message}
                                    </p>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <Button variant="ghost" size="sm" onClick={() => {
                                    setCaptureAction(null)
                                    setCandidateShortcut(null)
                                    setCheckResult(null)
                                    setMessage("")
                                }}>
                                    キャンセル
                                </Button>
                                <Button size="sm" disabled={!checkResult?.available || isSaving} onClick={applyShortcut}>
                                    {isSaving ? '保存中' : '保存'}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                {!captureAction && message && (
                    <p className="text-sm text-gray-600">{message}</p>
                )}
            </div>
        </div>
    )
}

async function syncSettingsStore(settings: AppSettings, saveSettings: (settings: AppSettings) => Promise<void>, bindings: HotkeyBindings) {
    await saveSettings({
        ...settings,
        shortcut_new_note: bindings.new_note,
        new_note_trigger: bindings.new_note_trigger,
        shortcut_toggle_visibility: bindings.toggle_visibility,
        shortcut_arrange: bindings.arrange,
    })
}

function HotkeyShortcutRow({ title, description, shortcut, onChange }: {
    title: string;
    description: string;
    shortcut: string;
    onChange: () => void;
}) {
    return (
        <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
                <Label className="text-base font-bold text-gray-900">{title}</Label>
                <p className="text-sm text-muted-foreground mt-1">{description}</p>
            </div>
            <div className="flex items-center gap-3">
                <code className="rounded-md border bg-gray-50 px-3 py-1.5 text-sm font-semibold text-gray-800">
                    {formatShortcutLabel(shortcut)}
                </code>
                <Button variant="outline" size="sm" onClick={onChange}>
                    変更
                </Button>
            </div>
        </div>
    )
}

function hotkeyCheckMessage(result: HotkeyCheckResult): string {
    if (result.reason === 'ok' || result.reason === 'self') return '✅ 使用できます'
    if (result.reason === 'reserved') return '❌ コピーや貼り付けなどの基本操作のため割り当てできません。'
    if (result.reason === 'internal' && result.conflict_action) {
        return `❌ このショートカットは「${HOTKEY_ACTION_LABELS[result.conflict_action]}」に割当済みです。`
    }
    return '❌ このショートカットは既に他のアプリまたはWindowsで使用されています。別のショートカットを選択してください。'
}

function GeneralSection({ settings, onUpdate, t }: SectionProps) {
    const [startupDistribution, setStartupDistribution] = useState<"unknown" | "desktop" | "msix">("unknown")
    const [startupState, setStartupState] = useState("desktop")
    const [startupMessage, setStartupMessage] = useState("")
    const startupDisabledByUserMessage = t('settings.general.autoStartDisabledByUser')

    useEffect(() => {
        let cancelled = false

        const loadStartupState = async () => {
            try {
                const { invoke } = await import("@tauri-apps/api/core")
                const distribution = await invoke<string>("fusen_get_distribution_info")
                if (cancelled) return

                if (distribution !== "msix") {
                    setStartupDistribution("desktop")
                    setStartupState("desktop")
                    return
                }

                const state = await invoke<string>("fusen_get_startup_state")
                if (cancelled) return
                setStartupDistribution("msix")
                setStartupState(state)
                setStartupMessage(state === "disabled_by_user"
                    ? startupDisabledByUserMessage
                    : "")
            } catch (e) {
                console.error("[AutoStart] Failed to load startup state:", e)
                if (!cancelled) setStartupDistribution("desktop")
            }
        }

        loadStartupState()
        return () => { cancelled = true }
    }, [startupDisabledByUserMessage])

    const autoStartChecked = startupDistribution === "msix"
        ? startupState === "enabled"
        : settings.auto_start

    const openStartupSettings = async () => {
        try {
            const { open } = await import("@tauri-apps/plugin-shell")
            await open("ms-settings:startupapps")
        } catch (e) {
            console.error("[AutoStart] Failed to open Windows startup settings:", e)
        }
    }

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
                        {startupMessage && (
                            <div className="pt-2">
                                <p className="text-sm text-amber-700">{startupMessage}</p>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="mt-2"
                                    onClick={openStartupSettings}
                                >
                                    <ExternalLink className="mr-2 h-4 w-4" />
                                    {t('settings.general.openWindowsStartupSettings')}
                                </Button>
                            </div>
                        )}
                    </div>
                    <Switch
                        checked={autoStartChecked}
                        disabled={startupDistribution === "unknown"}
                        onCheckedChange={async (val) => {
                            if (startupDistribution === "msix") {
                                try {
                                    const { invoke } = await import("@tauri-apps/api/core")
                                    const state = await invoke<string>("fusen_set_startup_enabled", { enabled: val })
                                    setStartupState(state)
                                    setStartupMessage(state === "disabled_by_user"
                                        ? t('settings.general.autoStartDisabledByUser')
                                        : "")
                                    onUpdate("auto_start", state === "enabled")
                                } catch (e) {
                                    console.error("[AutoStart] Failed to set MSIX startup task:", e)
                                }
                                return
                            }

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
    const [distribution, setDistribution] = React.useState<'msix' | 'desktop'>('desktop')

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

    React.useEffect(() => {
        import('@tauri-apps/api/core')
            .then(({ invoke }) => invoke<string>('fusen_get_distribution_info'))
            .then(distributionInfo => {
                setDistribution(distributionInfo === 'msix' ? 'msix' : 'desktop')
            })
            .catch(e => {
                console.error('Failed to get distribution info:', e)
                setDistribution('desktop')
            })
    }, [])

    const isMsix = distribution === 'msix'

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
                    <div className="h-16 w-16 overflow-hidden rounded-xl bg-slate-900 shadow-sm">
                        <img
                            src="/logo.png"
                            alt=""
                            aria-hidden="true"
                            className="h-full w-full object-cover"
                        />
                    </div>

                    {/* タイトルとバージョン */}
                    <div className="space-y-1">
                        <h3 className="font-bold text-xl leading-none">{t('settings.about.appName')}</h3>
                        <p className="text-sm text-muted-foreground">OreNoFusen</p>
                        <p className="text-xs text-muted-foreground pt-1">{t('settings.about.version')} {version}</p>
                        <p className="text-xs font-medium text-muted-foreground">
                            {isMsix ? t('settings.about.editionTrial') : t('settings.about.editionStandard')}
                        </p>
                    </div>
                </div>

                <div className="mt-6 space-y-4">
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        {t('settings.about.appDesc')}
                    </p>

                    {isMsix && (
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            {t('settings.about.trialNote')}
                        </p>
                    )}

                    <div className="space-y-2 pt-2">
                        {isMsix && (
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
                                <ExternalLink className="mr-3 h-5 w-5" />
                                {t('settings.about.getStandard')}
                            </Button>
                        )}
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

            {/* 関連リンク */}
            <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
                <h3 className="text-base font-bold text-gray-900 mb-1">{t('settings.about.relatedLinks')}</h3>
                <p className="text-xs text-gray-500 mb-4">{t('settings.about.relatedLinksDesc')}</p>
                <div className="grid sm:grid-cols-2 gap-2">
                    {[
                        { key: 'settings.about.links.manga', url: 'https://github.com/ore-no-fusen/ore-no-fusen/wiki' },
                        { key: 'settings.about.links.discussions', url: 'https://github.com/ore-no-fusen/ore-no-fusen/discussions' },
                        { key: 'settings.about.links.releases', url: 'https://github.com/ore-no-fusen/ore-no-fusen/releases/latest' },
                        { key: 'settings.about.links.docs', url: 'https://ore-no-fusen.github.io/ore-no-fusen/' },
                        { key: 'settings.about.links.privacy', url: 'https://ore-no-fusen.github.io/ore-no-fusen/100_PRIVACY.html' },
                        { key: 'settings.about.links.terms', url: 'https://ore-no-fusen.github.io/ore-no-fusen/101_TERMS.html' },
                    ].map((link) => (
                        <button
                            key={link.key}
                            type="button"
                            onClick={async () => {
                                try {
                                    const { open } = await import('@tauri-apps/plugin-shell')
                                    await open(link.url)
                                } catch (e) {
                                    console.error('Failed to open link:', e)
                                    window.open(link.url, '_blank')
                                }
                            }}
                            className="rounded-md border border-slate-200 bg-white px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-50 transition-colors"
                        >
                            <ExternalLink className="h-4 w-4 shrink-0 text-slate-500" />
                            <span className="flex-1 text-sm font-medium text-slate-900">{t(link.key)}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    )
}

/**
 * ステップ用ミニ絵: 付箋 + Ctrl+N キー / ピン留め / iPhoneへ送る
 * SVG ベースで lucide のアイコンと組み合わせる軽量な装飾。
 */
function StepIllustration({ kind }: { kind: 'write' | 'pin' | 'iphone' }) {
    if (kind === 'write') {
        return (
            <svg viewBox="0 0 120 80" className="h-16 w-24" aria-hidden="true">
                {/* 既存の付箋 */}
                <rect x="6" y="14" width="58" height="52" rx="2" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="1.5" />
                <line x1="14" y1="32" x2="50" y2="32" stroke="#92400E" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="14" y1="40" x2="44" y2="40" stroke="#92400E" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="14" y1="48" x2="48" y2="48" stroke="#92400E" strokeWidth="1.5" strokeLinecap="round" />
                {/* + ボタンと指差し矢印 */}
                <g>
                    <circle cx="58" cy="16" r="9" fill="#1F2937" />
                    <line x1="54" y1="16" x2="62" y2="16" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
                    <line x1="58" y1="12" x2="58" y2="20" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
                </g>
                {/* 新しく出てくる付箋（うっすら） */}
                <rect x="74" y="28" width="40" height="40" rx="2" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="1.5" opacity="0.55" transform="rotate(6 94 48)" />
                {/* 矢印 */}
                <path d="M68 22 Q 76 14 84 26" stroke="#16A34A" strokeWidth="2" fill="none" strokeLinecap="round" />
                <path d="M81 23 L 86 26 L 82 30" stroke="#16A34A" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        );
    }
    if (kind === 'pin') {
        return (
            <svg viewBox="0 0 120 80" className="h-16 w-24" aria-hidden="true">
                <rect x="14" y="22" width="60" height="40" rx="2" fill="#DBEAFE" stroke="#3B82F6" strokeWidth="1.5" transform="rotate(-3 44 42)" />
                <rect x="36" y="14" width="50" height="40" rx="2" fill="#FECACA" stroke="#EF4444" strokeWidth="1.5" transform="rotate(4 61 34)" />
                {/* 画鋲（ピン）の絵 */}
                <g transform="translate(86 6) rotate(20)">
                    <circle cx="6" cy="6" r="6" fill="#FBBF24" stroke="#92400E" strokeWidth="1.2" />
                    <circle cx="6" cy="6" r="2" fill="#92400E" />
                    <line x1="6" y1="11" x2="6" y2="22" stroke="#475569" strokeWidth="1.8" strokeLinecap="round" />
                </g>
                {/* 「最前面」マーク */}
                <text x="96" y="62" fontSize="8" fill="#475569" fontWeight="700">TOP</text>
            </svg>
        );
    }
    // iphone
    return (
        <svg viewBox="0 0 140 80" className="h-16 w-28" aria-hidden="true">
            <rect x="10" y="20" width="44" height="40" rx="2" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="1.5" transform="rotate(-3 32 40)" />
            <line x1="18" y1="34" x2="46" y2="32" stroke="#92400E" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="18" y1="42" x2="42" y2="40" stroke="#92400E" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M62 40 L88 40 M82 34 L88 40 L82 46" stroke="#16A34A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <rect x="98" y="14" width="28" height="52" rx="6" fill="#1F2937" />
            <rect x="101" y="20" width="22" height="40" rx="2" fill="#F9FAFB" />
            <rect x="104" y="24" width="16" height="6" rx="1" fill="#FEF3C7" />
            <rect x="104" y="33" width="16" height="6" rx="1" fill="#BBF7D0" opacity="0.8" />
            <rect x="104" y="42" width="16" height="6" rx="1" fill="#DBEAFE" opacity="0.6" />
        </svg>
    );
}

function HelpSection({ t }: { t: (key: any) => string }) {
    const onboardingSteps = [
        {
            kind: 'write' as const,
            title: t('settings.help.onboarding.step1.title'),
            body: t('settings.help.onboarding.step1.body'),
            hint: t('settings.help.onboarding.step1.hint'),
        },
        {
            kind: 'pin' as const,
            title: t('settings.help.onboarding.step2.title'),
            body: t('settings.help.onboarding.step2.body'),
            hint: t('settings.help.onboarding.step2.hint'),
        },
        {
            kind: 'iphone' as const,
            title: t('settings.help.onboarding.step3.title'),
            body: t('settings.help.onboarding.step3.body'),
            hint: t('settings.help.onboarding.step3.hint'),
        },
    ];

    const goals = [
        {
            icon: <Sparkles className="h-5 w-5" />,
            tone: 'amber' as const,
            label: t('settings.help.goals.write.label'),
            body: t('settings.help.goals.write.body'),
        },
        {
            icon: <Pin className="h-5 w-5" />,
            tone: 'rose' as const,
            label: t('settings.help.goals.keep.label'),
            body: t('settings.help.goals.keep.body'),
        },
        {
            icon: <Smartphone className="h-5 w-5" />,
            tone: 'emerald' as const,
            label: t('settings.help.goals.iphone.label'),
            body: t('settings.help.goals.iphone.body'),
        },
        {
            icon: <Search className="h-5 w-5" />,
            tone: 'sky' as const,
            label: t('settings.help.goals.findLater.label'),
            body: t('settings.help.goals.findLater.body'),
        },
        {
            icon: <AlertCircle className="h-5 w-5" />,
            tone: 'slate' as const,
            label: t('settings.help.goals.trouble.label'),
            body: t('settings.help.goals.trouble.body'),
        },
    ];

    const contextRows = [
        ['settings.help.contextTable.openFolder.action', 'settings.help.contextTable.openFolder.when'],
        ['settings.help.contextTable.newNote.action', 'settings.help.contextTable.newNote.when'],
        ['settings.help.contextTable.duplicate.action', 'settings.help.contextTable.duplicate.when'],
        ['settings.help.contextTable.color.action', 'settings.help.contextTable.color.when'],
        ['settings.help.contextTable.tags.action', 'settings.help.contextTable.tags.when'],
        ['settings.help.contextTable.alarm.action', 'settings.help.contextTable.alarm.when'],
        ['settings.help.contextTable.iphone.action', 'settings.help.contextTable.iphone.when'],
        ['settings.help.contextTable.archive.action', 'settings.help.contextTable.archive.when'],
        ['settings.help.contextTable.help.action', 'settings.help.contextTable.help.when'],
        ['settings.help.contextTable.delete.action', 'settings.help.contextTable.delete.when'],
    ];
    const shortcutRows = [
        ['settings.help.shortcutTable.newNote.keys', 'settings.help.shortcutTable.newNote.action'],
        ['settings.help.shortcutTable.delete.keys', 'settings.help.shortcutTable.delete.action'],
        ['settings.help.shortcutTable.capture.keys', 'settings.help.shortcutTable.capture.action'],
        ['settings.help.shortcutTable.paste.keys', 'settings.help.shortcutTable.paste.action'],
        ['settings.help.shortcutTable.save.keys', 'settings.help.shortcutTable.save.action'],
    ];
    const troubleRows = [
        ['settings.help.troubleTable.iphone.issue', 'settings.help.troubleTable.iphone.check'],
        ['settings.help.troubleTable.photos.issue', 'settings.help.troubleTable.photos.check'],
        ['settings.help.troubleTable.drive.issue', 'settings.help.troubleTable.drive.check'],
        ['settings.help.troubleTable.deleted.issue', 'settings.help.troubleTable.deleted.check'],
    ];

    const goalToneStyle: Record<'amber' | 'rose' | 'emerald' | 'sky' | 'slate', { dot: string; iconBg: string; iconText: string; }> = {
        amber: { dot: 'bg-amber-400', iconBg: 'bg-amber-100', iconText: 'text-amber-700' },
        rose: { dot: 'bg-rose-400', iconBg: 'bg-rose-100', iconText: 'text-rose-700' },
        emerald: { dot: 'bg-emerald-400', iconBg: 'bg-emerald-100', iconText: 'text-emerald-700' },
        sky: { dot: 'bg-sky-400', iconBg: 'bg-sky-100', iconText: 'text-sky-700' },
        slate: { dot: 'bg-slate-400', iconBg: 'bg-slate-100', iconText: 'text-slate-700' },
    };

    return (
        <div className="space-y-8">
            <div className="mb-2">
                <h2 className="text-3xl font-black tracking-tight text-gray-900 mb-2">{t('settings.help.title')}</h2>
                <p className="text-gray-500 text-sm">{t('settings.help.description')}</p>
            </div>
            <Separator />

            {/* ===== B案: 最初の5分（縦並びオンボーディング） ===== */}
            <section>
                <div className="mb-4">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">{t('settings.help.onboarding.title')}</span>
                    </div>
                    <p className="mt-1 text-base font-bold text-slate-900">{t('settings.help.onboarding.subtitle')}</p>
                </div>

                <ol className="space-y-3">
                    {onboardingSteps.map((step, index) => (
                        <li
                            key={step.title}
                            className="relative rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                        >
                            <div className="flex items-start gap-5">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
                                    {index + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-lg font-bold text-slate-900">{step.title}</h3>
                                    <p className="mt-2 text-sm leading-7 text-slate-600">{step.body}</p>
                                    <p className="mt-2 text-xs text-slate-400">{step.hint}</p>
                                </div>
                                <div className="hidden sm:flex shrink-0 items-center justify-center">
                                    <StepIllustration kind={step.kind} />
                                </div>
                            </div>
                        </li>
                    ))}
                </ol>
            </section>

            {/* ===== A案: やりたいことから探す（アコーディオン） ===== */}
            <section>
                <div className="mb-4">
                    <span className="text-xs font-bold uppercase tracking-[0.2em] text-sky-700">{t('settings.help.goals.title')}</span>
                    <p className="mt-1 text-base font-bold text-slate-900">{t('settings.help.goals.subtitle')}</p>
                </div>

                <div className="space-y-2">
                    {goals.map((goal) => {
                        const tone = goalToneStyle[goal.tone];
                        return (
                            <details
                                key={goal.label}
                                className="group rounded-lg border border-slate-200 bg-white open:border-slate-300 open:shadow-sm transition-all"
                            >
                                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 hover:bg-slate-50/70 rounded-lg">
                                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${tone.iconBg} ${tone.iconText}`}>
                                        {goal.icon}
                                    </span>
                                    <span className="flex-1 text-sm font-bold text-slate-900">{goal.label}</span>
                                    <ChevronRight className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-90" />
                                </summary>
                                <div className="px-4 pb-4 pt-1 pl-16">
                                    <p className="text-sm leading-7 text-slate-600">{goal.body}</p>
                                </div>
                            </details>
                        );
                    })}
                </div>
            </section>

            <Separator />

            {/* ===== 既存の参照テーブル群（情報を求める人向けに残す） ===== */}
            <HelpTable
                title={t('settings.help.contextTable.title')}
                firstHeader={t('settings.help.table.action')}
                secondHeader={t('settings.help.table.when')}
                rows={contextRows.map(([action, when]) => [t(action), t(when)])}
            />

            <HelpTable
                title={t('settings.help.shortcutTable.title')}
                firstHeader={t('settings.help.table.keys')}
                secondHeader={t('settings.help.table.action')}
                rows={shortcutRows.map(([keys, action]) => [t(keys), t(action)])}
            />

            <HelpTable
                title={t('settings.help.troubleTable.title')}
                firstHeader={t('settings.help.table.issue')}
                secondHeader={t('settings.help.table.check')}
                rows={troubleRows.map(([issue, check]) => [t(issue), t(check)])}
                tone="amber"
            />

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
                <h3 className="font-bold text-amber-900">{t('settings.help.trouble.title')}</h3>
                <p className="mt-1 text-sm leading-6 text-amber-800">{t('settings.help.trouble.body')}</p>
            </div>

            {/* ===== 完全版ユーザーガイドへの導線（最下部・もっと詳しく見たい人向け） ===== */}
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h3 className="font-bold text-sky-900">{t('settings.help.fullGuide.title')}</h3>
                    <p className="mt-1 text-sm leading-6 text-sky-800">{t('settings.help.fullGuide.body')}</p>
                </div>
                <button
                    type="button"
                    onClick={async () => {
                        try {
                            const { open } = await import('@tauri-apps/plugin-shell');
                            await open('https://ore-no-fusen.github.io/ore-no-fusen/user-guide/');
                        } catch (e) {
                            console.error('[HelpSection] open user guide failed:', e);
                            window.open('https://ore-no-fusen.github.io/ore-no-fusen/user-guide/', '_blank');
                        }
                    }}
                    className="shrink-0 rounded-md bg-sky-700 px-4 py-2 text-sm font-bold text-white hover:bg-sky-800 transition-colors"
                >
                    {t('settings.help.fullGuide.link')}
                </button>
            </div>
        </div>
    )
}

// --- フィードバックセクション ---
function HelpTable({
    title,
    firstHeader,
    secondHeader,
    rows,
    tone = 'slate',
}: {
    title: string;
    firstHeader: string;
    secondHeader: string;
    rows: string[][];
    tone?: 'slate' | 'amber';
}) {
    const borderClass = tone === 'amber' ? 'border-amber-200' : 'border-slate-200';
    const headerClass = tone === 'amber' ? 'bg-amber-50 text-amber-950' : 'bg-slate-50 text-slate-900';

    return (
        <div className={`rounded-lg border ${borderClass} bg-white p-5`}>
            <h3 className="mb-4 text-base font-bold text-slate-900">{title}</h3>
            <div className={`overflow-hidden rounded-md border ${borderClass}`}>
                <table className="w-full table-fixed border-collapse text-sm">
                    <thead className={headerClass}>
                        <tr>
                            <th className="w-40 px-4 py-3 text-left font-bold">{firstHeader}</th>
                            <th className="px-4 py-3 text-left font-bold">{secondHeader}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(([first, second]) => (
                            <tr key={`${first}-${second}`} className="border-t border-slate-200">
                                <td className="break-words px-4 py-3 font-medium text-slate-900">{first}</td>
                                <td className="break-words px-4 py-3 leading-6 text-slate-600">{second}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

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
            const apiUrl = `${getFeedbackApiBaseUrl()}/conversation/messages`;
            const conversationIdentity = getOrCreateFeedbackConversationIdentity();

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
                    version: appVersion,
                    conversationId: conversationIdentity.conversationId,
                    secretToken: conversationIdentity.secretToken,
                }),
            });

            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }

            const result = await response.json().catch(() => null);
            if (result?.conversationId && result?.secretToken) {
                saveFeedbackConversationIdentity({
                    conversationId: result.conversationId,
                    secretToken: result.secretToken,
                });
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

type BoardMessage = {
    messageId: string;
    authorType: 'user' | 'developer';
    body: string;
    createdAt: string;
    readByUser: boolean;
};

function getFeedbackApiTargetLabel(apiBaseUrl: string): string {
    if (apiBaseUrl.includes('localhost') || apiBaseUrl.includes('127.0.0.1')) return 'local'
    if (apiBaseUrl.includes('git-develop')) return 'develop'
    if (apiBaseUrl.includes('ore-no-fusen.vercel.app')) return 'production'
    if (apiBaseUrl.includes('vercel.app')) return 'preview'
    return 'custom'
}

function DeveloperConversationSection() {
    const conversationIdentity = useMemo(() => getOrCreateFeedbackConversationIdentity(), [])
    const feedbackApiBaseUrl = getFeedbackApiBaseUrl()
    const feedbackApiTargetLabel = getFeedbackApiTargetLabel(feedbackApiBaseUrl)
    const [messages, setMessages] = useState<BoardMessage[]>([])
    const [draft, setDraft] = useState('')
    const [loading, setLoading] = useState(false)
    const [sending, setSending] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const loadMessages = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const nextMessages = await pollFeedbackConversationMessages(conversationIdentity)
            setMessages(nextMessages)

            const unreadDeveloperMessageIds = getUnreadDeveloperReplyIds(nextMessages)

            if (unreadDeveloperMessageIds.length > 0) {
                setFeedbackConversationUnreadState(true)
                requestAnimationFrame(() => {
                    ackFeedbackConversationMessages(conversationIdentity, unreadDeveloperMessageIds)
                        .then((success) => {
                            if (success) setFeedbackConversationUnreadState(false)
                        })
                        .catch(() => { })
                })
            } else {
                setFeedbackConversationUnreadState(hasUnreadDeveloperReply(nextMessages))
            }
        } catch (e) {
            setError(String(e))
        } finally {
            setLoading(false)
        }
    }, [conversationIdentity])

    useEffect(() => {
        loadMessages()
    }, [loadMessages])

    const sendMessage = async () => {
        const content = draft.trim()
        if (!content) return

        setSending(true)
        setError(null)
        try {
            const response = await fetch(`${getFeedbackApiBaseUrl()}/conversation/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...conversationIdentity,
                    type: 'message',
                    content,
                    contact: '',
                    systemInfo: 'User opened settings board',
                    version: 'Unknown',
                }),
            })
            if (!response.ok) throw new Error(`Server error: ${response.status}`)
            const result = await response.json().catch(() => null)
            if (result?.conversationId && result?.secretToken) {
                saveFeedbackConversationIdentity({
                    conversationId: result.conversationId,
                    secretToken: result.secretToken,
                })
            }
            setDraft('')
            await loadMessages()
        } catch (e) {
            setError(String(e))
        } finally {
            setSending(false)
        }
    }

    return (
        <div className="max-w-4xl space-y-6">
            <div>
                <h2 className="text-3xl font-black tracking-tight text-gray-900 mb-2">開発者とのやりとり</h2>
                <p className="text-gray-500 text-sm">返信はここにだけ表示されます。付箋として自動表示されることはありません。</p>
                <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                        <span>
                            接続先: <span className="font-semibold text-slate-900">{feedbackApiTargetLabel}</span>
                        </span>
                        <span className="break-all">
                            会話ID: <span className="font-mono text-slate-900">{conversationIdentity.conversationId}</span>
                        </span>
                    </div>
                    <div className="mt-1 break-all font-mono text-[11px] text-slate-500">{feedbackApiBaseUrl}</div>
                </div>
            </div>

            <div className="border rounded-lg overflow-hidden bg-white">
                <div className="min-h-[320px] max-h-[460px] overflow-y-auto p-5 space-y-4 bg-slate-50">
                    {loading && messages.length === 0 ? (
                        <div className="text-sm text-gray-500">読み込み中...</div>
                    ) : messages.length === 0 ? (
                        <div className="rounded-md border border-dashed bg-white p-6 text-sm text-gray-500">
                            まだやりとりはありません。下の入力欄からメッセージを送れます。
                        </div>
                    ) : (
                        messages.map((message) => (
                            <div
                                key={message.messageId}
                                className={`flex ${message.authorType === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                <div className={`max-w-[78%] rounded-lg border px-4 py-3 text-sm leading-6 ${message.authorType === 'user'
                                    ? 'bg-gray-900 text-white border-gray-900'
                                    : 'bg-white text-gray-900 border-gray-200'
                                    }`}>
                                    <div className={`text-xs font-bold mb-1 ${message.authorType === 'user' ? 'text-gray-300' : 'text-gray-500'}`}>
                                        {message.authorType === 'user' ? 'ユーザー' : 'アプリ開発者'}
                                    </div>
                                    <div className="whitespace-pre-wrap break-words">{message.body}</div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="border-t p-4 space-y-3">
                    {error && (
                        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                            通信に失敗しました。時間をおいて再試行してください。
                        </div>
                    )}
                    <textarea
                        className="flex min-h-[96px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        placeholder="開発者に伝えたいことを書いてください"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                    />
                    <div className="flex justify-between items-center">
                        <Button variant="outline" onClick={loadMessages} disabled={loading || sending}>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            更新
                        </Button>
                        <Button onClick={sendMessage} disabled={sending || !draft.trim()}>
                            <Send className="mr-2 h-4 w-4" />
                            {sending ? '送信中...' : '送信'}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}

// --- 管理者ツール（Advanced） ---
type PcDeviceItem = {
    pcId: string;
    pcName: string;
    registeredAt: string;
    updatedAt: string;
    googleAccountEmail?: string;
};

function shortDeviceId(id?: string | null) {
    return id ? id.slice(-8) : 'unknown'
}

type PushDeviceItem = {
    device_id: string;
    endpoint: string;
    registered_at: string;
    device_name?: string;
    google_account_email?: string;
    google_account_name?: string;
};

type DriveQueueCounts = { to_iphone: number; from_iphone: number };

function AdvancedSection({ settings, t }: { settings: AppSettings; t: (key: any) => string }) {
    const [driveFolderLoading, setDriveFolderLoading] = useState(false)

    // 接続状態
    const [connLoading, setConnLoading] = useState(false)
    const [connError, setConnError] = useState<string | null>(null)
    const [pcs, setPcs] = useState<PcDeviceItem[] | null>(null)
    const [iphones, setIphones] = useState<PushDeviceItem[] | null>(null)
    const [queueCounts, setQueueCounts] = useState<DriveQueueCounts | null>(null)
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

    const [deletingId, setDeletingId] = useState<string | null>(null)

    // JSON ビューア
    const [jsonViewer, setJsonViewer] = useState<{
        titleKey: string;
        filename: string;
        fallback?: string;
    } | null>(null)
    const [jsonText, setJsonText] = useState<string>('')
    const [jsonLoading, setJsonLoading] = useState(false)
    const [jsonError, setJsonError] = useState<string | null>(null)
    const [jsonCopied, setJsonCopied] = useState(false)
    const [queueDeleting, setQueueDeleting] = useState<'to_iphone' | 'from_iphone' | null>(null)

    const [discordIngestSecret, setDiscordIngestSecret] = useState(() => getStoredDiscordIngestSecret())
    const [shouldSaveDiscordIngestSecret, setShouldSaveDiscordIngestSecret] = useState(() => getStoredDiscordIngestSecret() !== '')
    const [discordIngestLoading, setDiscordIngestLoading] = useState(false)
    const [discordIngestResult, setDiscordIngestResult] = useState<{
        ingested: number;
        rejected: Array<{ discordMessageId: string; reason: string }>;
    } | null>(null)
    const [discordIngestError, setDiscordIngestError] = useState<string | null>(null)
    const [feedbackUnreadCheckLoading, setFeedbackUnreadCheckLoading] = useState(false)
    const [feedbackUnreadCheckResult, setFeedbackUnreadCheckResult] = useState<{
        unreadCount: number;
        hasUnread: boolean;
    } | null>(null)
    const [feedbackUnreadCheckError, setFeedbackUnreadCheckError] = useState<string | null>(null)

    const openJsonViewer = (titleKey: string, filename: string, fallback?: string) => {
        setJsonViewer({ titleKey, filename, fallback })
    }

    const closeJsonViewer = () => {
        setJsonViewer(null)
        setJsonText('')
        setJsonError(null)
        setJsonCopied(false)
    }

    const loadJson = async () => {
        if (!jsonViewer) return
        setJsonLoading(true)
        setJsonError(null)
        setJsonCopied(false)
        try {
            const { invoke } = await import('@tauri-apps/api/core')
            const text = await invoke<string>('fusen_read_drive_json', {
                filename: jsonViewer.filename,
                fallbackFilename: jsonViewer.fallback ?? null,
            })
            setJsonText(text)
        } catch (e) {
            console.error('[AdvancedSection] read drive json failed:', e)
            setJsonError(String(e))
        } finally {
            setJsonLoading(false)
        }
    }

    useEffect(() => {
        if (jsonViewer) loadJson()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jsonViewer])

    const copyJson = async () => {
        try {
            await navigator.clipboard.writeText(jsonText)
            setJsonCopied(true)
            setTimeout(() => setJsonCopied(false), 1500)
        } catch (e) {
            console.error('[AdvancedSection] copy json failed:', e)
        }
    }

    const deleteQueueJson = async (
        direction: 'to_iphone' | 'from_iphone',
        filename: string,
        fallback: string,
    ) => {
        const label = direction === 'from_iphone'
            ? 'PCへの未受信キュー'
            : 'iPhoneへの未送信キュー'
        const ok = window.confirm(
            `${label}を削除します。\n\nまだ届いていない付箋は復元できません。\n中身を確認してから削除することをおすすめします。\n\n削除しますか？`
        )
        if (!ok) return

        setQueueDeleting(direction)
        try {
            const { invoke } = await import('@tauri-apps/api/core')
            await invoke('fusen_delete_drive_queue_json', {
                filename,
                fallbackFilename: fallback,
            })
            await fetchConnectionStatus()
            if (jsonViewer?.filename === filename) {
                closeJsonViewer()
            }
        } catch (e) {
            console.error('[AdvancedSection] delete drive queue failed:', e)
            window.alert(`削除に失敗しました: ${String(e)}`)
        } finally {
            setQueueDeleting(null)
        }
    }

    const jsonFiles: Array<{ titleKey: string; filename: string; fallback?: string }> = [
        { titleKey: 'settings.advanced.external.viewJson.pcDevices', filename: 'pc_devices.json' },
        { titleKey: 'settings.advanced.external.viewJson.pushDevices', filename: 'push_devices.json' },
        { titleKey: 'settings.advanced.external.viewJson.pushKeys', filename: 'push_keys.json' },
        { titleKey: 'settings.advanced.external.viewJson.notesToIphone', filename: 'notes_to_iphone.json', fallback: 'fusen_note.json' },
        { titleKey: 'settings.advanced.external.viewJson.notesFromIphone', filename: 'notes_from_iphone.json', fallback: 'fusen_from_iphone.json' },
    ]

    // Drive 一時ファイル（旧 iPhone 連携タブから移動）
    const [driveTempSummary, setDriveTempSummary] = useState<DriveTempCleanupSummary | null>(null)
    const [driveTempLoading, setDriveTempLoading] = useState(false)
    const [driveTempMessage, setDriveTempMessage] = useState<string | null>(null)
    const [selectedDriveTempFileIds, setSelectedDriveTempFileIds] = useState<string[]>([])

    // 診断情報（コピー用）
    const [diagText, setDiagText] = useState<string>('')
    const [diagLoading, setDiagLoading] = useState(false)
    const [diagCopied, setDiagCopied] = useState(false)

    const buildDiagnostics = async () => {
        setDiagLoading(true)
        try {
            const { invoke } = await import('@tauri-apps/api/core')
            const { getVersion } = await import('@tauri-apps/api/app')

            // アプリバージョン
            let appVersion = '?'
            try { appVersion = await getVersion() } catch { /* ignore */ }

            // OS / バージョン / アーキ
            let osType = '?'; let osVer = '?'; let osArch = '?'
            try {
                const os = await import('@tauri-apps/plugin-os')
                osType = await os.type()
                osVer = await os.version()
                osArch = await os.arch()
            } catch { /* ignore */ }

            // base_path 実在
            const basePath = settings.base_path || ''
            let baseExists: boolean | null = null
            if (basePath.trim() !== '') {
                try {
                    baseExists = await invoke<boolean>('fusen_path_exists', { path: basePath })
                } catch { baseExists = null }
            }

            // 付箋ファイル数（base_path から）
            let noteCount: number | null = null
            if (baseExists) {
                try {
                    const notes = await invoke<unknown[]>('fusen_list_notes', { folderPath: basePath })
                    noteCount = notes.length
                } catch { noteCount = null }
            }

            // Drive 接続（pcs/iphones/queueCounts は接続状態セクションで取得済みのものを使う）
            let driveEmail: string | null = null
            try {
                const account = await invoke<{ emailAddress?: string }>('fusen_get_google_account')
                driveEmail = account?.emailAddress ?? null
            } catch { driveEmail = null }

            const lines = [
                '=== 俺の付箋 診断情報 ===',
                `アプリ: ${appVersion}`,
                `OS: ${osType} ${osVer} ${osArch}`,
                `言語: ${settings.language}`,
                `保存先: ${basePath || '(未設定)'}`,
                `保存先フォルダ実在: ${baseExists === null ? '(未確認)' : baseExists ? 'はい' : 'いいえ'}`,
                `付箋ファイル数: ${noteCount === null ? '(未取得)' : `${noteCount} 件`}`,
                `pc_id: ${settings.pc_id ?? '(未生成)'}`,
                `設定ファイル: %APPDATA%\\OreNoFusen\\settings.json`,
                `ログフォルダ: %LOCALAPPDATA%\\ore-no-fusen\\`,
                `Drive 接続: ${driveEmail ? `接続済み (${driveEmail})` : '未接続'}`,
                `登録 PC: ${pcs === null ? '(未取得)' : `${pcs.length} 台`}`,
                `登録 iPhone / iPad: ${iphones === null ? '(未取得)' : `${iphones.length} 台`}`,
                `iPhone への未送信: ${queueCounts === null ? '(未取得)' : `${queueCounts.to_iphone} 件`}`,
                `PC への未受信: ${queueCounts === null ? '(未取得)' : `${queueCounts.from_iphone} 件`}`,
                `取得時刻: ${new Date().toISOString()}`,
                '=========================',
            ]
            setDiagText(lines.join('\n'))
        } catch (e) {
            console.error('[AdvancedSection] build diagnostics failed:', e)
            setDiagText(`診断情報の取得に失敗しました: ${e}`)
        } finally {
            setDiagLoading(false)
        }
    }

    useEffect(() => {
        // 接続状態が取得されたら診断情報も自動で組み立てる
        if (!connLoading && pcs !== null && iphones !== null) {
            buildDiagnostics()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pcs, iphones, queueCounts, connLoading])

    const copyDiag = async () => {
        try {
            await navigator.clipboard.writeText(diagText)
            setDiagCopied(true)
            setTimeout(() => setDiagCopied(false), 1500)
        } catch (e) {
            console.error('[AdvancedSection] copy diag failed:', e)
        }
    }

    const loadDriveTempSummary = async () => {
        setDriveTempLoading(true)
        setDriveTempMessage(null)
        try {
            const { invoke } = await import('@tauri-apps/api/core')
            const summary = await invoke<DriveTempCleanupSummary>('fusen_list_drive_temp_files')
            setDriveTempSummary(summary)
            setSelectedDriveTempFileIds((ids) => ids.filter((id) => summary.files?.some((file) => file.id === id && file.canDelete)))
        } catch (e) {
            setDriveTempMessage('一時ファイルの確認に失敗しました: ' + String(e))
        } finally {
            setDriveTempLoading(false)
        }
    }

    const toggleDriveTempSelection = (file: DriveTempFileView) => {
        if (!file.canDelete) return
        setSelectedDriveTempFileIds((ids) =>
            ids.includes(file.id)
                ? ids.filter((id) => id !== file.id)
                : [...ids, file.id]
        )
    }

    const cleanupSelectedDriveTempFiles = async () => {
        const selectedCount = selectedDriveTempFileIds.length
        if (selectedCount === 0) return
        if (!confirm(`選択したDrive一時ファイル ${selectedCount} 個を削除します。\n\n設定ファイルやキューは削除しません。送受信中ではないことを確認してください。\n\n削除しますか？`)) return
        setDriveTempLoading(true)
        setDriveTempMessage(null)
        try {
            const { invoke } = await import('@tauri-apps/api/core')
            const summary = await invoke<DriveTempCleanupSummary>('fusen_cleanup_selected_drive_temp_files', {
                selectedFileIds: selectedDriveTempFileIds,
            })
            setDriveTempSummary(summary)
            setSelectedDriveTempFileIds([])
            setDriveTempMessage(`選択した一時ファイルを削除しました: ${summary.deletedCount} 個${summary.failedCount ? ` / 失敗 ${summary.failedCount} 個` : ''}`)
        } catch (e) {
            setDriveTempMessage('選択した一時ファイルの削除に失敗しました: ' + String(e))
        } finally {
            setDriveTempLoading(false)
        }
    }

    const cleanupDriveTempFiles = async () => {
        if (!driveTempSummary || driveTempSummary.oldCount === 0) return
        if (!confirm(`${driveTempSummary.retentionDays}日以上前の一時ファイル ${driveTempSummary.oldCount} 個を削除します。よろしいですか？`)) return
        setDriveTempLoading(true)
        setDriveTempMessage(null)
        try {
            const { invoke } = await import('@tauri-apps/api/core')
            const summary = await invoke<DriveTempCleanupSummary>('fusen_cleanup_drive_temp_files')
            setDriveTempSummary(summary)
            setSelectedDriveTempFileIds([])
            setDriveTempMessage(`削除しました: ${summary.deletedCount} 個${summary.failedCount ? ` / 失敗 ${summary.failedCount} 個` : ''}`)
        } catch (e) {
            setDriveTempMessage('一時ファイルの削除に失敗しました: ' + String(e))
        } finally {
            setDriveTempLoading(false)
        }
    }

    const deletePc = async (pcId: string, pcName: string) => {
        const confirmMsg = (t('settings.advanced.connection.deleteConfirm') as string).replace('{name}', pcName)
        if (!window.confirm(confirmMsg)) return
        setDeletingId(pcId)
        try {
            const { invoke } = await import('@tauri-apps/api/core')
            await invoke('fusen_delete_pc_device', { pcId })
            await fetchConnectionStatus()
        } catch (e) {
            console.error('[AdvancedSection] delete pc failed:', e)
            alert(`${t('settings.advanced.connection.deleteFailed')}: ${e}`)
        } finally {
            setDeletingId(null)
        }
    }

    const deleteIphone = async (deviceId: string, deviceName: string) => {
        const confirmMsg = (t('settings.advanced.connection.deleteConfirm') as string).replace('{name}', deviceName)
        if (!window.confirm(confirmMsg)) return
        setDeletingId(deviceId)
        try {
            const { invoke } = await import('@tauri-apps/api/core')
            await invoke('fusen_delete_push_device', { deviceId })
            await fetchConnectionStatus()
        } catch (e) {
            console.error('[AdvancedSection] delete iphone failed:', e)
            alert(`${t('settings.advanced.connection.deleteFailed')}: ${e}`)
        } finally {
            setDeletingId(null)
        }
    }

    const fetchConnectionStatus = async () => {
        setConnLoading(true)
        setConnError(null)
        try {
            const { invoke } = await import('@tauri-apps/api/core')
            const [pcList, iphoneList, counts] = await Promise.all([
                invoke<PcDeviceItem[]>('fusen_list_pc_devices'),
                invoke<PushDeviceItem[]>('fusen_list_push_devices'),
                invoke<DriveQueueCounts>('fusen_get_drive_queue_counts'),
            ])
            setPcs(pcList)
            setIphones(iphoneList)
            setQueueCounts(counts)
            setLastUpdated(new Date())
        } catch (e) {
            console.error('[AdvancedSection] fetch connection failed:', e)
            setConnError(String(e))
        } finally {
            setConnLoading(false)
        }
    }

    useEffect(() => {
        fetchConnectionStatus()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const formatTime = (d: Date) => {
        const pad = (n: number) => n.toString().padStart(2, '0')
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    }
    const formatDate = (iso: string) => {
        try {
            const d = new Date(iso)
            if (isNaN(d.getTime())) return iso
            return formatTime(d)
        } catch {
            return iso
        }
    }
    const thisPcRegistered = !!settings.pc_id && !!pcs?.some((pc) => pc.pcId === settings.pc_id)
    const duplicatePcNames = useMemo(() => {
        const counts = new Map<string, number>()
        for (const pc of pcs ?? []) {
            const name = pc.pcName || String(t('settings.advanced.connection.unnamed'))
            counts.set(name, (counts.get(name) ?? 0) + 1)
        }
        return Array.from(counts.entries()).filter(([, count]) => count > 1)
    }, [pcs, t])

    const openFolder = async (path: string | null | undefined, fallbackCommand?: string) => {
        try {
            const { invoke } = await import('@tauri-apps/api/core')
            if (fallbackCommand) {
                await invoke(fallbackCommand)
            } else if (path && path.trim() !== '') {
                await invoke('fusen_open_containing_folder', { path })
            }
        } catch (e) {
            console.error('[AdvancedSection] open folder failed:', e)
            alert(`フォルダを開けませんでした: ${e}`)
        }
    }

    const openUrl = async (url: string) => {
        try {
            const { open } = await import('@tauri-apps/plugin-shell')
            await open(url)
        } catch (e) {
            console.error('[AdvancedSection] open url failed:', e)
            window.open(url, '_blank')
        }
    }

    const openDriveFolder = async () => {
        setDriveFolderLoading(true)
        try {
            const { invoke } = await import('@tauri-apps/api/core')
            const folderId = await invoke<string>('fusen_get_drive_folder_id')
            await openUrl(`https://drive.google.com/drive/folders/${folderId}`)
        } catch (e) {
            console.error('[AdvancedSection] open drive folder failed:', e)
            alert(t('settings.advanced.external.driveFolderUnavailable'))
        } finally {
            setDriveFolderLoading(false)
        }
    }

    const runDiscordIngest = async () => {
        const secret = discordIngestSecret.trim()
        if (!secret) {
            setDiscordIngestError('ingest secret を入力してください。')
            setDiscordIngestResult(null)
            return
        }

        setDiscordIngestLoading(true)
        setDiscordIngestError(null)
        setDiscordIngestResult(null)
        try {
            const response = await fetch(`${getDeveloperFeedbackApiBaseUrl()}/discord/ingest`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${secret}`,
                },
            })
            const result = await response.json().catch(() => null) as {
                ingested?: number;
                rejected?: Array<{ discordMessageId: string; reason: string }>;
                error?: string;
            } | null
            if (!response.ok) {
                throw new Error(result?.error || `Server error: ${response.status}`)
            }
            setDiscordIngestResult({
                ingested: result?.ingested ?? 0,
                rejected: result?.rejected ?? [],
            })
        } catch (e) {
            setDiscordIngestError(String(e))
        } finally {
            setDiscordIngestLoading(false)
        }
    }

    const updateDiscordIngestSecret = (value: string) => {
        setDiscordIngestSecret(value)
        if (shouldSaveDiscordIngestSecret) {
            window.localStorage.setItem(DISCORD_INGEST_SECRET_STORAGE_KEY, value)
        }
    }

    const updateShouldSaveDiscordIngestSecret = (checked: boolean) => {
        setShouldSaveDiscordIngestSecret(checked)
        if (checked) {
            window.localStorage.setItem(DISCORD_INGEST_SECRET_STORAGE_KEY, discordIngestSecret)
        } else {
            window.localStorage.removeItem(DISCORD_INGEST_SECRET_STORAGE_KEY)
        }
    }

    const runFeedbackUnreadCheck = async () => {
        const identity = getFeedbackConversationIdentity()
        if (!identity) {
            setFeedbackUnreadCheckError('会話IDがまだありません。先に「開発者とのやりとり」からメッセージを送信してください。')
            setFeedbackUnreadCheckResult(null)
            return
        }

        setFeedbackUnreadCheckLoading(true)
        setFeedbackUnreadCheckError(null)
        setFeedbackUnreadCheckResult(null)
        try {
            const messages = await pollFeedbackConversationMessages(identity)
            const unreadDeveloperMessageIds = getUnreadDeveloperReplyIds(messages)
            const hasUnread = hasUnreadDeveloperReply(messages)
            setFeedbackConversationUnreadState(hasUnread)
            setFeedbackUnreadCheckResult({
                unreadCount: unreadDeveloperMessageIds.length,
                hasUnread,
            })
        } catch (e) {
            setFeedbackUnreadCheckError(String(e))
        } finally {
            setFeedbackUnreadCheckLoading(false)
        }
    }

    const notesPath = settings.base_path ?? ''
    const hasNotesPath = notesPath.trim() !== ''

    return (
        <div className="space-y-8">
            <div className="mb-2">
                <h2 className="text-3xl font-black tracking-tight text-gray-900 mb-2">{t('settings.advanced.title')}</h2>
                <p className="text-gray-500 text-sm">{t('settings.advanced.description')}</p>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 shrink-0 text-amber-700 mt-0.5" />
                <p className="text-sm leading-6 text-amber-900">{t('settings.advanced.warning')}</p>
            </div>

            {/* 📁 データの場所 */}
            <section>
                <div className="mb-4 flex items-center gap-2 text-slate-900">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 text-slate-700">
                        <HardDrive className="h-5 w-5" />
                    </div>
                    <h3 className="text-base font-bold">{t('settings.advanced.locations.title')}</h3>
                </div>
                <div className="space-y-2">
                    {/* 付箋フォルダ */}
                    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-900">{t('settings.advanced.locations.notes')}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{t('settings.advanced.locations.notesDesc')}</p>
                            <p className="text-xs text-slate-600 mt-1 font-mono break-all">
                                {hasNotesPath ? notesPath : t('settings.advanced.locations.notSet')}
                            </p>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={!hasNotesPath}
                            onClick={() => openFolder(notesPath)}
                            className="shrink-0"
                        >
                            <FolderOpen className="h-4 w-4 mr-1.5" />
                            {t('settings.advanced.locations.open')}
                        </Button>
                    </div>
                    {/* 設定フォルダ */}
                    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-900">{t('settings.advanced.locations.settings')}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{t('settings.advanced.locations.settingsDesc')}</p>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openFolder(null, 'fusen_open_settings_folder')}
                            className="shrink-0"
                        >
                            <FolderOpen className="h-4 w-4 mr-1.5" />
                            {t('settings.advanced.locations.open')}
                        </Button>
                    </div>
                    {/* ログフォルダ */}
                    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-900">{t('settings.advanced.locations.logs')}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{t('settings.advanced.locations.logsDesc')}</p>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openFolder(null, 'fusen_open_log_folder')}
                            className="shrink-0"
                        >
                            <FolderOpen className="h-4 w-4 mr-1.5" />
                            {t('settings.advanced.locations.open')}
                        </Button>
                    </div>
                </div>
            </section>

            {/* ☁️ 外部サービス */}
            <section>
                <div className="mb-4 flex items-center gap-2 text-slate-900">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 text-slate-700">
                        <Cloud className="h-5 w-5" />
                    </div>
                    <h3 className="text-base font-bold">{t('settings.advanced.external.title')}</h3>
                </div>
                <div className="space-y-2">
                    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-900">{t('settings.advanced.external.driveFolder')}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{t('settings.advanced.external.driveFolderDesc')}</p>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={driveFolderLoading}
                            onClick={openDriveFolder}
                            className="shrink-0"
                        >
                            <ExternalLink className="h-4 w-4 mr-1.5" />
                            {driveFolderLoading ? t('settings.advanced.external.opening') : t('settings.advanced.external.open')}
                        </Button>
                    </div>
                </div>

                {/* JSON ビューア */}
                <div className="mt-4">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                        {t('settings.advanced.external.viewJson.title')}
                    </p>
                    <div className="space-y-2">
                        {jsonFiles.map((f) => (
                            <div key={f.filename} className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 flex items-center gap-3">
                                <FileJson className="h-4 w-4 shrink-0 text-slate-500" />
                                <p className="flex-1 text-sm text-slate-700 min-w-0 truncate">{t(f.titleKey)}</p>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openJsonViewer(f.titleKey, f.filename, f.fallback)}
                                    className="shrink-0"
                                >
                                    {t('settings.advanced.external.viewJson.view')}
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* JSON モーダル */}
            {jsonViewer && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
                    onClick={closeJsonViewer}
                >
                    <div
                        className="bg-white rounded-xl shadow-2xl max-w-3xl w-[90vw] max-h-[85vh] flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* ヘッダ */}
                        <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-200">
                            <FileJson className="h-5 w-5 text-slate-600" />
                            <h3 className="flex-1 text-sm font-bold text-slate-900 min-w-0 truncate">
                                {t(jsonViewer.titleKey)}
                            </h3>
                            <button
                                type="button"
                                onClick={closeJsonViewer}
                                aria-label={t('settings.advanced.external.viewJson.close')}
                                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        {/* 本文 */}
                        <div className="flex-1 overflow-auto p-4 bg-slate-900">
                            {jsonLoading ? (
                                <p className="text-sm text-slate-400">{t('settings.advanced.external.viewJson.loading')}</p>
                            ) : jsonError ? (
                                <pre className="text-xs text-red-300 font-mono whitespace-pre-wrap break-all">{jsonError}</pre>
                            ) : (
                                <pre className="text-xs text-emerald-200 font-mono whitespace-pre-wrap break-all leading-6">{jsonText}</pre>
                            )}
                        </div>

                        {/* フッタ */}
                        <div className="flex items-center gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={loadJson}
                                disabled={jsonLoading}
                            >
                                <RefreshCw className={`h-4 w-4 mr-1.5 ${jsonLoading ? 'animate-spin' : ''}`} />
                                {t('settings.advanced.external.viewJson.refresh')}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={copyJson}
                                disabled={jsonLoading || !jsonText}
                            >
                                <Copy className="h-4 w-4 mr-1.5" />
                                {jsonCopied
                                    ? t('settings.advanced.external.viewJson.copied')
                                    : t('settings.advanced.external.viewJson.copy')}
                            </Button>
                            <div className="flex-1" />
                            <Button
                                variant="default"
                                size="sm"
                                onClick={closeJsonViewer}
                            >
                                {t('settings.advanced.external.viewJson.close')}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* 🩺 診断情報 */}
            <section>
                <div className="mb-4 flex items-center gap-2 text-slate-900">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 text-slate-700">
                        <Activity className="h-5 w-5" />
                    </div>
                    <h3 className="text-base font-bold flex-1">{t('settings.advanced.diagnostics.title')}</h3>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={buildDiagnostics}
                        disabled={diagLoading}
                    >
                        <RefreshCw className={`h-4 w-4 mr-1.5 ${diagLoading ? 'animate-spin' : ''}`} />
                        {diagLoading ? t('settings.advanced.diagnostics.loading') : t('settings.advanced.diagnostics.refresh')}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={copyDiag}
                        disabled={diagLoading || !diagText}
                    >
                        <Copy className="h-4 w-4 mr-1.5" />
                        {diagCopied
                            ? t('settings.advanced.diagnostics.copied')
                            : t('settings.advanced.diagnostics.copy')}
                    </Button>
                </div>
                <p className="text-xs text-slate-500 mb-2">{t('settings.advanced.diagnostics.description')}</p>
                <pre className="rounded-lg border border-slate-200 bg-slate-900 text-emerald-200 p-4 text-xs font-mono whitespace-pre-wrap break-all leading-6 max-h-72 overflow-auto">
                    {diagLoading && !diagText ? t('settings.advanced.diagnostics.loading') : diagText}
                </pre>
            </section>

            {/* 🔄 接続状態 */}
            <section>
                <div className="mb-4 flex items-center gap-2 text-slate-900">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 text-slate-700">
                        <RefreshCw className="h-5 w-5" />
                    </div>
                    <h3 className="text-base font-bold flex-1">{t('settings.advanced.connection.title')}</h3>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={fetchConnectionStatus}
                        disabled={connLoading}
                    >
                        <RefreshCw className={`h-4 w-4 mr-1.5 ${connLoading ? 'animate-spin' : ''}`} />
                        {connLoading ? t('settings.advanced.connection.loading') : t('settings.advanced.connection.refresh')}
                    </Button>
                </div>

                {connError ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                        <p className="font-bold mb-1">{t('settings.advanced.connection.fetchError')}</p>
                        <p className="text-xs text-amber-800">{t('settings.advanced.connection.notConnected')}</p>
                        <p className="text-xs text-amber-700 mt-2 font-mono break-all">{connError}</p>
                    </div>
                ) : (
                    <>
                        {/* 送受信キュー */}
                        <div className="rounded-lg border border-slate-200 bg-white px-5 py-4 mb-4">
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">{t('settings.advanced.queue.title')}</p>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2">
                                    <div className="flex items-center gap-3 min-w-0">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
                                        <Send className="h-5 w-5" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs text-slate-500 truncate">{t('settings.advanced.queue.toIphone')}</p>
                                        <p className="text-2xl font-black text-slate-900 leading-tight">
                                            {queueCounts ? queueCounts.to_iphone : '—'}
                                            <span className="text-xs text-slate-500 font-normal ml-1">{t('settings.advanced.queue.unit')}</span>
                                        </p>
                                    </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => openJsonViewer('settings.advanced.external.viewJson.notesToIphone', 'notes_to_iphone.json', 'fusen_note.json')}
                                            disabled={connLoading}
                                        >
                                            <FileJson className="h-3.5 w-3.5 mr-1" />
                                            中身
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => deleteQueueJson('to_iphone', 'notes_to_iphone.json', 'fusen_note.json')}
                                            disabled={connLoading || queueDeleting !== null || !queueCounts || queueCounts.to_iphone === 0}
                                            className="text-red-600 hover:text-red-700"
                                        >
                                            <Trash2 className="h-3.5 w-3.5 mr-1" />
                                            {queueDeleting === 'to_iphone' ? '削除中' : '削除'}
                                        </Button>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2">
                                    <div className="flex items-center gap-3 min-w-0">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-sky-50 text-sky-700">
                                        <Inbox className="h-5 w-5" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs text-slate-500 truncate">{t('settings.advanced.queue.fromIphone')}</p>
                                        <p className="text-2xl font-black text-slate-900 leading-tight">
                                            {queueCounts ? queueCounts.from_iphone : '—'}
                                            <span className="text-xs text-slate-500 font-normal ml-1">{t('settings.advanced.queue.unit')}</span>
                                        </p>
                                    </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => openJsonViewer('settings.advanced.external.viewJson.notesFromIphone', 'notes_from_iphone.json', 'fusen_from_iphone.json')}
                                            disabled={connLoading}
                                        >
                                            <FileJson className="h-3.5 w-3.5 mr-1" />
                                            中身
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => deleteQueueJson('from_iphone', 'notes_from_iphone.json', 'fusen_from_iphone.json')}
                                            disabled={connLoading || queueDeleting !== null || !queueCounts || queueCounts.from_iphone === 0}
                                            className="text-red-600 hover:text-red-700"
                                        >
                                            <Trash2 className="h-3.5 w-3.5 mr-1" />
                                            {queueDeleting === 'from_iphone' ? '削除中' : '削除'}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {pcs && !thisPcRegistered && (
                            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                <p className="font-bold">このPCはDrive上のPC一覧に登録されていません</p>
                                <p className="mt-1 leading-relaxed">
                                    iPhone / PWA から送った付箋がこのPCに届かない場合があります。設定の「iPhone連携」でPC側のDriveを再接続してください。
                                </p>
                                <p className="mt-2 font-mono text-xs text-amber-800">このPCのID: ...{shortDeviceId(settings.pc_id)}</p>
                            </div>
                        )}

                        {duplicatePcNames.length > 0 && (
                            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                <p className="font-bold">同じ名前のPCが複数登録されています</p>
                                <p className="mt-1 leading-relaxed">
                                    PWAでは名前だけだと区別しづらいため、送信先のID末尾も確認してください。古い登録は下のPC一覧から削除できます。
                                </p>
                                <p className="mt-2 text-xs text-amber-800">
                                    {duplicatePcNames.map(([name, count]) => `${name} (${count}件)`).join(' / ')}
                                </p>
                            </div>
                        )}

                        {/* PC 一覧 */}
                        <div className="rounded-lg border border-slate-200 bg-white px-5 py-4 mb-3">
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
                                {(t('settings.advanced.connection.pcs') as string).replace('{count}', String(pcs?.length ?? 0))}
                            </p>
                            {pcs && pcs.length > 0 ? (
                                <ul className="space-y-2">
                                    {pcs.map((pc) => (
                                        <li key={pc.pcId} className={`flex items-start gap-3 rounded-md px-3 py-2.5 ${pc.pcId === settings.pc_id ? 'bg-emerald-50 ring-1 ring-emerald-200' : 'bg-slate-50'}`}>
                                            <Laptop className={`h-5 w-5 shrink-0 mt-0.5 ${pc.pcId === settings.pc_id ? 'text-emerald-700' : 'text-slate-600'}`} />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-bold text-slate-900 truncate flex items-center gap-2">
                                                    <span className="truncate">{pc.pcName || t('settings.advanced.connection.unnamed')}</span>
                                                    {pc.pcId === settings.pc_id && (
                                                        <span className="shrink-0 inline-flex items-center rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
                                                            {t('settings.advanced.connection.thisPc')}
                                                        </span>
                                                    )}
                                                </p>
                                                <p className="text-xs text-slate-500 mt-0.5">
                                                    {pc.googleAccountEmail ? `${pc.googleAccountEmail} ・ ` : ''}
                                                    {t('settings.advanced.connection.registeredAt')}: {formatDate(pc.registeredAt)}
                                                </p>
                                                <p className="text-[10px] text-slate-400 mt-0.5 font-mono break-all">
                                                    ID: {pc.pcId} / 末尾 ...{shortDeviceId(pc.pcId)} / 更新: {formatDate(pc.updatedAt)}
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => deletePc(pc.pcId, pc.pcName || t('settings.advanced.connection.unnamed'))}
                                                disabled={deletingId === pc.pcId}
                                                title={t('settings.advanced.connection.deleteTooltip')}
                                                aria-label={t('settings.advanced.connection.deleteTooltip')}
                                                className="shrink-0 flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-sm text-slate-500 italic">{t('settings.advanced.connection.pcsEmpty')}</p>
                            )}
                        </div>

                        {/* iPhone 一覧 */}
                        <div className="rounded-lg border border-slate-200 bg-white px-5 py-4 mb-3">
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
                                {(t('settings.advanced.connection.iphones') as string).replace('{count}', String(iphones?.length ?? 0))}
                            </p>
                            {iphones && iphones.length > 0 ? (
                                <ul className="space-y-2">
                                    {iphones.map((d) => (
                                        <li key={d.device_id} className="flex items-start gap-3 rounded-md bg-slate-50 px-3 py-2.5">
                                            <Smartphone className="h-5 w-5 shrink-0 text-slate-600 mt-0.5" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-bold text-slate-900 truncate">{d.device_name || t('settings.advanced.connection.unnamed')}</p>
                                                <p className="text-xs text-slate-500 mt-0.5">
                                                    {d.google_account_email ? `${d.google_account_email}${d.google_account_name ? ` (${d.google_account_name})` : ''} ・ ` : ''}
                                                    {t('settings.advanced.connection.registeredAt')}: {formatDate(d.registered_at)}
                                                </p>
                                                <p className="text-[10px] text-slate-400 mt-0.5 font-mono break-all">
                                                    ID: {d.device_id}
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => deleteIphone(d.device_id, d.device_name || t('settings.advanced.connection.unnamed'))}
                                                disabled={deletingId === d.device_id}
                                                title={t('settings.advanced.connection.deleteTooltip')}
                                                aria-label={t('settings.advanced.connection.deleteTooltip')}
                                                className="shrink-0 flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-sm text-slate-500 italic">{t('settings.advanced.connection.iphonesEmpty')}</p>
                            )}
                        </div>

                        {lastUpdated && (
                            <p className="text-xs text-slate-400 text-right">
                                {t('settings.advanced.connection.lastUpdated')}: {formatTime(lastUpdated)}
                            </p>
                        )}
                    </>
                )}
            </section>

            {/* 🧹 Drive 一時ファイル */}
            <section>
                <div className="mb-4 flex items-center gap-2 text-slate-900">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 text-slate-700">
                        <Trash2 className="h-5 w-5" />
                    </div>
                    <h3 className="text-base font-bold flex-1">Drive 一時ファイル</h3>
                    <Button variant="outline" size="sm" onClick={loadDriveTempSummary} disabled={driveTempLoading}>
                        {driveTempLoading ? '確認中...' : '確認'}
                    </Button>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
                    <p className="text-xs text-slate-500">
                        送受信後に Drive に残った画像・動画の一時ファイルだけを確認・削除します。設定ファイルやキューは触りません。
                    </p>

                    {driveTempSummary && (
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-md border border-gray-100 bg-gray-50 px-4 py-3">
                                <div className="text-xs font-medium text-gray-500">残っている一時ファイル</div>
                                <div className="mt-1 text-2xl font-bold text-gray-900">
                                    {driveTempSummary.totalCount} 個
                                </div>
                                <div className="text-xs text-gray-400">{formatBytes(driveTempSummary.totalBytes)}</div>
                            </div>
                            <div className="rounded-md border border-gray-100 bg-gray-50 px-4 py-3">
                                <div className="text-xs font-medium text-gray-500">
                                    {driveTempSummary.retentionDays}日以上前の削除候補
                                </div>
                                <div className="mt-1 text-2xl font-bold text-gray-900">
                                    {driveTempSummary.oldCount} 個
                                </div>
                                <div className="text-xs text-gray-400">
                                    {formatBytes(driveTempSummary.oldBytes)}
                                    {driveTempSummary.skippedReferencedCount > 0 && ` / 使用中 ${driveTempSummary.skippedReferencedCount} 個は保護`}
                                </div>
                            </div>
                        </div>
                    )}

                    {driveTempSummary && driveTempSummary.files.length > 0 && (
                        <div className="rounded-md border border-slate-200 bg-slate-50">
                            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
                                <div>
                                    <p className="text-sm font-bold text-slate-900">削除するファイルを選択</p>
                                    <p className="text-xs text-slate-500">画像はサムネイルを表示します。使用中のファイルは保護されます。</p>
                                </div>
                                <p className="text-xs text-slate-500">
                                    選択中: {selectedDriveTempFileIds.length} 個
                                </p>
                            </div>
                            <div className="max-h-80 overflow-y-auto divide-y divide-slate-200">
                                {driveTempSummary.files.map((file) => {
                                    const selected = selectedDriveTempFileIds.includes(file.id)
                                    return (
                                        <label
                                            key={file.id}
                                            className={`flex gap-3 px-3 py-3 ${file.canDelete ? 'cursor-pointer hover:bg-white' : 'bg-slate-100/60'}`}
                                        >
                                            <input
                                                type="checkbox"
                                                className="mt-5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500 disabled:cursor-not-allowed disabled:opacity-40"
                                                checked={selected}
                                                disabled={!file.canDelete || driveTempLoading}
                                                onChange={() => toggleDriveTempSelection(file)}
                                            />
                                            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white">
                                                {file.previewDataUrl ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img src={file.previewDataUrl} alt="" className="h-full w-full object-cover" />
                                                ) : file.kind === 'video' ? (
                                                    <Video className="h-6 w-6 text-slate-400" />
                                                ) : file.kind === 'image' ? (
                                                    <ImageIcon className="h-6 w-6 text-slate-400" />
                                                ) : (
                                                    <FileText className="h-6 w-6 text-slate-400" />
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <p className="min-w-0 break-all text-sm font-semibold text-slate-900">{file.name}</p>
                                                    {file.isReferenced && (
                                                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">使用中・保護</span>
                                                    )}
                                                    {file.isOld && (
                                                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-600">{driveTempSummary.retentionDays}日以上前</span>
                                                    )}
                                                </div>
                                                {file.previewText && (
                                                    <p className="mt-1 max-h-10 overflow-hidden text-xs text-slate-600">{file.previewText}</p>
                                                )}
                                                <p className="mt-1 text-xs text-slate-500">
                                                    {formatBytes(file.size ?? 0)} ・ 更新: {formatDate(file.modifiedTime ?? '')}
                                                </p>
                                                {!file.canDelete && (
                                                    <p className="mt-1 text-xs text-amber-700">notes_to_iphone / notes_from_iphone から参照されているため削除しません。</p>
                                                )}
                                            </div>
                                        </label>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {!driveTempSummary && !driveTempLoading && (
                        <p className="text-sm text-slate-400 italic">「確認」を押すと一時ファイルの状況を取得します。</p>
                    )}

                    {driveTempSummary && (
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-xs text-gray-400">
                                対象: fusen_img_* / fusen_video_* のみ。notes_* と push_* は残します。
                            </p>
                            <div className="flex flex-wrap gap-2 sm:justify-end">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={cleanupSelectedDriveTempFiles}
                                    disabled={driveTempLoading || selectedDriveTempFileIds.length === 0}
                                    className="border-red-200 text-red-600 hover:bg-red-50"
                                >
                                    選択した一時ファイルを削除
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={cleanupDriveTempFiles}
                                    disabled={driveTempLoading || driveTempSummary.oldCount === 0}
                                    className="border-red-200 text-red-600 hover:bg-red-50"
                                >
                                    古い一時ファイルを削除
                                </Button>
                            </div>
                        </div>
                    )}

                    {driveTempMessage && (
                        <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-gray-600">{driveTempMessage}</p>
                    )}
                </div>
            </section>

            {/* 開発者専用 */}
            <section className="border-t border-slate-200 pt-8">
                <div className="mb-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-red-500">Developer Only</p>
                    <h3 className="mt-1 text-base font-bold text-slate-900">開発者専用</h3>
                    <p className="mt-1 text-xs text-slate-500">
                        アプリ開発者がVercel/Firebase/Discordの管理用secretを持っている場合だけ使う領域です。
                    </p>
                </div>

                <div className="mb-4 flex items-center gap-2 text-slate-900">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-red-50 text-red-700">
                        <Inbox className="h-5 w-5" />
                    </div>
                    <h4 className="text-base font-bold">Discord返信取り込み</h4>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50/40 px-5 py-4 space-y-4">
                    <div>
                        <p className="text-sm font-bold text-slate-900">手動ingest</p>
                        <p className="text-xs text-slate-600 mt-1">
                            Discordの開発者返信を、現在のフィードバックAPIへ手動で取り込みます。secretは保存されません。
                        </p>
                    </div>
                    <div className="flex items-end gap-3">
                        <div className="flex-1 min-w-0">
                            <Label htmlFor="discord-ingest-secret" className="text-xs font-bold text-slate-600">
                                ingest secret
                            </Label>
                            <Input
                                id="discord-ingest-secret"
                                type="password"
                                value={discordIngestSecret}
                                onChange={(e) => updateDiscordIngestSecret(e.target.value)}
                                placeholder="FEEDBACK_CONVERSATION_INGEST_SECRET"
                                className="mt-1 bg-white"
                            />
                            <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                                <input
                                    type="checkbox"
                                    checked={shouldSaveDiscordIngestSecret}
                                    onChange={(e) => updateShouldSaveDiscordIngestSecret(e.target.checked)}
                                    className="h-4 w-4 rounded border-slate-300"
                                />
                                このPCにingest secretを保存する
                            </label>
                        </div>
                        <Button
                            variant="outline"
                            onClick={runDiscordIngest}
                            disabled={discordIngestLoading}
                            className="shrink-0 bg-white"
                        >
                            <RefreshCw className={`h-4 w-4 mr-1.5 ${discordIngestLoading ? 'animate-spin' : ''}`} />
                            {discordIngestLoading ? '取り込み中' : '取り込み実行'}
                        </Button>
                    </div>
                    {discordIngestError && (
                        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                            {discordIngestError}
                        </div>
                    )}
                    {discordIngestResult && (
                        <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                            <p className="font-bold text-slate-900">取り込み: {discordIngestResult.ingested} 件</p>
                            <p className="mt-1 text-xs text-slate-500">
                                rejected: {discordIngestResult.rejected.length} 件
                            </p>
                            {discordIngestResult.rejected.length > 0 && (
                                <pre className="mt-2 max-h-32 overflow-auto rounded bg-slate-50 p-2 text-xs font-mono text-slate-600">
                                    {JSON.stringify(discordIngestResult.rejected.slice(0, 10), null, 2)}
                                </pre>
                            )}
                        </div>
                    )}
                </div>

                <div className="mt-6 mb-4 flex items-center gap-2 text-slate-900">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-red-50 text-red-700">
                        <RefreshCw className="h-5 w-5" />
                    </div>
                    <h4 className="text-base font-bold">開発者返信の未読チェック</h4>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50/40 px-5 py-4 space-y-4">
                    <div>
                        <p className="text-sm font-bold text-slate-900">手動未読チェック</p>
                        <p className="text-xs text-slate-600 mt-1">
                            現在のPCの会話IDで返信を確認し、右クリックメニュー用の新着状態だけを更新します。ここでは既読化しません。
                        </p>
                    </div>
                    <div>
                        <Button
                            variant="outline"
                            onClick={runFeedbackUnreadCheck}
                            disabled={feedbackUnreadCheckLoading}
                            className="bg-white"
                        >
                            <RefreshCw className={`h-4 w-4 mr-1.5 ${feedbackUnreadCheckLoading ? 'animate-spin' : ''}`} />
                            {feedbackUnreadCheckLoading ? '確認中' : '未読チェック実行'}
                        </Button>
                    </div>
                    {feedbackUnreadCheckError && (
                        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                            {feedbackUnreadCheckError}
                        </div>
                    )}
                    {feedbackUnreadCheckResult && (
                        <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                            <p className="font-bold text-slate-900">
                                未読返信: {feedbackUnreadCheckResult.unreadCount} 件
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                                右クリック表示: {feedbackUnreadCheckResult.hasUnread ? '新着あり' : '新着なし'}
                            </p>
                        </div>
                    )}
                </div>
            </section>

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

type DriveTempCleanupSummary = {
    totalCount: number;
    oldCount: number;
    deletableCount: number;
    totalBytes: number;
    oldBytes: number;
    deletableBytes: number;
    deletedCount: number;
    failedCount: number;
    skippedReferencedCount: number;
    retentionDays: number;
    files: DriveTempFileView[];
}

type DriveTempFileView = {
    id: string;
    name: string;
    modifiedTime?: string | null;
    size?: number | null;
    kind: 'image' | 'video' | 'unknown' | string;
    isOld: boolean;
    isReferenced: boolean;
    canDelete: boolean;
    previewDataUrl?: string | null;
    previewText?: string | null;
}

type IphoneConnectionDiagnostic = {
    status: 'ok' | 'warning' | 'error' | string;
    summary: string;
    action?: string | null;
    deviceCount: number;
    details: string[];
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
function formatBytes(bytes: number): string {
    if (!bytes) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    let value = bytes
    let unit = 0
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024
        unit += 1
    }
    return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

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

function IphoneSection({ settings, onUpdate, t, iphoneDriveDisconnected }: SectionProps & {
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
    const [diagnostic, setDiagnostic] = useState<IphoneConnectionDiagnostic | null>(null)
    const [diagnosticLoading, setDiagnosticLoading] = useState(false)
    const [diagnosticError, setDiagnosticError] = useState<string | null>(null)

    const loadPcAccount = async () => {
        try {
            const { invoke } = await import('@tauri-apps/api/core')
            const account = await invoke<GoogleAccount>('fusen_get_google_account')
            setPcAccount(account)
            return account
        } catch (e) {
            console.error('[google-account]', e)
            setPcAccount(null)
            return null
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
                const account = await loadPcAccount()
                if (!account?.emailAddress) {
                    setStatus('disconnected')
                    setDevices([])
                    return
                }
                setStatus('connected')
                await invoke('fusen_ensure_push_keys')
                await loadDevices()
            } catch {
                setStatus('disconnected')
                setPcAccount(null)
                setDevices([])
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
            await invoke('fusen_ensure_push_keys')
            const account = await loadPcAccount()
            if (!account?.emailAddress) throw new Error('Googleアカウント情報を取得できませんでした')
            await loadDevices()
            setStatus('connected')
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
    const hasAccountMismatch = !!pcEmail && registeredDeviceEmails.some((email) => email.toLowerCase() !== pcEmail)
    const hasRegisteredDevice = (devices ?? []).length > 0
    const pcConnected = status === 'connected' && !!pcAccount?.emailAddress
    const accountsReady = pcConnected && hasRegisteredDevice && !hasAccountMismatch
    const sendEnabled = settings.iphone_send_enabled

    // 「次に何をすればよいか」の一文。状況に応じて切り替える
    const nextAction = (() => {
        if (!sendEnabled) return '上の「iPhone送信を有効にする」をONにしてください。'
        if (hasAccountMismatch) return 'PCとiPhoneで同じGoogleアカウントに再接続してください。'
        if (!pcConnected) return 'Step 1：PCをGoogleドライブに接続してください。'
        if (!hasRegisteredDevice) return 'Step 2：iPhoneでQRコードを開き、「ホーム画面に追加」してください。'
        return '準備完了です。付箋を右クリック →「iPhoneに表示」で送れます。'
    })()

    const overallStatus: { label: string; tone: 'gray' | 'amber' | 'green' } = (() => {
        if (!sendEnabled) return { label: 'OFF', tone: 'gray' }
        if (hasAccountMismatch) return { label: '確認が必要', tone: 'amber' }
        if (accountsReady) return { label: '準備完了', tone: 'green' }
        return { label: 'セットアップ中', tone: 'gray' }
    })()

    const handleCopy = () => {
        navigator.clipboard.writeText(PWA_URL).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        })
    }

    const handleDiagnose = async () => {
        setDiagnosticLoading(true)
        setDiagnosticError(null)
        setDiagnostic(null)
        try {
            const { invoke } = await import('@tauri-apps/api/core')
            const result = await invoke<IphoneConnectionDiagnostic>('fusen_diagnose_iphone_connection')
            setDiagnostic(result)
        } catch (e) {
            setDiagnosticError(String(e))
        } finally {
            setDiagnosticLoading(false)
        }
    }

    return (
        <div className="space-y-6">
            <div className="mb-4">
                <h2 className="text-3xl font-black tracking-tight text-gray-900 mb-2">iPhone連携</h2>
                <p className="text-gray-500 text-sm">PCで書いた付箋をiPhoneに送れるようにします。</p>
            </div>
            <Separator />

            {/* ① ON/OFF スイッチ */}
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-5">
                <div className="min-w-0 pr-6">
                    <Label className="text-base font-bold text-gray-900">{t('settings.iphone.sendEnabled')}</Label>
                    <p className="mt-1 text-sm text-gray-500">
                        OFFのとき：右クリックメニューには表示されますが、iPhoneへ送信できません。
                    </p>
                </div>
                <Switch
                    checked={settings.iphone_send_enabled}
                    onCheckedChange={(val) => onUpdate("iphone_send_enabled", val)}
                />
            </div>

            {/* OFF のときの注釈 */}
            {!sendEnabled && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    上の「iPhone送信を有効にする」をONにすると、下のセットアップ手順が使えるようになります。
                </div>
            )}

            {/* ② 接続セットアップ（OFFのときはグレーアウト） */}
            <div className={!sendEnabled ? 'opacity-40 pointer-events-none select-none' : ''}>
                <div className="rounded-lg border border-slate-200 bg-white p-6 space-y-5">
                    {/* ヘッダ：状態バッジ */}
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h3 className="text-lg font-bold text-gray-900">セットアップ</h3>
                            <p className="text-sm text-gray-500 mt-1">上から順に進めてください。完了したステップは ✓ になります。</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                            overallStatus.tone === 'green'
                                ? 'bg-green-100 text-green-700'
                                : overallStatus.tone === 'amber'
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-slate-100 text-slate-600'
                        }`}>
                            {overallStatus.label}
                        </span>
                    </div>

                    {/* Step 1: PC で Drive 接続 */}
                    <div className={`rounded-md border px-4 py-4 ${pcConnected ? 'border-green-100 bg-green-50' : 'border-gray-100 bg-gray-50'}`}>
                        <div className="flex items-start gap-3">
                            <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                pcConnected ? 'bg-green-500 text-white' : 'bg-white text-gray-500 border border-gray-200'
                            }`}>
                                {pcConnected ? '✓' : '1'}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-gray-800">PCをGoogleドライブに接続</p>
                                {status === 'loading' ? (
                                    <p className="text-xs text-gray-400 mt-1">確認中...</p>
                                ) : pcConnected ? (
                                    <div className="mt-2 flex items-center gap-2">
                                        {pcAccount?.photoLink && (
                                            <img src={pcAccount.photoLink} alt="" className="h-5 w-5 rounded-full" />
                                        )}
                                        <span className="text-sm text-gray-700 truncate">{pcAccount?.emailAddress}</span>
                                        <Button variant="outline" size="sm" onClick={handleConnect} disabled={isConnecting} className="ml-auto">
                                            再接続
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="mt-2">
                                        <p className="text-xs text-gray-500 mb-2">付箋データをPCとiPhoneで受け渡すため、あなたのGoogleドライブに接続します。</p>
                                        <Button onClick={handleConnect} disabled={isConnecting} size="sm">
                                            {isConnecting ? (
                                                <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />接続中...</>
                                            ) : (
                                                <><Smartphone className="mr-2 h-4 w-4" />Googleドライブに接続</>
                                            )}
                                        </Button>
                                    </div>
                                )}
                                {errorMsg && (
                                    <p className="text-xs text-amber-700 bg-amber-50 rounded p-2 mt-2">{errorMsg}</p>
                                )}
                                {iphoneDriveDisconnected && pcConnected && (
                                    <p className="text-xs text-amber-700 bg-amber-50 rounded p-2 mt-2">
                                        Driveとの接続が切れている可能性があります。「再接続」を試してください。
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Step 2: iPhone をホーム画面に追加（QR） */}
                    <div className={`rounded-md border px-4 py-4 ${hasRegisteredDevice ? 'border-green-100 bg-green-50' : pcConnected ? 'border-blue-100 bg-blue-50' : 'border-gray-100 bg-gray-50'}`}>
                        <div className="flex items-start gap-3">
                            <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                hasRegisteredDevice ? 'bg-green-500 text-white' : pcConnected ? 'bg-blue-500 text-white' : 'bg-white text-gray-500 border border-gray-200'
                            }`}>
                                {hasRegisteredDevice ? '✓' : '2'}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-gray-800">iPhone版をホーム画面に追加</p>
                                {hasRegisteredDevice ? (
                                    <p className="text-xs text-green-700 mt-1">追加済みです。iPhone側からも俺の付箋が起動できます。</p>
                                ) : (
                                    <>
                                        <p className="text-xs text-gray-500 mt-1 mb-3">QRコードをiPhoneのカメラで読み取り、SafariでURLを開いて「ホーム画面に追加」してください。</p>
                                        <div className="flex items-start gap-4">
                                            <div className="flex-shrink-0">
                                                <QrCodeCanvas url={PWA_URL} />
                                            </div>
                                            <div className="flex flex-col gap-2 min-w-0 flex-1">
                                                <code className="text-xs font-mono text-gray-700 bg-white border border-gray-200 rounded px-2 py-1.5 truncate block">
                                                    {PWA_URL}
                                                </code>
                                                <button
                                                    onClick={handleCopy}
                                                    className={`flex items-center justify-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                                                        copied
                                                            ? 'border-green-300 bg-green-50 text-green-700'
                                                            : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                                                    }`}
                                                >
                                                    {copied ? '✓ コピーしました' : 'URLをコピー'}
                                                </button>
                                                <p className="text-[11px] text-gray-400 leading-relaxed">
                                                    SafariでURLを開く → 共有ボタン → 「ホーム画面に追加」
                                                </p>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Step 3: iPhone 側で Drive 接続 */}
                    <div className={`rounded-md border px-4 py-4 ${
                        hasAccountMismatch
                            ? 'border-amber-200 bg-amber-50'
                            : hasRegisteredDevice && !hasAccountMismatch
                                ? 'border-green-100 bg-green-50'
                                : pcConnected
                                    ? 'border-gray-100 bg-gray-50'
                                    : 'border-gray-100 bg-gray-50'
                    }`}>
                        <div className="flex items-start gap-3">
                            <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                hasAccountMismatch
                                    ? 'bg-amber-500 text-white'
                                    : hasRegisteredDevice && !hasAccountMismatch
                                        ? 'bg-green-500 text-white'
                                        : 'bg-white text-gray-500 border border-gray-200'
                            }`}>
                                {hasAccountMismatch ? '!' : hasRegisteredDevice ? '✓' : '3'}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-gray-800">iPhone側で同じGoogleアカウントに接続</p>
                                {hasAccountMismatch ? (
                                    <p className="text-xs text-amber-800 mt-1">
                                        PCとiPhoneで違うGoogleアカウントが使われています。同じアカウントで再接続してください。
                                    </p>
                                ) : hasRegisteredDevice ? (
                                    <p className="text-xs text-green-700 mt-1">
                                        {registeredDeviceEmails[0] ?? '通知デバイスが登録されました。'}
                                    </p>
                                ) : (
                                    <p className="text-xs text-gray-500 mt-1">
                                        iPhone版アプリを開いたら、PCと同じGoogleアカウントでログインしてください。ここに ✓ が付けば完了です。
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* 次にやること */}
                    <div className={`rounded-md px-4 py-3 text-sm ${
                        overallStatus.tone === 'green'
                            ? 'bg-green-50 text-green-800 border border-green-200'
                            : overallStatus.tone === 'amber'
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : 'bg-blue-50 text-blue-800 border border-blue-200'
                    }`}>
                        <span className="font-semibold">次にやること：</span>{nextAction}
                    </div>
                </div>

                {/* ③ 接続済み iPhone 一覧（接続済みで端末がいるときだけ） */}
                {pcConnected && hasRegisteredDevice && (
                    <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6 space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-gray-800 text-sm">接続済みのiPhone / iPad</h3>
                            <button
                                onClick={loadDevices}
                                disabled={devicesLoading}
                                className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-2 py-1"
                            >
                                {devicesLoading ? '読み込み中...' : '更新'}
                            </button>
                        </div>
                        <div className="space-y-2">
                            {devices!.map((d) => (
                                <div key={d.device_id} className="flex items-center justify-between rounded-md border border-gray-100 bg-gray-50 px-3 py-2 gap-2">
                                    <div className="min-w-0 flex-1">
                                        <div className="text-sm font-medium text-gray-700">
                                            {d.device_name ?? endpointLabel(d.endpoint)}
                                        </div>
                                        <div className="text-xs text-gray-400 mt-0.5">{formatDate(d.registered_at)}</div>
                                        {d.google_account_email && (
                                            <div className={`text-xs mt-0.5 ${pcEmail && d.google_account_email.toLowerCase() !== pcEmail ? 'text-amber-700 font-medium' : 'text-gray-500'}`}>
                                                {d.google_account_email}
                                                {d.google_account_name && (
                                                    <span className="text-gray-400"> / {d.google_account_name}</span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        disabled={deletingId === d.device_id}
                                        onClick={async () => {
                                            if (!confirm(`「${d.device_name ?? 'このデバイス'}」を削除しますか？\nこのiPhoneで再登録するまで送信できなくなります。`)) return
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
                    </div>
                )}

                {/* ④ もう一台のiPhone / iPadを追加（接続済み&登録済みのときだけ折りたたみで表示） */}
                {pcConnected && hasRegisteredDevice && (
                    <details className="mt-3 rounded-lg border border-slate-200 bg-white group">
                        <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3.5 hover:bg-slate-50/70 rounded-lg">
                            <Smartphone className="h-4 w-4 shrink-0 text-slate-500" />
                            <span className="flex-1 text-sm font-semibold text-slate-700">
                                もう一台のiPhone / iPadを追加する
                            </span>
                            <ChevronRight className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-90" />
                        </summary>
                        <div className="px-5 pb-5 pt-1 border-t border-slate-100">
                            <p className="text-xs text-gray-500 mb-3 mt-3">
                                追加したいiPhone / iPadのSafariで、下のURLを開いて「ホーム画面に追加」してください。
                            </p>
                            <div className="flex items-start gap-4">
                                <div className="flex-shrink-0">
                                    <QrCodeCanvas url={PWA_URL} />
                                </div>
                                <div className="flex flex-col gap-2 min-w-0 flex-1">
                                    <code className="text-xs font-mono text-gray-700 bg-gray-50 border border-gray-200 rounded px-2 py-1.5 truncate block">
                                        {PWA_URL}
                                    </code>
                                    <button
                                        onClick={handleCopy}
                                        className={`flex items-center justify-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                                            copied
                                                ? 'border-green-300 bg-green-50 text-green-700'
                                                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                                        }`}
                                    >
                                        {copied ? '✓ コピーしました' : 'URLをコピー'}
                                    </button>
                                    <p className="text-[11px] text-gray-400 leading-relaxed">
                                        SafariでURLを開く → 共有ボタン → 「ホーム画面に追加」
                                    </p>
                                </div>
                            </div>
                        </div>
                    </details>
                )}

                <div className="mt-3 rounded-lg border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <h3 className="text-sm font-semibold text-slate-800">困ったときの接続診断</h3>
                            <p className="mt-1 text-xs leading-5 text-slate-500">
                                iPhone送信でエラーが出たときに、送信準備だけを確認します。通知は送信しません。
                            </p>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleDiagnose}
                            disabled={diagnosticLoading || !sendEnabled}
                            className="shrink-0"
                        >
                            <Activity className={`mr-2 h-4 w-4 ${diagnosticLoading ? 'animate-pulse' : ''}`} />
                            {diagnosticLoading ? '診断中' : '接続を診断'}
                        </Button>
                    </div>

                    {diagnosticError && (
                        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                            {diagnosticError}
                        </div>
                    )}

                    {diagnostic && (
                        <div className={`mt-3 rounded-md border px-3 py-2 text-sm ${
                            diagnostic.status === 'ok'
                                ? 'border-green-200 bg-green-50 text-green-800'
                                : 'border-amber-200 bg-amber-50 text-amber-800'
                        }`}>
                            <p className="font-semibold">{diagnostic.summary}</p>
                            {diagnostic.action && (
                                <p className="mt-1">{diagnostic.action}</p>
                            )}
                            <details className="mt-2">
                                <summary className="cursor-pointer text-xs font-medium opacity-80">確認できたこと</summary>
                                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 opacity-90">
                                    {diagnostic.details.map((detail) => (
                                        <li key={detail}>{detail}</li>
                                    ))}
                                </ul>
                            </details>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
