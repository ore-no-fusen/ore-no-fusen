"use client"

import React, { useState } from "react"
import { Monitor, Moon, Sun, Laptop, Save, FolderOpen, Info, Settings, Database, Type, Volume2, Globe, Reply } from "lucide-react"

// ★さっき作った「倉庫番」をインポート
import { useSettings, type AppSettings } from "@/lib/settings-store"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"

export default function SettingsPage() {
    const [activeSection, setActiveSection] = useState("general")

    // ★ここで「倉庫番」を呼び出し！
    // loading: 読み込み中かどうか
    // settings: 現在の設定データ
    // saveSettings: 保存するための関数
    const { settings, saveSettings, loading } = useSettings()

    // 読み込み中は「読み込み中...」と出す（チラつき防止）
    if (loading) {
        return <div className="flex h-[600px] items-center justify-center">読み込み中...</div>
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
                return <GeneralSection settings={settings} onUpdate={updateSetting} />
            case "appearance":
                return <AppearanceSection settings={settings} onUpdate={updateSetting} />
            case "data":
                return <DataSection settings={settings} onUpdate={updateSetting} />
            case "about":
                return <AboutSection />
            default:
                return <GeneralSection settings={settings} onUpdate={updateSetting} />
        }
    }

    return (
        <div className="flex h-[600px] w-full max-w-4xl overflow-hidden rounded-lg border bg-background shadow-xl text-foreground">
            {/* サイドバー */}
            <aside className="w-64 border-r bg-muted/30 p-4">
                <div className="mb-6 flex items-center gap-2 px-2 py-4">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                        <Settings className="h-5 w-5" />
                    </div>
                    <span className="text-lg font-bold tracking-tight">俺の付箋</span>
                </div>
                <nav className="space-y-1">
                    <SidebarItem
                        icon={<Settings className="mr-2 h-4 w-4" />}
                        label="一般"
                        isActive={activeSection === "general"}
                        onClick={() => setActiveSection("general")}
                    />
                    <SidebarItem
                        icon={<Monitor className="mr-2 h-4 w-4" />}
                        label="外観"
                        isActive={activeSection === "appearance"}
                        onClick={() => setActiveSection("appearance")}
                    />
                    <SidebarItem
                        icon={<Database className="mr-2 h-4 w-4" />}
                        label="データ管理"
                        isActive={activeSection === "data"}
                        onClick={() => setActiveSection("data")}
                    />
                    <SidebarItem
                        icon={<Info className="mr-2 h-4 w-4" />}
                        label="このアプリについて"
                        isActive={activeSection === "about"}
                        onClick={() => setActiveSection("about")}
                    />
                </nav>
            </aside>

            {/* メインコンテンツエリア */}
            <main className="flex flex-1 flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto p-8">
                    {renderContent()}
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
}

function GeneralSection({ settings, onUpdate }: SectionProps) {
    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">一般設定</h2>
                <p className="text-muted-foreground">アプリケーションの基本動作を設定します。</p>
            </div>
            <Separator />
            <div className="grid gap-4">
                <div className="grid gap-2">
                    <Label>言語 (Language)</Label>
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
                        <Label className="text-base">ログイン時に起動</Label>
                        <p className="text-sm text-muted-foreground">PC起動時に自動でアプリを立ち上げます</p>
                    </div>
                    <Switch
                        checked={settings.autoStart}
                        onCheckedChange={(val) => onUpdate("autoStart", val)}
                    />
                </div>

                {/* 効果音スイッチ */}
                <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                        <Label className="text-base">効果音 (SE)</Label>
                        <p className="text-sm text-muted-foreground">操作時のサウンドエフェクトを有効にする</p>
                    </div>
                    <Switch
                        checked={settings.soundEnabled}
                        onCheckedChange={(val) => onUpdate("soundEnabled", val)}
                    />
                </div>
            </div>
        </div>
    )
}

