/**
 * ランディングページ (LandingPage)
 *
 * 責務:
 * - アプリケーションの紹介とダウンロードリンクの提供
 * - VercelなどのWebホスティング環境での表示用ページ
 * - 製品の特徴、スクリーンショット、ダウンロードボタンの表示
 */

'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Download, Github, FileText, Tag, Search, Sparkles, Zap, Shield } from 'lucide-react';

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
            {/* ヒーローセクション */}
            <section className="relative overflow-hidden">
                {/* 背景グラデーション */}
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-pink-500/10 blur-3xl" />

                <div className="relative max-w-7xl mx-auto px-6 py-24 sm:py-32 lg:py-40">
                    {/* ナビゲーション */}
                    <nav className="absolute top-0 left-0 right-0 px-6 py-6 flex justify-between items-center">
                        <div className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                            俺の付箋
                        </div>
                        <div className="flex gap-4">
                            <Link
                                href="https://github.com/ore-no-fusen/ore-no-fusen"
                                target="_blank"
                                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                            >
                                <Github className="w-6 h-6" />
                            </Link>
                        </div>
                    </nav>

                    {/* メインコンテンツ */}
                    <div className="text-center mt-16">
                        <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-full text-sm text-blue-300 mb-8">
                            <Sparkles className="w-4 h-4" />
                            <span>無料・オープンソース</span>
                        </div>

                        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
                            デスクトップに、
                            <br />
                            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                                思考を貼り付けよう
                            </span>
                        </h1>

                        <p className="text-xl sm:text-2xl text-slate-300 mb-12 max-w-3xl mx-auto">
                            Markdownで書ける、美しい付箋アプリ。
                            <br />
                            シンプルで強力な、あなたの思考整理ツール。
                        </p>

                        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                            <Link
                                href="https://github.com/ore-no-fusen/ore-no-fusen/releases/latest"
                                target="_blank"
                                onClick={() => {
                                    if (typeof window !== 'undefined' && 'gtag' in window) {
                                        (window as any).gtag('event', 'download_click', {
                                            event_category: 'engagement',
                                            event_label: 'github_release'
                                        });
                                    }
                                }}
                                className="group relative px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-500 rounded-xl font-semibold text-lg hover:shadow-2xl hover:shadow-purple-500/50 transition-all duration-300 flex items-center gap-2"
                            >
                                <Download className="w-5 h-5" />
                                無料ダウンロード
                                <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-purple-400 rounded-xl opacity-0 group-hover:opacity-20 blur transition-opacity" />
                            </Link>


                            <Link
                                href="#features"
                                className="px-8 py-4 bg-white/5 border border-white/10 rounded-xl font-semibold text-lg hover:bg-white/10 transition-colors"
                            >
                                機能を見る
                            </Link>
                        </div>

                        <p className="text-sm text-slate-400 mt-6">
                            Windows 10/11 対応 • v0.10.0
                        </p>
                    </div>
                </div>

                {/* スクロールインジケーター */}
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
                    <div className="w-6 h-10 border-2 border-white/20 rounded-full flex justify-center">
                        <div className="w-1.5 h-3 bg-white/40 rounded-full mt-2" />
                    </div>
                </div>
            </section>

            {/* 主要機能セクション */}
            <section id="features" className="py-24 bg-slate-900/50">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="text-center mb-16">
                        <h2 className="text-4xl sm:text-5xl font-bold mb-4">
                            シンプルで
                            <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent"> 強力</span>
                        </h2>
                        <p className="text-xl text-slate-400">
                            思考整理に必要な機能を、すべて
                        </p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        {/* Markdownサポート */}
                        <div className="group p-8 bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/50 rounded-2xl hover:border-blue-500/50 transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/10">
                            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                <FileText className="w-6 h-6" />
                            </div>
                            <h3 className="text-2xl font-bold mb-4">Markdownサポート</h3>
                            <p className="text-slate-400 leading-relaxed">
                                見出し、リスト、コードブロックなど、Markdownの豊富な記法をサポート。リアルタイムプレビューで美しく表示。
                            </p>
                        </div>

                        {/* タグ・アーカイブ */}
                        <div className="group p-8 bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/50 rounded-2xl hover:border-purple-500/50 transition-all duration-300 hover:shadow-xl hover:shadow-purple-500/10">
                            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                <Tag className="w-6 h-6" />
                            </div>
                            <h3 className="text-2xl font-bold mb-4">タグ・アーカイブ</h3>
                            <p className="text-slate-400 leading-relaxed">
                                付箋をタグで整理。完了したタスクはアーカイブへ。フォルダ構造で見やすく管理できます。
                            </p>
                        </div>

                        {/* 高速検索 */}
                        <div className="group p-8 bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/50 rounded-2xl hover:border-pink-500/50 transition-all duration-300 hover:shadow-xl hover:shadow-pink-500/10">
                            <div className="w-12 h-12 bg-gradient-to-br from-pink-500 to-pink-600 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                <Search className="w-6 h-6" />
                            </div>
                            <h3 className="text-2xl font-bold mb-4">高速検索</h3>
                            <p className="text-slate-400 leading-relaxed">
                                全文検索で瞬時に目的の付箋を発見。タグフィルターと組み合わせて、効率的に情報を見つけられます。
                            </p>
                        </div>
                    </div>

                    {/* 追加機能 */}
                    <div className="grid md:grid-cols-3 gap-6 mt-8">
                        <div className="flex items-start gap-4 p-6 bg-slate-800/30 rounded-xl border border-slate-700/30">
                            <Zap className="w-6 h-6 text-yellow-400 flex-shrink-0 mt-1" />
                            <div>
                                <h4 className="font-semibold mb-1">自動起動</h4>
                                <p className="text-sm text-slate-400">システム起動時に自動で立ち上がり、すぐに使える</p>
                            </div>
                        </div>

                        <div className="flex items-start gap-4 p-6 bg-slate-800/30 rounded-xl border border-slate-700/30">
                            <Shield className="w-6 h-6 text-green-400 flex-shrink-0 mt-1" />
                            <div>
                                <h4 className="font-semibold mb-1">ローカル保存</h4>
                                <p className="text-sm text-slate-400">データは全てローカルに保存。プライバシー安心</p>
                            </div>
                        </div>

                        <div className="flex items-start gap-4 p-6 bg-slate-800/30 rounded-xl border border-slate-700/30">
                            <Sparkles className="w-6 h-6 text-blue-400 flex-shrink-0 mt-1" />
                            <div>
                                <h4 className="font-semibold mb-1">効果音</h4>
                                <p className="text-sm text-slate-400">作成・保存・削除時に心地よいサウンドフィードバック</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* スクリーンショットセクション（プレースホルダー） */}
            <section className="py-24">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="text-center mb-16">
                        <h2 className="text-4xl sm:text-5xl font-bold mb-4">
                            美しく、
                            <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent"> 直感的</span>
                        </h2>
                        <p className="text-xl text-slate-400">
                            洗練されたUIで、思考整理がもっと楽しく
                        </p>
                    </div>

                    {/* スクリーンショット */}
                    <div className="relative">
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-pink-500/20 blur-3xl" />
                        <div className="relative rounded-2xl overflow-hidden border border-slate-700/50 shadow-2xl">
                            <Image
                                src="/screenshots/ScreenShot_OreNoFusen.png"
                                alt="俺の付箋 スクリーンショット"
                                width={1200}
                                height={800}
                                className="w-full h-auto"
                            />
                        </div>
                    </div>
                </div>
            </section>

            {/* ダウンロードセクション */}
            <section className="py-24 bg-gradient-to-br from-slate-900/50 to-slate-800/50">
                <div className="max-w-4xl mx-auto px-6 text-center">
                    <h2 className="text-4xl sm:text-5xl font-bold mb-6">
                        今すぐ始めよう
                    </h2>
                    <p className="text-xl text-slate-400 mb-12">
                        無料でダウンロード。インストールは1分で完了。
                    </p>

                    <Link
                        href="https://github.com/ore-no-fusen/ore-no-fusen/releases/latest"
                        target="_blank"
                        className="inline-flex items-center gap-3 px-10 py-5 bg-gradient-to-r from-blue-500 to-purple-500 rounded-xl font-semibold text-xl hover:shadow-2xl hover:shadow-purple-500/50 transition-all duration-300"
                    >
                        <Download className="w-6 h-6" />
                        ore-no-fusen をダウンロード
                    </Link>

                    <div className="mt-12 p-6 bg-slate-800/50 border border-slate-700/50 rounded-xl">
                        <h3 className="font-semibold mb-4">システム要件</h3>
                        <div className="grid sm:grid-cols-2 gap-4 text-sm text-slate-400">
                            <div>
                                <span className="text-slate-300 font-medium">OS:</span> Windows 10/11 (64-bit)
                            </div>
                            <div>
                                <span className="text-slate-300 font-medium">容量:</span> 約 100MB
                            </div>
                        </div>
                    </div>

                    <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center text-sm">
                        <Link href="https://github.com/ore-no-fusen/ore-no-fusen" target="_blank" className="text-blue-400 hover:text-blue-300 transition-colors">
                            📖 ドキュメントを読む
                        </Link>
                        <Link href="https://github.com/ore-no-fusen/ore-no-fusen/issues" target="_blank" className="text-blue-400 hover:text-blue-300 transition-colors">
                            💬 フィードバックを送る
                        </Link>
                    </div>
                </div>
            </section>

            {/* フッター */}
            <footer className="border-t border-slate-800 py-12">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="text-slate-400 text-sm">
                            © 2026 ore-no-fusen by ONF Studios. MIT License.
                        </div>
                        <div className="flex gap-6">
                            <Link href="https://github.com/ore-no-fusen/ore-no-fusen" target="_blank" className="text-slate-400 hover:text-white transition-colors">
                                GitHub
                            </Link>
                            <Link href="https://github.com/ore-no-fusen/ore-no-fusen/blob/main/README.md" target="_blank" className="text-slate-400 hover:text-white transition-colors">
                                ドキュメント
                            </Link>

                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
}
