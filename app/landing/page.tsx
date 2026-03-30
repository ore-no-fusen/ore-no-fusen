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
import { Download, Send } from 'lucide-react';
import { useRef, useState, useEffect } from 'react';

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
    const inputRef = useRef<HTMLInputElement>(null);

    // 体験用付箋ステート
    const [demoNotes, setDemoNotes] = useState<{ id: number; text: string; color: string; rotation: number; topPos: number; leftPos: number }[]>([]);
    const [inputValue, setInputValue] = useState('');

    const demoColors = ['#EDD87A', '#A8C890', '#9DC0D0', '#D4A48A'];

    const addDemoNote = () => {
        if (inputValue.trim() === '') return;
        
        // 解析用
        if (typeof window !== 'undefined' && 'gtag' in window) {
            (window as any).gtag('event', 'demo_input', {
                event_category: 'engagement',
            });
        }
        
        const topPos = 10 + Math.random() * 40; 
        const leftPos = 10 + Math.random() * 40;

        const newNote = {
            id: Date.now(),
            text: inputValue,
            color: demoColors[demoNotes.length % demoColors.length],
            rotation: Math.random() * 8 - 4,
            topPos,
            leftPos
        };
        setDemoNotes((prev) => [newNote, ...prev].slice(0, 5));
        setInputValue('');
        
        // 送信後も続けて書けるようにフォーカスを維持
        if (inputRef.current) {
            inputRef.current.focus();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        // 日本語入力（IME）の変換確定のEnterでは送信しない
        if (e.nativeEvent.isComposing) return;
        
        if (e.key === 'Enter') {
            addDemoNote();
        }
    };

    // ページロード時に自動フォーカス
    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus();
        }
    }, []);

    return (
        <div
            className="min-h-screen text-[#2C1F0E] overflow-x-hidden"
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

            {/* 新・体験型ヒーローセクション */}
            <section className="relative overflow-hidden py-16 sm:py-24 px-6 min-h-[85vh] flex items-center">
                {/* 薄い点描模様 */}
                <div className="absolute inset-0 opacity-[0.04]"
                    style={{
                        backgroundImage: 'radial-gradient(circle, #5C7A3E 1px, transparent 1px)',
                        backgroundSize: '28px 28px'
                    }}
                />

                <div className="relative max-w-6xl mx-auto w-full">
                    <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">

                        {/* 左：体験入力エリア */}
                        <div className="flex-1 w-full text-center lg:text-left z-30">
                            <h1 className="text-4xl sm:text-5xl lg:text-[4rem] font-extrabold leading-tight tracking-tight mb-5 text-[#2C1F0E] drop-shadow-sm">
                                思考を1秒で貼る
                                <br />
                                <span className="text-[#5C7A3E]">付箋アプリ</span>
                            </h1>
                            <p className="text-lg sm:text-xl text-[#6A5540] mb-8 font-medium">
                                開いてすぐ書ける・自動保存・デスクトップ常駐
                            </p>

                            {/* 入力フォーム (最重要UI) */}
                            <div className="bg-white/80 p-5 sm:p-7 rounded-2xl shadow-lg border border-[#C8B89A]/80 mb-8 backdrop-blur-md transform transition-all hover:-translate-y-1 hover:shadow-xl duration-300">
                                <div className="relative">
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        value={inputValue}
                                        onChange={(e) => setInputValue(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        placeholder="ここに書いてみてください... (Enterで保存)"
                                        className="w-full text-lg sm:text-xl py-5 pl-5 pr-24 bg-[#FDFBF7] border-2 border-[#8BAF7C] rounded-xl focus:outline-none focus:border-[#5C7A3E] focus:ring-4 focus:ring-[#8BAF7C]/30 transition-all font-medium text-[#2C1F0E] placeholder:text-[#A89878] shadow-inner"
                                        autoComplete="off"
                                    />
                                    <button
                                        onClick={addDemoNote}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#5C7A3E] bg-[#F4F9F1] hover:bg-[#E8F0E4] px-4 py-2.5 rounded-lg border-2 border-[#8BAF7C]/60 shadow-sm transition-all cursor-pointer hover:scale-105 active:scale-95 flex items-center gap-1"
                                    >
                                        保存 (Enter ⏎)
                                    </button>
                                </div>
                            </div>

                            {/* CTAボタン */}
                            <div className="flex flex-col items-center lg:items-start gap-2">
                                <Link
                                    href={downloadUrl}
                                    target="_blank"
                                    onClick={() => {
                                        if (typeof window !== 'undefined' && 'gtag' in window) {
                                            (window as any).gtag('event', 'download_click', {
                                                event_category: 'engagement',
                                            });
                                        }
                                    }}
                                    className="flex items-center justify-center gap-3 px-8 py-4 bg-[#5C7A3E] hover:bg-[#4A6730] text-[#F5EDD8] rounded-xl font-bold text-lg shadow-[0_6px_20px_rgba(92,122,62,0.35)] hover:shadow-[0_8px_25px_rgba(92,122,62,0.5)] transition-all duration-300 w-full sm:w-auto hover:-translate-y-0.5"
                                >
                                    <Download className="w-5 h-5" />
                                    今すぐ付箋を使う（無料）
                                </Link>
                                <p className="text-sm text-[#8A7055] font-medium mt-1">
                                    ダウンロード不要で体験できます
                                </p>
                            </div>
                        </div>

                        {/* 右：付箋ビジュアル（動的） */}
                        <div className="flex-1 relative h-[380px] sm:h-[480px] w-full max-w-lg mx-auto z-20">
                            {/* デスクトップ見立ての枠 */}
                            <div className="absolute inset-0 bg-[#D8CEBA]/40 rounded-3xl border border-[#C8B89A]/60 shadow-inner overflow-hidden">
                                
                                {/* 成功体験の付箋（DOM生成） */}
                                {demoNotes.map((note, idx) => (
                                    <div
                                        key={note.id}
                                        className="absolute w-44 sm:w-56 rounded-sm shadow-xl transition-all duration-500 ease-out transform"
                                        style={{
                                            backgroundColor: note.color,
                                            top: `${note.topPos}%`,
                                            left: `${note.leftPos}%`,
                                            zIndex: 100 + demoNotes.length - idx,
                                            animation: `popIn_${note.id} 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards`,
                                        }}
                                    >
                                        <div className="h-3 rounded-t-sm" style={{ backgroundColor: 'rgba(0,0,0,0.06)' }} />
                                        <div className="p-4 sm:p-5 min-h-[100px] flex flex-col justify-between">
                                            <p className="text-base font-semibold text-[#2C1F0E] break-words whitespace-pre-wrap leading-relaxed">
                                                {note.text}
                                            </p>
                                        </div>
                                        <style dangerouslySetInnerHTML={{ __html: `
                                            @keyframes popIn_${note.id} {
                                                0% { opacity: 0; transform: scale(0.5) translateY(40px) rotate(0deg); }
                                                100% { opacity: 1; transform: scale(1) translateY(0) rotate(${note.rotation}deg); }
                                            }
                                        `}} />
                                    </div>
                                ))}

                                {/* 初期状態のガイド・ビジュアル */}
                                <div className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${demoNotes.length > 0 ? 'opacity-0' : 'opacity-100 flex items-center justify-center'}`}>
                                    <div className="text-center text-[#8A7055] z-10 px-4">
                                        <div className="text-5xl mb-4 animate-bounce">✨</div>
                                        <p className="font-bold text-lg">左の枠に入力して<br/>Enterを押してください</p>
                                    </div>
                                    
                                    {/* 背景にある薄い既存の付箋モック（雰囲気作り） */}
                                    <div className="absolute top-10 left-4 w-40 rounded-sm -rotate-6 opacity-30 shadow-md" style={{ backgroundColor: '#EDD87A'}}>
                                        <div className="h-2 rounded-t-sm bg-black/5" />
                                        <div className="p-4 h-24"></div>
                                    </div>
                                    <div className="absolute bottom-10 right-4 w-44 rounded-sm rotate-3 opacity-30 shadow-md" style={{ backgroundColor: '#A8C890'}}>
                                        <div className="h-2 rounded-t-sm bg-black/5" />
                                        <div className="p-4 h-24"></div>
                                    </div>
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

            {/* 波形の区切り（逆） */}
            <div className="overflow-hidden leading-none" style={{ height: 40, backgroundColor: '#E2D7C3' }}>
                <svg viewBox="0 0 1200 40" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: '100%' }}>
                    <path d="M0,20 C300,0 900,40 1200,20 L1200,0 L0,0 Z" fill="#EDE4D3" />
                </svg>
            </div>

            {/* 主要機能セクション */}
            <section id="features" className="py-20 sm:py-24 px-6" style={{ backgroundColor: '#EDE4D3' }}>
                <div className="max-w-5xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-4xl sm:text-5xl font-extrabold text-[#3A2C18] mb-10 leading-tight tracking-tight">
                            大事なことは、<br />
                            <span className="text-[#5C7A3E]">貼っておけばいい。</span>
                        </h2>
                        
                        {/* 復活したポエム */}
                        <div className="inline-block text-left pl-6 py-2 border-l-4 border-[#8BAF7C]/70 mb-8">
                            <p className="text-lg sm:text-xl text-[#6A5540] mb-3 leading-relaxed font-medium">
                                人は太古から、大事なことを壁に貼ってきた。<br />
                                ラスコーから続く習慣を、デスクトップへ。
                            </p>
                            <p className="text-sm sm:text-base text-[#8A7055] font-medium">
                                ── 本能は変わらない。形が変わった。
                            </p>
                        </div>

                        <p className="text-[#5C7A3E] font-bold text-lg mt-4 w-full text-center">壁に残す、という本能の、最新版</p>
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
                            <h3 className="text-lg font-bold text-[#1E3A10] mb-2">強調できる</h3>
                            <p className="text-sm text-[#2E5A20] leading-relaxed">
                                Markdown記法に対応。太字やリスト、チェックボックスを使い分けて、大事な思考を整理・強調。
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
                            <h3 className="text-lg font-bold text-[#102030] mb-2">そこに残る</h3>
                            <p className="text-sm text-[#204050] leading-relaxed">
                                常に最前面へピン留め可能。タグで整理して、必要な情報だけをいつもの場所に置いておけます。
                            </p>
                        </div>
                    </div>

                    {/* サブ機能 */}
                    <div className="grid sm:grid-cols-3 gap-4 mt-8">
                        {[
                            { emoji: '📱', text: 'iPhoneなどスマホとの連携' },
                            { emoji: '🖼️', text: 'クリップボードから画像貼り付け' },
                            { emoji: '📊', text: 'Mermaidでフローチャート変換' },
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

            {/* 波形の区切り */}
            <div className="overflow-hidden leading-none" style={{ height: 40, backgroundColor: '#EDE4D3' }}>
                <svg viewBox="0 0 1200 40" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: '100%' }}>
                    <path d="M0,20 C300,40 900,0 1200,20 L1200,40 L0,40 Z" fill="#E2D7C3" />
                </svg>
            </div>

            {/* プロモーション */}
            <section className="py-12 px-6" style={{ backgroundColor: '#E2D7C3' }}>
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
                                maxWidth: '280px',
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

            {/* 波形の区切り（逆） */}
            <div className="overflow-hidden leading-none" style={{ height: 40, backgroundColor: '#E2D7C3' }}>
                <svg viewBox="0 0 1200 40" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: '100%' }}>
                    <path d="M0,20 C300,0 900,40 1200,20 L1200,0 L0,0 Z" fill="#EDE4D3" />
                </svg>
            </div>

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