function AppearanceSection({ settings, onUpdate }: SectionProps) {
    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">外観設定</h2>
                <p className="text-muted-foreground">フォントサイズなどをカスタマイズします。</p>
            </div>
            <Separator />

            <div className="space-y-4 pt-4">
                <div className="flex justify-between">
                    <Label>フォントサイズ</Label>
                    <span className="text-sm text-muted-foreground">現在: {settings.fontSize}px</span>
                </div>
                {/* スライダーの値と連携 */}
                <Slider
                    defaultValue={[settings.fontSize]}
                    value={[settings.fontSize]}
                    max={32}
                    min={10}
                    step={1}
                    className="w-[60%]"
                    onValueChange={(vals) => onUpdate("fontSize", vals[0])}
                />
                <div className="h-20 w-full rounded border p-4 flex items-center justify-center bg-muted/20">
                    <p style={{ fontSize: `${settings.fontSize}px` }}>
                        文字サイズのプレビューです。
                    </p>
                </div>
            </div>
        </div>
    )
}

function DataSection({ settings, onUpdate }: SectionProps) {
    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">データ管理</h2>
                <p className="text-muted-foreground">データの保存場所やインポートを管理します。</p>
            </div>
            <Separator />

            <div className="grid gap-4">
                <div className="grid gap-2">
                    <Label htmlFor="path">データ保存場所 (Base Path)</Label>
                    <div className="flex gap-2">
                        <Input
                            id="path"
                            value={settings.base_path}
                            readOnly
                            className="font-mono text-sm bg-muted"
                        />
                        <Button variant="outline"><FolderOpen className="mr-2 h-4 w-4" /> 参照</Button>
                    </div>
                    <p className="text-xs text-muted-foreground">※変更機能はバックエンド実装後に有効化されます</p>
                </div>

                <div className="mt-4 rounded-lg border border-dashed p-6">
                    <h3 className="mb-4 text-lg font-medium">Markdownインポート</h3>
                    <p className="mb-4 text-sm text-muted-foreground">
                        既存の .md ファイルがあるフォルダを指定して、付箋として読み込みます。
                    </p>
                    <div className="flex gap-2">
                        <Input placeholder="インポート元のフォルダパス..." />
                        <Button><Reply className="mr-2 h-4 w-4" />インポート実行</Button>
                    </div>
                </div>
            </div>
        </div>
    )
}

function AboutSection() {
    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">このアプリについて</h2>
                <p className="text-muted-foreground">
                    アプリケーション情報とサポート
                </p>
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
                        <h3 className="font-bold text-xl leading-none">俺の付箋</h3>
                        <p className="text-sm text-muted-foreground">OreNoFusen</p>
                        <p className="text-xs text-muted-foreground pt-1">バージョン 1.0.0</p>
                    </div>
                </div>

                <div className="mt-6 space-y-4">
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        シンプルで使いやすいデスクトップ付箋アプリです。メモを素早く作成し、デスクトップ上で整理することができます。
                    </p>

                    <div className="space-y-2 pt-2">
                        <Button variant="outline" className="w-full justify-start h-12 text-base font-normal" asChild>
                            <a href="https://example.com" target="_blank" rel="noreferrer">
                                <Globe className="mr-3 h-5 w-5" />
                                公式ウェブサイト
                            </a>
                        </Button>
                        <Button variant="outline" className="w-full justify-start h-12 text-base font-normal" asChild>
                            <a href="https://github.com" target="_blank" rel="noreferrer">
                                <div className="mr-3 h-5 w-5 flex items-center justify-center">
                                    <svg role="img" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><title>GitHub</title><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" /></svg>
                                </div>
                                GitHub
                            </a>
                        </Button>
                    </div>
                </div>

                <div className="mt-8 text-center text-xs text-muted-foreground border-t pt-4">
                    &copy; 2026 OreNoFusen. All rights reserved.
                </div>
            </div>
        </div>
    )
}