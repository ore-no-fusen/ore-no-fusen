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
import { Download } from 'lucide-react';
import { useRef } from 'react';

// ジブリ風カラーパレット
// 背景: #EDE4D3 (羊皮紙)
// 付箋黄: #E8D88A (古い紙の黄)
// 付箋緑: #8BAF7C (トトロの緑)
// 付箋青: #7AAFC0 (空と海)
// 付箋ピンク: #D4957A (ナウシカのローブ)
// アクセント: #5C7A3E (森の深緑)
// テキスト: #2C1F0E (土の色)

export default function LandingPage() {
    const version = process.env.NEXT_PUBLIC_APP_VERSION ?? '';
    const downloadUrl = `https://github.com/ore-no-fusen/ore-no-fusen/releases/download/v${version}/ore-no-fusen_${version}_x64-setup.exe`;
    const videoRef = useRef<HTMLVideoElement>(null);

    return (
        <div
            className="min-h-screen text-[#2C1F0E]"
            style={{
                backgroundColor: '#EDE4D3',
                fontFamily: "'Helvetica Neue', 'Arial', 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, sans-serif",
            }}
        >
            {/* ナビゲーション */}
            <nav className="px-6 py-5 flex justify-between items-center border-b border-[#C8B89A]/40">
                <div className="text-xl font-bold tracking-wide text-[#2C1F0E]">
                    俺の付箋
                </div>
                <Link
                    href="https://github.com/ore-no-fusen/ore-no-fusen"
                    target="_blank"
                    className="flex items-center gap-2 text-sm text-[#7A6A50] hover:text-[#2C1F0E] transition-colors px-3 py-1.5 rounded border border-[#C8B89A]/60 hover:border-[#C8B89A]"
                >
                    {/* GitHub SVGアイコン */}
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                    </svg>
                    GitHub
                </Link>
            </nav>

            {/* ヒーローセクション */}
            <section className="relative overflow-hidden py-20 sm:py-28 px-6">
                {/* 薄い点描模様（手描き感） */}
                <div className="absolute inset-0 opacity-[0.04]"
                    style={{
                        backgroundImage: 'radial-gradient(circle, #5C7A3E 1px, transparent 1px)',
                        backgroundSize: '28px 28px'
                    }}
                />

                {/* 葉っぱ風装飾（左上） */}
                <div className="absolute top-10 left-8 opacity-10 pointer-events-none select-none"
                    style={{ fontSize: '5rem', transform: 'rotate(-20deg)' }}>
                    🍃
                </div>
                <div className="absolute bottom-16 right-10 opacity-10 pointer-events-none select-none"
                    style={{ fontSize: '4rem', transform: 'rotate(15deg)' }}>
                    🌿
                </div>

                <div className="relative max-w-5xl mx-auto">
                    <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">

                        {/* 左：テキスト */}
                        <div className="flex-1 text-center lg:text-left">
                            {/* 手書き風バッジ */}
                            <div className="inline-block px-3 py-1 bg-[#8BAF7C]/20 text-[#4A6B35] text-xs font-semibold rounded-full border border-[#8BAF7C]/40 mb-6">
                                無料・オープンソース
                            </div>

                            <h1 className="text-4xl sm:text-5xl lg:text-[3.4rem] font-bold leading-snug tracking-tight mb-6 text-[#2C1F0E]">
                                大事なことは、
                                <br />
                                <span className="text-[#5C7A3E]">貼っておけばいい。</span>
                            </h1>

                            {/* 哲学的一節 */}
                            <div className="mb-8 pl-4 border-l-2 border-[#8BAF7C]/50 text-left">
                                <p className="text-sm text-[#7A6A50] leading-loose">
                                    人は太古から、大事なことを壁に貼ってきた。
                                    <br />
                                    ラスコーから続く習慣を、デスクトップへ。
                                </p>
                                <p className="text-xs text-[#9A8878] mt-2 italic tracking-wide">
                                    ── 本能は変わらない。形が変わった。
                                </p>
                            </div>

                            <p className="text-lg sm:text-xl text-[#6A5540] mb-3 leading-relaxed">
                                デスクトップに貼れる付箋アプリ
                            </p>
                            <p className="text-sm text-[#9A8470] mb-10">
                                Markdownで書けて、自動保存。<br className="sm:hidden" />ワンクリックで、すぐ書ける。
                            </p>

                            <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start items-center">
                                <Link
                                    href={downloadUrl}
                                    target="_blank"
                                    onClick={() => {
                                        if (typeof window !== 'undefined' && 'gtag' in window) {
                                            (window as any).gtag('event', 'download_click', {
                                                event_category: 'engagement',
                                                event_label: 'github_release'
                                            });
                                        }
                                    }}
                                    className="flex items-center gap-2 px-7 py-3.5 bg-[#5C7A3E] hover:bg-[#4A6730] text-[#F5EDD8] rounded-sm font-semibold text-base shadow-[2px_3px_10px_rgba(92,122,62,0.35)] hover:shadow-[2px_4px_14px_rgba(92,122,62,0.45)] transition-all duration-200"
                                >
                                    <Download className="w-4 h-4" />
                                    無料ダウンロード
                                </Link>

                                <Link
                                    href="#features"
                                    className="px-6 py-3.5 border border-[#B8A888] hover:border-[#8A7860] text-[#7A6A50] hover:text-[#4A3A28] rounded-sm font-medium text-base transition-colors"
                                >
                                    機能を見る
                                </Link>
                            </div>

                            <p className="text-xs text-[#A89878] mt-5">
                                Windows 10/11 対応 · v{process.env.NEXT_PUBLIC_APP_VERSION}
                            </p>
                        </div>

                        {/* 右：付箋クラスター */}
                        <div className="flex-1 relative h-80 sm:h-96 w-full max-w-sm">

                            {/* 付箋1: 黄色（古紙） */}
                            <div className="absolute top-2 left-6 w-48 rounded-sm -rotate-2 z-20"
                                style={{
                                    backgroundColor: '#EDD87A',
                                    boxShadow: '3px 5px 16px rgba(0,0,0,0.18)',
                                }}>
                                <div className="h-3 rounded-t-sm" style={{ backgroundColor: '#D9C060' }} />
                                <div className="p-4">
                                    {/* テープ */}
                                    <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-10 h-4 rounded-sm opacity-60"
                                        style={{ backgroundColor: '#F0E0A0', border: '1px solid #D8C880', transform: 'translateX(-50%) rotate(1deg)' }} />
                                    <p className="text-sm font-medium text-[#3A2C00] leading-relaxed">
                                        MTG の議題<br />
                                        <span className="text-xs text-[#6A5200]">・来週の方向性<br />・予算確認</span>
                                    </p>
                                </div>
                            </div>

                            {/* 付箋2: 森の緑 */}
                            <div className="absolute top-14 right-2 w-44 rounded-sm rotate-1 z-10"
                                style={{
                                    backgroundColor: '#A8C890',
                                    boxShadow: '3px 5px 16px rgba(0,0,0,0.15)',
                                }}>
                                <div className="h-3 rounded-t-sm" style={{ backgroundColor: '#8BAF75' }} />
                                <div className="p-4">
                                    <p className="text-sm font-medium text-[#1E3A10] leading-relaxed">
                                        買うもの<br />
                                        <span className="text-xs text-[#2E5A20]">□ 牛乳<br />□ コーヒー ✓<br />□ A4ノート</span>
                                    </p>
                                </div>
                            </div>

                            {/* 付箋3: ナウシカのローブ色（テラコッタ） */}
                            <div className="absolute bottom-20 left-0 w-40 rounded-sm -rotate-1 z-20"
                                style={{
                                    backgroundColor: '#D4A48A',
                                    boxShadow: '3px 5px 16px rgba(0,0,0,0.15)',
                                }}>
                                <div className="h-3 rounded-t-sm" style={{ backgroundColor: '#BC8A70' }} />
                                <div className="p-4">
                                    <p className="text-sm font-medium text-[#3A1A08] leading-relaxed">
                                        ⚡ 今日中に！<br />
                                        <span className="text-xs text-[#6A3010]">報告書を送る</span>
                                    </p>
                                </div>
                            </div>

                            {/* 付箋4: 空の青 */}
                            <div className="absolute bottom-6 right-6 w-44 rounded-sm rotate-2 z-10"
                                style={{
                                    backgroundColor: '#9DC0D0',
                                    boxShadow: '3px 5px 16px rgba(0,0,0,0.14)',
                                }}>
                                <div className="h-3 rounded-t-sm" style={{ backgroundColor: '#7AAFC0' }} />
                                <div className="p-4">
                                    <p className="text-sm font-medium text-[#102030] leading-relaxed">
                                        アイデアメモ<br />
                                        <span className="text-xs text-[#204050]">もっとシンプルに<br />→ 付箋ぽく？</span>
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* 波形の区切り */}
            <div className="overflow-hidden leading-none" style={{ height: 40, backgroundColor: '#EDE4D3' }}>
                <svg viewBox="0 0 1200 40" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: '100%' }}>
                    <path d="M0,20 C300,40 900,0 1200,20 L1200,40 L0,40 Z" fill="#E2D7C3" />
                </svg>
            </div>

            {/* 主要機能セクション */}
            <section id="features" className="py-20 sm:py-24 px-6" style={{ backgroundColor: '#E2D7C3' }}>
                <div className="max-w-5xl mx-auto">
                    <div className="text-center mb-14">
                        <h2 className="text-3xl sm:text-4xl font-bold text-[#2C1F0E] mb-3">
                            壁に残す、という本能の、最新版
                        </h2>
                        <p className="text-[#8A7055]">シンプルだけど、こだわってます</p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-7">
                        {/* カード1: 古紙黄 */}
                        <div
                            className="-rotate-1 p-6 rounded-sm hover:rotate-0 transition-all duration-200 cursor-default"
                            style={{
                                backgroundColor: '#EDD87A',
                                boxShadow: '3px 5px 14px rgba(0,0,0,0.13)',
                            }}
                        >
                            <div className="h-2.5 -mx-6 -mt-6 rounded-t-sm mb-5" style={{ backgroundColor: '#D9C060' }} />
                            <div className="text-2xl mb-3">✏️</div>
                            <h3 className="text-lg font-bold text-[#3A2C00] mb-2">すぐ書ける</h3>
                            <p className="text-sm text-[#6A5200] leading-relaxed">
                                ワンクリックでクリックした場所から入力開始。自動保存で手間なし。
                            </p>
                        </div>

                        {/* カード2: 森の緑 */}
                        <div
                            className="rotate-1 p-6 rounded-sm hover:rotate-0 transition-all duration-200 cursor-default"
                            style={{
                                backgroundColor: '#A8C890',
                                boxShadow: '3px 5px 14px rgba(0,0,0,0.12)',
                            }}
                        >
                            <div className="h-2.5 -mx-6 -mt-6 rounded-t-sm mb-5" style={{ backgroundColor: '#8BAF75' }} />
                            <div className="text-2xl mb-3">🖊️</div>
                            <h3 className="text-lg font-bold text-[#1E3A10] mb-2">Markdownで書ける</h3>
                            <p className="text-sm text-[#2E5A20] leading-relaxed">
                                見出し・リスト・チェックボックス・画像まで対応。書きながら見た目が確認できるWYSIWYG。
                            </p>
                        </div>

                        {/* カード3: 空の青 */}
                        <div
                            className="-rotate-1 p-6 rounded-sm hover:rotate-0 transition-all duration-200 cursor-default"
                            style={{
                                backgroundColor: '#9DC0D0',
                                boxShadow: '3px 5px 14px rgba(0,0,0,0.12)',
                            }}
                        >
                            <div className="h-2.5 -mx-6 -mt-6 rounded-t-sm mb-5" style={{ backgroundColor: '#7AAFC0' }} />
                            <div className="text-2xl mb-3">📌</div>
                            <h3 className="text-lg font-bold text-[#102030] mb-2">デスクトップに残る</h3>
                            <p className="text-sm text-[#204050] leading-relaxed">
                                ピン留めで最前面固定。タグで整理して、必要なものだけを目の前に置ける。
                            </p>
                        </div>
                    </div>

                    {/* サブ機能 */}
                    <div className="grid sm:grid-cols-3 gap-4 mt-8">
                        {[
                            { emoji: '🔍', text: '全文検索（正規表現対応）' },
                            { emoji: '🔒', text: 'データはすべてローカル保存' },
                            { emoji: '🖼️', text: '画像の貼り付け・蛍光ペン対応' },
                        ].map((item) => (
                            <div key={item.text}
                                className="flex items-center gap-3 px-4 py-3 rounded-sm border text-sm text-[#6A5540]"
                                style={{ backgroundColor: '#EDE4D3', borderColor: '#C8B898' }}>
                                <span>{item.emoji}</span>
                                <span>{item.text}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* 波形の区切り（逆） */}
            <div className="overflow-hidden leading-none" style={{ height: 40, backgroundColor: '#E2D7C3' }}>
                <svg viewBox="0 0 1200 40" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: '100%' }}>
                    <path d="M0,20 C300,0 900,40 1200,20 L1200,0 L0,0 Z" fill="#EDE4D3" />
                </svg>
            </div>

            {/* プロモーション */}
            <section className="py-20 px-6" style={{ backgroundColor: '#EDE4D3' }}>
                <div className="max-w-4xl mx-auto">
                    <div className="relative">
                        {/* テープ装飾 */}
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 w-16 h-5 rounded-sm opacity-70 -rotate-1"
                            style={{ backgroundColor: '#F0E0A0', border: '1px solid #D8C880' }} />
                        <div className="rounded-sm overflow-hidden"
                            style={{
                                boxShadow: '4px 6px 24px rgba(0,0,0,0.18)',
                                border: '1px solid #C8B898',
                                aspectRatio: '1/1',
                                maxWidth: '560px',
                                margin: '0 auto',
                                background: '#000',
                            }}>
                            <video
                                ref={videoRef}
                                controls
                                loop
                                playsInline
                                className="w-full h-full block"
                                style={{ objectFit: 'cover' }}
                            >
                                <source src="/promo/promo2.mp4" type="video/mp4" />
                            </video>
                        </div>
                    </div>
                </div>
            </section>

            {/* スクリーンショット */}
            <section className="py-20 px-6" style={{ backgroundColor: '#E2D7C3' }}>
                <div className="max-w-5xl mx-auto">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl sm:text-4xl font-bold text-[#2C1F0E] mb-3">
                            こんな感じです
                        </h2>
                        <p className="text-[#8A7055]">デスクトップに、ちゃんと馴染みます</p>
                    </div>

                    <div className="relative">
                        {/* テープ装飾 */}
                        <div className="absolute -top-3 left-14 z-10 w-14 h-5 rounded-sm opacity-60 rotate-2"
                            style={{ backgroundColor: '#F0E0A0', border: '1px solid #D8C880' }} />
                        <div className="absolute -top-3 right-20 z-10 w-12 h-5 rounded-sm opacity-60 -rotate-1"
                            style={{ backgroundColor: '#F0E0A0', border: '1px solid #D8C880' }} />
                        <div className="rounded-sm overflow-hidden"
                            style={{
                                boxShadow: '4px 6px 24px rgba(0,0,0,0.15)',
                                border: '1px solid #C8B898',
                            }}>
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
            <section className="py-24 px-6" style={{ backgroundColor: '#EDE4D3' }}>
                <div className="max-w-lg mx-auto text-center">
                    {/* 大きな付箋カード */}
                    <div className="relative -rotate-1 rounded-sm px-10 py-12 mb-10"
                        style={{
                            backgroundColor: '#EDD87A',
                            boxShadow: '4px 6px 24px rgba(0,0,0,0.16)',
                        }}>
                        <div className="h-3.5 -mx-10 -mt-12 rounded-t-sm mb-10" style={{ backgroundColor: '#D9C060' }} />
                        {/* テープ */}
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-16 h-5 rounded-sm opacity-70 rotate-1"
                            style={{ backgroundColor: '#F0E0A0', border: '1px solid #D8C880' }} />

                        <h2 className="text-2xl font-bold text-[#2C1F0E] mb-2">
                            まず使ってみてください
                        </h2>
                        <p className="text-sm text-[#7A6200] mb-7">
                            無料・インストール1分・データはローカル保存
                        </p>
                        <Link
                            href={downloadUrl}
                            target="_blank"
                            className="inline-flex items-center gap-2 px-7 py-3 rounded-sm font-semibold text-[#F5EDD8] transition-all duration-200"
                            style={{
                                backgroundColor: '#5C7A3E',
                                boxShadow: '2px 3px 10px rgba(92,122,62,0.35)',
                            }}
                        >
                            <Download className="w-4 h-4" />
                            ダウンロード（Windows）
                        </Link>
                    </div>

                    <p className="text-sm text-[#9A8468] mb-6">Windows 10/11 (64-bit) · 約100MB</p>

                    <div className="flex flex-col sm:flex-row gap-4 justify-center text-sm">
                        <Link href="https://github.com/ore-no-fusen/ore-no-fusen" target="_blank"
                            className="text-[#5C7A3E] hover:text-[#3A5020] transition-colors">
                            📖 GitHubを見る
                        </Link>
                        <Link href="https://x.com/uchikiman" target="_blank"
                            className="text-[#5C7A3E] hover:text-[#3A5020] transition-colors">
                            💬 フィードバックを送る
                        </Link>
                    </div>
                </div>
            </section>

            {/* フッター */}
            <footer className="py-8 px-6 border-t" style={{ backgroundColor: '#D8CEBA', borderColor: '#C0B098' }}>
                <div className="max-w-5xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-[#8A7458]">
                    <div>© 2026 ore-no-fusen by ONF Studios. MIT License.</div>
                    <div className="flex gap-6">
                        <Link href="https://github.com/ore-no-fusen/ore-no-fusen" target="_blank"
                            className="hover:text-[#5A4830] transition-colors">GitHub</Link>
                        <Link href="https://github.com/ore-no-fusen/ore-no-fusen/blob/main/README.md" target="_blank"
                            className="hover:text-[#5A4830] transition-colors">ドキュメント</Link>
                    </div>
                </div>
            </footer>
        </div>
    );
}
