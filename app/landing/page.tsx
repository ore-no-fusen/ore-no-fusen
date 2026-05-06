/**
 * ランディングページ (LandingPage) - Win+iPhone ユーザー訴求版
 *
 * 責務:
 * - Win+iPhoneユーザーへの差別化訴求
 * - アプリケーションの紹介とダウンロードリンクの提供
 * - VercelなどのWebホスティング環境での表示用ページ
 */

'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Download, Globe, Volume2, VolumeX } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

// ジブリ風カラーパレット（維持）
// 背景: #EDE4D3 (羊皮紙)
// 付箋黄: #EDD87A (古い紙の黄)
// 付箋緑: #8BAF7C / #A8C890 (トトロの緑)
// 付箋青: #7AAFC0 / #9DC0D0 (空と海)
// アクセント: #5C7A3E (森の深緑)
// テキスト: #2C1F0E (土の色)

export default function LandingPage() {
    const version = process.env.NEXT_PUBLIC_APP_VERSION ?? '';
    const downloadUrl = `https://github.com/ore-no-fusen/ore-no-fusen/releases/download/v${version}/ore-no-fusen_${version}_x64-setup.exe`;

    const [lang, setLang] = useState<'ja' | 'en'>('ja');

    useEffect(() => {
        const browserLang = navigator.language;
        if (!browserLang.toLowerCase().startsWith('ja')) {
            setLang('en');
        }
    }, []);

    const isEn = lang === 'en';

    useEffect(() => {
        document.title = isEn ? 'FUSEN' : '俺の付箋（OreNoFusen）';
    }, [isEn]);

    // PC→iPhone 連携アニメーション
    const noteTexts = isEn 
        ? ['Shopping List', 'MTG Agenda', 'Idea Memo', 'To-Do Today']
        : ['買い物リスト', 'MTGのアジェンダ', 'アイデアメモ', '今日やること'];
    const [noteIdx, setNoteIdx] = useState(0);
    const [iphoneNotes, setIphoneNotes] = useState<string[]>([]);
    const [isFlying, setIsFlying] = useState(false);

    useEffect(() => {
        setIphoneNotes([]);
        setNoteIdx(0);
    }, [isEn]);

    useEffect(() => {
        const timer = setInterval(() => {
            setIsFlying(true);
            setTimeout(() => {
                setIphoneNotes((prev) =>
                    [noteTexts[noteIdx % noteTexts.length], ...prev].slice(0, 3)
                );
                setIsFlying(false);
                setNoteIdx((prev) => prev + 1);
            }, 700);
        }, 2500);
        return () => clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [noteIdx]);

    // 速さの証拠動画 - 音声 ON/OFF
    const speedProofVideoRef = useRef<HTMLVideoElement>(null);
    const [speedProofMuted, setSpeedProofMuted] = useState(true);
    const toggleSpeedProofMute = () => {
        const v = speedProofVideoRef.current;
        if (!v) return;
        const next = !speedProofMuted;
        v.muted = next;
        // 音を出すタイミングで再生位置を Ctrl+N の少し前(0.5s)に巻き戻す
        if (!next) v.currentTime = 0.5;
        v.play().catch(() => { });
        setSpeedProofMuted(next);
        trackEvent('speed_proof_unmute');
    };

    // インタラクティブデモ用ステート
    const inputRef = useRef<HTMLInputElement>(null);
    const [demoNotes, setDemoNotes] = useState<{ id: number; text: string; color: string; rotation: number; topPos: number; leftPos: number; sentToIphone: boolean }[]>([]);
    const [inputValue, setInputValue] = useState('');
    const demoColors = ['#EDD87A', '#A8C890', '#9DC0D0', '#D4A48A'];

    const addDemoNote = () => {
        if (inputValue.trim() === '') return;
        trackEvent('demo_input');
        const newNote = {
            id: Date.now(),
            text: inputValue,
            color: demoColors[demoNotes.length % demoColors.length],
            rotation: Math.random() * 8 - 4,
            topPos: 10 + Math.random() * 40,
            leftPos: 10 + Math.random() * 40,
            sentToIphone: false,
        };
        setDemoNotes((prev) => [newNote, ...prev].slice(0, 5));
        setInputValue('');
        if (inputRef.current) inputRef.current.focus();
    };

    const sendDemoNoteToIphone = (id: number) => {
        setDemoNotes((prev) => prev.map((n) => n.id === id ? { ...n, sentToIphone: true } : n));
        trackEvent('demo_send_to_iphone');
    };

    const handleDemoKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Enter') addDemoNote();
    };

    const trackEvent = (event: string) => {
        if (typeof window !== 'undefined' && 'gtag' in window) {
            (window as any).gtag('event', event, { event_category: 'engagement' });
        }
    };

    return (
        <div
            className="min-h-screen text-[#2C1F0E] overflow-x-hidden"
            style={{
                backgroundColor: '#EDE4D3',
                fontFamily:
                    "'Helvetica Neue', 'Arial', 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, sans-serif",
            }}
        >
            {/* ナビゲーション */}
            <nav className="px-6 py-5 flex justify-between items-center border-b border-[#C8B89A]/40">
                <div className="text-xl font-bold tracking-wide text-[#2C1F0E]">
                    {isEn ? 'FUSEN' : '俺の付箋'}
                </div>
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setLang(isEn ? 'ja' : 'en')}
                        className="flex items-center gap-1.5 text-sm text-[#7A6A50] hover:text-[#5C7A3E] transition-colors font-medium border border-[#C8B89A] px-2.5 py-1 rounded-full bg-white/50"
                    >
                        <Globe className="w-4 h-4" />
                        {isEn ? 'English' : '日本語'}
                    </button>
                    <Link
                        href="https://github.com/ore-no-fusen/ore-no-fusen"
                        target="_blank"
                        className="flex items-center gap-2 text-sm text-[#7A6A50] hover:text-[#2C1F0E] transition-colors px-3 py-1.5 rounded border border-[#C8B89A]/60 hover:border-[#C8B89A]"
                    >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                        </svg>
                        GitHub
                    </Link>
                </div>
            </nav>

            {/* ==============================
                Hero セクション
            ============================== */}
            <section className="relative overflow-hidden py-20 sm:py-28 px-6 min-h-[90vh] flex items-center">
                {/* 背景ドット */}
                <div
                    className="absolute inset-0 opacity-[0.04]"
                    style={{
                        backgroundImage: 'radial-gradient(circle, #5C7A3E 1px, transparent 1px)',
                        backgroundSize: '28px 28px',
                    }}
                />

                <div className="relative max-w-6xl mx-auto w-full">
                    <div className="flex flex-col lg:flex-row items-center gap-16 lg:gap-24">

                        {/* === 左: コピー + チェックリスト + CTA === */}
                        <div className="flex-1 w-full text-center lg:text-left">

                            {/* バッジ */}
                            <div
                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold mb-6 text-[#5C7A3E]"
                                style={{ backgroundColor: '#D8EAC8', border: '1px solid #8BAF7C' }}
                            >
                                {isEn ? "📱 For Win + iPhone Users" : "📱 Win + iPhone ユーザーへ"}
                            </div>

                            {/* H1 */}
                            <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-extrabold leading-tight tracking-tight mb-4 text-[#2C1F0E] drop-shadow-sm">
                                {isEn ? (
                                    <>
                                        Send Windows sticky notes<br />
                                        to <span className="text-[#5C7A3E]">your iPhone.</span>
                                    </>
                                ) : (
                                    <>
                                        <span className="block">Windows付箋、</span>
                                        <span className="block text-[#5C7A3E]">iPhoneへ。</span>
                                    </>
                                )}
                            </h1>

                            {/* サブコピー */}
                            <p className="text-lg sm:text-xl text-[#6A5540] mb-5 font-medium leading-relaxed">
                                {isEn ? (
                                    <>
                                        Send selected notes between your PC and iPhone.
                                    </>
                                ) : (
                                    <>
                                        PCからも、iPhoneからも、<br className="sm:hidden" />
                                        選んだ付箋を送れる。
                                        それだけを、軽く。
                                    </>
                                )}
                            </p>

                            <div className="flex flex-wrap justify-center lg:justify-start gap-2 mb-7 text-sm font-semibold text-[#5A4030]">
                                {(isEn ? [
                                    'Fast notes',
                                    'Send both ways',
                                    'No server storage',
                                ] : [
                                    'すぐ書ける',
                                    '双方向に送る',
                                    'サーバー保存なし',
                                ]).map((label) => (
                                    <span
                                        key={label}
                                        className="rounded-full border border-[#C8B89A]/80 bg-white/55 px-3 py-1.5"
                                    >
                                        {label}
                                    </span>
                                ))}
                            </div>

                            {/* CTA */}
                            <div className="flex flex-col items-center lg:items-start gap-3">
                                <Link
                                    href={downloadUrl}
                                    target="_blank"
                                    onClick={() => trackEvent('download_click')}
                                    className="flex items-center justify-center gap-3 px-8 py-4 bg-[#5C7A3E] hover:bg-[#4A6730] text-[#F5EDD8] rounded-xl font-bold text-lg shadow-[0_6px_20px_rgba(92,122,62,0.35)] hover:shadow-[0_8px_25px_rgba(92,122,62,0.5)] transition-all duration-300 w-full sm:w-auto hover:-translate-y-0.5"
                                >
                                    <Download className="w-5 h-5" />
                                    {isEn ? "Download for Windows (Free)" : "Windowsに入れる（無料）"}
                                </Link>
                                <p className="text-xs text-[#9A8468]">
                                    {isEn ? "Windows 10/11 · Free · Your data stays with you" : "Windows 10/11 · 無料 · データはあなたの手元（PC＋自分の Drive）に"}
                                </p>

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full sm:w-auto text-[11px] text-[#5A4030]">
                                    {(isEn ? [
                                        'Free',
                                        'GitHub public',
                                        'No server storage',
                                        'Uninstall anytime',
                                    ] : [
                                        '無料',
                                        'GitHub公開',
                                        'サーバー保存なし',
                                        'いつでも削除可',
                                    ]).map((label) => (
                                        <span
                                            key={label}
                                            className="px-2.5 py-1.5 rounded-full border border-[#C8B89A]/80 bg-white/55 text-center font-semibold"
                                        >
                                            {label}
                                        </span>
                                    ))}
                                </div>

                                {/* winget 案内 */}
                                <div className="flex items-center gap-2 text-xs text-[#7A6A50] mt-1">
                                    <span>{isEn ? "or via winget:" : "winget でも入れられます:"}</span>
                                    <code className="px-2 py-1 rounded bg-[#2C1F0E]/85 text-[#F0E0A0] font-mono select-all">
                                        winget install ore-no-fusen
                                    </code>
                                </div>

                                {/* SmartScreen 注意書き（折り畳み） */}
                                <details className="text-xs text-[#7A6A50] mt-1 max-w-md">
                                    <summary className="cursor-pointer hover:text-[#5C7A3E] select-none">
                                        {isEn
                                            ? "ℹ️ Windows SmartScreen warning? — click here"
                                            : "ℹ️ SmartScreen の警告が出たら？"}
                                    </summary>
                                    <div className="mt-2 pl-4 leading-relaxed">
                                        {isEn ? (
                                            <>
                                                The installer is not Authenticode-signed (yet), so SmartScreen may warn on first launch.
                                                Click <strong>「More info」</strong> → <strong>「Run anyway」</strong> to proceed.
                                                You can also{' '}
                                                <Link
                                                    href="https://github.com/ore-no-fusen/ore-no-fusen/releases/latest"
                                                    target="_blank"
                                                    className="text-[#5C7A3E] underline"
                                                >
                                                    verify the SHA-256 hash
                                                </Link>{' '}
                                                on the release page.
                                            </>
                                        ) : (
                                            <>
                                                インストーラに Authenticode 署名を付けていないため、初回起動で SmartScreen が警告を出します。
                                                <strong>「詳細情報」</strong> → <strong>「実行」</strong> で進めます。
                                                心配な方は{' '}
                                                <Link
                                                    href="https://github.com/ore-no-fusen/ore-no-fusen/releases/latest"
                                                    target="_blank"
                                                    className="text-[#5C7A3E] underline"
                                                >
                                                    リリースページの SHA-256 ハッシュ
                                                </Link>{' '}
                                                でファイルを検証できます。
                                            </>
                                        )}
                                    </div>
                                </details>
                            </div>
                        </div>

                        {/* === 右: PC↔iPhone 連携アニメーション === */}
                        <div className="flex-1 w-full max-w-lg mx-auto">
                            <div className="flex items-center justify-center gap-4 sm:gap-8">

                                {/* PC側 */}
                                <div className="flex-1 flex flex-col items-center">
                                    <div
                                        className="w-full rounded-xl overflow-hidden shadow-xl border border-[#C8B898]"
                                        style={{ backgroundColor: '#D8CEBA' }}
                                    >
                                        {/* タイトルバー */}
                                        <div
                                            className="flex items-center gap-1.5 px-3 py-2 border-b border-[#C0B090]"
                                            style={{ backgroundColor: '#C8B890' }}
                                        >
                                            <div className="w-2.5 h-2.5 rounded-full bg-[#E87070]/70" />
                                            <div className="w-2.5 h-2.5 rounded-full bg-[#E8D070]/70" />
                                            <div className="w-2.5 h-2.5 rounded-full bg-[#70C870]/70" />
                                            <span className="text-[10px] text-[#8A7050] ml-1 font-medium">
                                                {isEn ? "FUSEN" : "俺の付箋"}
                                            </span>
                                        </div>
                                        {/* 付箋エリア */}
                                        <div className="p-3 min-h-[200px] relative overflow-hidden">
                                            {/* 常駐の付箋 */}
                                            <div
                                                className="absolute top-3 left-2 w-24"
                                                style={{
                                                    backgroundColor: '#A8C890',
                                                    padding: '7px',
                                                    borderRadius: '2px',
                                                    boxShadow: '2px 3px 8px rgba(0,0,0,0.15)',
                                                    transform: 'rotate(2deg)',
                                                }}
                                            >
                                                <div
                                                    className="h-1.5 -mx-2 -mt-2 mb-2 rounded-t-sm"
                                                    style={{ backgroundColor: '#8BAF75' }}
                                                />
                                                <p className="text-[10px] font-semibold text-[#1E3A10]">
                                                    {isEn ? <>Meeting<br />2:00 PM</> : <>会議メモ<br />14:00〜</>}
                                                </p>
                                            </div>
                                            <div
                                                className="absolute top-3 right-2 w-20"
                                                style={{
                                                    backgroundColor: '#9DC0D0',
                                                    padding: '7px',
                                                    borderRadius: '2px',
                                                    boxShadow: '2px 3px 8px rgba(0,0,0,0.15)',
                                                    transform: 'rotate(-1deg)',
                                                }}
                                            >
                                                <div
                                                    className="h-1.5 -mx-2 -mt-2 mb-2 rounded-t-sm"
                                                    style={{ backgroundColor: '#7AAFC0' }}
                                                />
                                                <p className="text-[10px] font-semibold text-[#102030]">
                                                    {isEn ? "Reading Notes" : "読書メモ"}
                                                </p>
                                            </div>
                                            {/* フライング付箋（iPhoneへ飛ぶ） */}
                                            <div
                                                className="absolute bottom-3 w-28 text-center"
                                                style={{
                                                    backgroundColor: '#EDD87A',
                                                    padding: '8px',
                                                    borderRadius: '2px',
                                                    boxShadow: '2px 3px 8px rgba(0,0,0,0.15)',
                                                    left: '50%',
                                                    transition: 'opacity 0.6s ease, transform 0.6s ease',
                                                    opacity: isFlying ? 0 : 1,
                                                    transform: isFlying
                                                        ? 'translateX(60px) scale(0.6)'
                                                        : 'translateX(-50%) scale(1)',
                                                }}
                                            >
                                                <div
                                                    className="h-1.5 -mx-2 -mt-2 mb-2 rounded-t-sm"
                                                    style={{ backgroundColor: '#D9C060' }}
                                                />
                                                <p className="text-[10px] font-semibold text-[#3A2C00]">
                                                    {noteTexts[noteIdx % noteTexts.length]}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    <p className="text-center text-xs text-[#8A7055] mt-2 font-medium">
                                        💻 Windows PC
                                    </p>
                                </div>

                                {/* 矢印（選んだ付箋を送る） */}
                                <div className="flex flex-col items-center gap-1 flex-shrink-0">
                                    <div
                                        className="text-2xl font-bold text-[#8BAF7C]"
                                        style={{ animation: 'pulse 2s infinite' }}
                                    >
                                        ⇄
                                    </div>
                                    <div className="text-[9px] text-[#A89878] text-center leading-tight font-medium">
                                        {isEn ? <>Choose<br />Send</> : <>選んで<br />送る</>}
                                    </div>
                                </div>

                                {/* iPhone側 */}
                                <div className="flex-1 flex flex-col items-center">
                                    {/* iPhoneフレーム */}
                                    <div
                                        className="relative shadow-xl"
                                        style={{
                                            backgroundColor: '#1C1C1E',
                                            borderRadius: '24px',
                                            padding: '8px 5px',
                                            width: '110px',
                                            border: '1px solid #3A3A3C',
                                        }}
                                    >
                                        {/* Dynamic Island風ノッチ */}
                                        <div
                                            className="absolute z-10"
                                            style={{
                                                top: '12px',
                                                left: '50%',
                                                transform: 'translateX(-50%)',
                                                width: '40px',
                                                height: '10px',
                                                backgroundColor: '#1C1C1E',
                                                borderRadius: '5px',
                                            }}
                                        />
                                        {/* 画面 */}
                                        <div
                                            className="overflow-hidden min-h-[185px] pt-5"
                                            style={{
                                                backgroundColor: '#F5F0E8',
                                                borderRadius: '18px',
                                            }}
                                        >
                                            <div className="px-2 py-1.5">
                                                <p className="text-[9px] font-bold text-[#5C4430] mb-2 pl-0.5">
                                                    {isEn ? "FUSEN" : "俺の付箋"}
                                                </p>
                                                {iphoneNotes.map((note, i) => (
                                                    <div
                                                        key={`${note}-${i}`}
                                                        className="mb-1.5 rounded-sm px-2 py-1.5"
                                                        style={{
                                                            backgroundColor:
                                                                i === 0
                                                                    ? '#EDD87A'
                                                                    : i === 1
                                                                        ? '#A8C890'
                                                                        : '#9DC0D0',
                                                            opacity: i === 0 ? 1 : i === 1 ? 0.8 : 0.6,
                                                            transform: `scale(${i === 0 ? 1 : 0.95})`,
                                                            boxShadow: '1px 2px 4px rgba(0,0,0,0.1)',
                                                            transition: 'all 0.4s ease',
                                                        }}
                                                    >
                                                        <p className="text-[9px] font-semibold text-[#2C1F0E]">
                                                            {note}
                                                        </p>
                                                    </div>
                                                ))}
                                                {iphoneNotes.length === 0 && (
                                                    <p className="text-[9px] text-[#A89878] text-center mt-6 leading-relaxed">
                                                        {isEn ? <>Arrives<br />from PC</> : <>PCから<br />届きます</>}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <p className="text-center text-xs text-[#8A7055] mt-2 font-medium">
                                        📱 iPhone
                                    </p>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </section>

            {/* 波形の区切り */}
            <div className="overflow-hidden leading-none" style={{ height: 40, backgroundColor: '#EDE4D3' }}>
                <svg
                    viewBox="0 0 1200 40"
                    preserveAspectRatio="none"
                    style={{ display: 'block', width: '100%', height: '100%' }}
                >
                    <path d="M0,20 C300,40 900,0 1200,20 L1200,40 L0,40 Z" fill="#E2D7C3" />
                </svg>
            </div>

            {/* ==============================
                実物スクリーンショット + 初回手順
            ============================== */}
            <section className="py-16 px-6" style={{ backgroundColor: '#E2D7C3' }}>
                <div className="max-w-6xl mx-auto grid lg:grid-cols-[1.35fr_0.95fr] gap-10 items-center">
                    <div>
                        <div className="text-center lg:text-left mb-6">
                            <div
                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold mb-4 text-[#5C7A3E]"
                                style={{ backgroundColor: '#D8EAC8', border: '1px solid #8BAF7C' }}
                            >
                                {isEn ? "🖥️ Real Windows app" : "🖥️ 実際のWindowsアプリ画面"}
                            </div>
                            <h2 className="text-3xl sm:text-4xl font-bold text-[#2C1F0E] mb-3">
                                {isEn ? "A sticky note that lives on your desktop." : "デスクトップに、ちゃんと貼りつきます。"}
                            </h2>
                            <p className="text-[#8A7055] leading-relaxed">
                                {isEn
                                    ? "It is not just a web demo. It is a lightweight Windows app that opens fast, stays visible, and can send notes to your own iPhone."
                                    : "Webの見た目だけではなく、実際にWindowsへ入れて使う軽い付箋アプリです。すばやく開き、画面に残り、必要なら自分のiPhoneでも見られます。"}
                            </p>
                        </div>

                        <div className="relative">
                            <div
                                className="absolute -top-3 left-10 z-10 w-14 h-5 rounded-sm opacity-60 rotate-2"
                                style={{ backgroundColor: '#F0E0A0', border: '1px solid #D8C880' }}
                            />
                            <div
                                className="rounded-sm overflow-hidden"
                                style={{
                                    boxShadow: '4px 6px 24px rgba(0,0,0,0.15)',
                                    border: '1px solid #C8B898',
                                }}
                            >
                                <Image
                                    src="/screenshots/ScreenShot_OreNoFusen.png"
                                    alt="俺の付箋の実際のWindows画面"
                                    width={1200}
                                    height={800}
                                    className="w-full h-auto"
                                    priority
                                />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="rounded-2xl border border-[#C8B89A]/80 bg-white/65 p-6 shadow-md">
                            <h3 className="text-xl font-bold text-[#2C1F0E] mb-2">
                                {isEn ? "Start in 3 steps." : "3ステップで使えます。"}
                            </h3>
                            <p className="mb-4 text-sm text-[#8A7055]">
                                {isEn ? "Install, connect Drive, open on iPhone." : "入れる、Driveをつなぐ、iPhoneで開く。"}
                            </p>
                            <ol className="space-y-3 text-sm text-[#5A4030] leading-relaxed">
                                {(isEn ? [
                                    ['Windows', 'Install the app.'],
                                    ['Google Drive', 'Use your own Drive to pass notes.'],
                                    ['iPhone', 'Add it to your Home Screen.'],
                                ] : [
                                    ['Windows', 'アプリを入れる。'],
                                    ['Google Drive', '自分のDriveで受け渡す。'],
                                    ['iPhone', 'ホーム画面に追加する。'],
                                ]).map(([title, text], index) => (
                                    <li key={title} className="flex gap-3">
                                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#5C7A3E] text-sm font-bold text-[#F5EDD8]">
                                            {index + 1}
                                        </span>
                                        <span className="pt-0.5">
                                            <span className="font-bold text-[#2C1F0E]">{title}</span>
                                            <span className="mx-2 text-[#C8B89A]">/</span>
                                            <span>{text}</span>
                                        </span>
                                    </li>
                                ))}
                            </ol>
                        </div>

                        <div className="rounded-xl border border-[#C8B89A]/80 bg-[#F7F0E2]/80 p-4 text-sm text-[#5A4030] leading-relaxed">
                            {isEn ? (
                                <>
                                    Notes stay on your PC and, when sent, your own Google Drive. Source and releases are available on GitHub.
                                </>
                            ) : (
                                <>
                                    付箋はPCと、受け渡した分だけ自分のGoogle Driveに保存。ソースとリリースはGitHubで確認できます。
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </section>

            {/* ==============================
                速さの証拠（実測動画）セクション
            ============================== */}
            <section className="py-20 px-6" style={{ backgroundColor: '#E2D7C3' }}>
                <div className="max-w-4xl mx-auto">
                    <div className="text-center mb-10">
                        <div
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold mb-4 text-[#5C7A3E]"
                            style={{ backgroundColor: '#D8EAC8', border: '1px solid #8BAF7C' }}
                        >
                            {isEn ? "🎬 Real measurement, no edit" : "🎬 実測・無編集（キー押下含む）"}
                        </div>
                        <h2 className="text-3xl sm:text-4xl font-bold text-[#2C1F0E] mb-3">
                            {isEn ? "It really is fast." : "本当に、速い。"}
                        </h2>
                        <p className="text-[#8A7055] text-base sm:text-lg">
                            {isEn
                                ? <>Measured: <span className="font-bold text-[#5C7A3E]">0.04 s</span> from Ctrl + N to a writable note. Designed worst case: 0.3 s.</>
                                : <>Ctrl + N から書ける状態まで <span className="font-bold text-[#5C7A3E]">実測 0.04 秒</span>。設計上限は 0.3 秒。</>}
                        </p>
                    </div>

                    <div className="relative max-w-2xl mx-auto">
                        {/* テープ装飾（LPの既存デザインに揃える） */}
                        <div
                            className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 w-16 h-5 rounded-sm opacity-70 -rotate-1"
                            style={{ backgroundColor: '#F0E0A0', border: '1px solid #D8C880' }}
                        />
                        <div
                            className="relative rounded-sm overflow-hidden"
                            style={{
                                boxShadow: '4px 6px 24px rgba(0,0,0,0.18)',
                                border: '1px solid #C8B898',
                                background: '#1a1a1a',
                            }}
                        >
                            <video
                                ref={speedProofVideoRef}
                                autoPlay
                                muted={speedProofMuted}
                                loop
                                playsInline
                                preload="metadata"
                                poster="/screenshots/ScreenShot_OreNoFusen.png"
                                className="w-full h-auto block"
                            >
                                <source src="/promo/speed-proof.mp4" type="video/mp4" />
                            </video>
                            <button
                                type="button"
                                onClick={toggleSpeedProofMute}
                                aria-label={speedProofMuted
                                    ? (isEn ? 'Unmute video' : '動画の音を出す')
                                    : (isEn ? 'Mute video' : '動画をミュートする')}
                                className="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/55 hover:bg-black/75 text-white text-xs font-semibold backdrop-blur-sm transition-all duration-150 shadow-md"
                            >
                                {speedProofMuted ? (
                                    <>
                                        <VolumeX className="w-4 h-4" />
                                        <span>{isEn ? 'Sound off' : '音 OFF'}</span>
                                    </>
                                ) : (
                                    <>
                                        <Volume2 className="w-4 h-4" />
                                        <span>{isEn ? 'Sound on' : '音 ON'}</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    <p className="text-center text-xs text-[#9A8468] mt-5 leading-relaxed">
                        {isEn
                            ? <>Measured at 50 fps. Keypress visualization by NohBoard (lower right).<br />Pool window technique: a transparent window pre-launched, made opaque on Ctrl+N.</>
                            : <>50 fps で計測。右下のキーボード表示は NohBoard。<br />Pool 機構：透明な窓を待機させて Ctrl+N で不透明化する仕組みです。</>}
                    </p>
                </div>
            </section>

            {/* 波形の区切り */}
            <div className="overflow-hidden leading-none" style={{ height: 40, backgroundColor: '#E2D7C3' }}>
                <svg viewBox="0 0 1200 40" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: '100%' }}>
                    <path d="M0,20 C300,0 900,40 1200,20 L1200,0 L0,0 Z" fill="#E2D7C3" />
                </svg>
            </div>

            {/* ==============================
                棲み分け：Sticky Notes と Excel の、あいだ
            ============================== */}
            <section className="py-20 px-6" style={{ backgroundColor: '#EDE4D3' }}>
                <div className="max-w-5xl mx-auto">
                    <div className="text-center mb-10">
                        <h2 className="text-3xl sm:text-4xl font-bold text-[#2C1F0E] mb-3">
                            {isEn
                                ? <>Why not just <span className="text-[#5C7A3E]">Sticky Notes</span> or <span className="text-[#5C7A3E]">Excel</span>?</>
                                : <><span className="text-[#5C7A3E]">Sticky Notes</span> でも <span className="text-[#5C7A3E]">Excel</span> でもない理由。</>}
                        </h2>
                        <p className="text-[#8A7055] max-w-2xl mx-auto leading-relaxed">
                            {isEn
                                ? <>Sticky Notes is fast, but too limited. Excel is flexible, but too heavy.<br className="hidden sm:inline" /> OreNoFusen is for the small notes you want to keep visible and carry to iPhone.</>
                                : <>Sticky Notes は速いが、できることが少ない。Excel は自由だが、ちょっと重い。<br className="hidden sm:inline" />俺の付箋は、見える場所に貼って、必要ならiPhoneでも見るための道具です。</>}
                        </p>
                    </div>

                    {/* ポジショニング・チャート（2軸スキャタープロット） */}
                    <div className="bg-white/60 rounded-2xl border border-[#C8B89A]/70 p-6 sm:p-10 mb-12 shadow-md">
                        <div className="text-center mb-4">
                            <p className="text-xs font-bold text-[#8A7055] uppercase tracking-widest">
                                {isEn ? "Positioning" : "ポジショニング・チャート"}
                            </p>
                        </div>
                        <div className="relative mx-auto" style={{ maxWidth: 600, paddingLeft: 56, paddingBottom: 36, paddingTop: 12, paddingRight: 12 }}>
                            {/* チャート本体 */}
                            <div className="relative h-72 sm:h-80 border-l-2 border-b-2 border-[#8A7055]/50">
                                {/* 縦軸ラベル */}
                                <div className="absolute -left-12 top-0 text-xs text-[#5C7A3E] font-bold leading-tight">
                                    <div>↑ {isEn ? "Fast" : "速い"}</div>
                                </div>
                                <div className="absolute -left-12 bottom-0 text-xs text-[#A53C2C] font-bold leading-tight">
                                    <div>↓ {isEn ? "Slow" : "遅い"}</div>
                                </div>
                                {/* 横軸ラベル */}
                                <div className="absolute -bottom-7 left-0 text-xs text-[#A53C2C] font-bold">
                                    ← {isEn ? "Can't draw" : "書けない"}
                                </div>
                                <div className="absolute -bottom-7 right-0 text-xs text-[#5C7A3E] font-bold">
                                    {isEn ? "Can draw" : "書ける"} →
                                </div>

                                {/* Sticky Notes - 左上（速い・書けない） */}
                                <div className="absolute" style={{ top: '14%', left: '12%', transform: 'translate(-50%, -50%)' }}>
                                    <div className="flex flex-col items-center">
                                        <div className="w-4 h-4 rounded-full bg-[#7A6A50] shadow" />
                                        <div className="text-xs mt-2 whitespace-nowrap text-[#5A4030] font-medium">📌 Sticky Notes</div>
                                    </div>
                                </div>

                                {/* Excel - 右下（遅い・書ける） */}
                                <div className="absolute" style={{ top: '78%', left: '78%', transform: 'translate(-50%, -50%)' }}>
                                    <div className="flex flex-col items-center">
                                        <div className="w-4 h-4 rounded-full bg-[#7A6A50] shadow" />
                                        <div className="text-xs mt-2 whitespace-nowrap text-[#5A4030] font-medium">📊 Excel</div>
                                    </div>
                                </div>

                                {/* 俺の付箋 - 右上（速い・書ける）= 隙間 */}
                                <div className="absolute" style={{ top: '14%', left: '78%', transform: 'translate(-50%, -50%)' }}>
                                    <div className="flex flex-col items-center">
                                        <div className="relative">
                                            <div className="absolute inset-0 w-7 h-7 rounded-full bg-[#8BAF7C] animate-ping opacity-50" style={{ left: -6, top: -6 }} />
                                            <div className="relative w-4 h-4 rounded-full bg-[#5C7A3E] ring-4 ring-[#8BAF7C]/40 shadow" />
                                        </div>
                                        <div className="text-xs mt-2 whitespace-nowrap font-bold text-[#5C7A3E]">⭐ {isEn ? "OreNoFusen" : "俺の付箋"}</div>
                                        <div className="text-[10px] text-[#8A7055] mt-0.5">+ 📱 iPhone</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <p className="text-center text-xs text-[#8A7055] mt-8">
                            {isEn
                                ? "The top-right corner had nobody. So we built it."
                                : "右上に居る人がいなかったので、自分で作りました。"}
                        </p>
                    </div>

                    {/* 3列比較カード */}
                    <div className="grid md:grid-cols-3 gap-7">
                        {/* Sticky Notes */}
                        <div className="rotate-1 p-6 rounded-sm transition-all duration-200 hover:rotate-0" style={{ backgroundColor: '#E2D7C3', boxShadow: '3px 5px 14px rgba(0,0,0,0.13)' }}>
                            <div className="h-2.5 -mx-6 -mt-6 rounded-t-sm mb-5" style={{ backgroundColor: '#C8B898' }} />
                            <div className="text-2xl mb-2">📌</div>
                            <div className="text-[10px] font-bold text-[#8A7055] uppercase tracking-widest mb-1">Microsoft</div>
                            <h3 className="text-lg font-bold text-[#2C1F0E] mb-4">Sticky Notes</h3>
                            <ul className="text-sm text-[#5A4030] space-y-2 leading-relaxed">
                                <li>⚡ {isEn ? "Fast launch" : "起動が速い"}</li>
                                <li>📌 {isEn ? "Sticks on desktop" : "付箋として常駐"}</li>
                                <li className="text-[#A53C2C]">❌ {isEn ? "Can't draw on images" : "画像に書き込めない"}</li>
                                <li className="text-[#A53C2C]">❌ {isEn ? "No iPhone handoff" : "iPhone と繋がらない"}</li>
                            </ul>
                        </div>

                        {/* Excel */}
                        <div className="-rotate-1 p-6 rounded-sm transition-all duration-200 hover:rotate-0" style={{ backgroundColor: '#E2D7C3', boxShadow: '3px 5px 14px rgba(0,0,0,0.13)' }}>
                            <div className="h-2.5 -mx-6 -mt-6 rounded-t-sm mb-5" style={{ backgroundColor: '#C8B898' }} />
                            <div className="text-2xl mb-2">📊</div>
                            <div className="text-[10px] font-bold text-[#8A7055] uppercase tracking-widest mb-1">Microsoft</div>
                            <h3 className="text-lg font-bold text-[#2C1F0E] mb-4">Excel</h3>
                            <ul className="text-sm text-[#5A4030] space-y-2 leading-relaxed">
                                <li>🖋️ {isEn ? "Draw on images" : "画像に書き込める"}</li>
                                <li>📐 {isEn ? "Free layout" : "自由なレイアウト"}</li>
                                <li className="text-[#A53C2C]">❌ {isEn ? "Slow to launch" : "起動が遅い"}</li>
                                <li className="text-[#A53C2C]">❌ {isEn ? "Not a sticky note" : "付箋として常駐できない"}</li>
                            </ul>
                        </div>

                        {/* 俺の付箋（ハイライト） */}
                        <div className="rotate-1 p-6 rounded-sm border-2 transition-all duration-200 hover:rotate-0 relative" style={{ backgroundColor: '#EDD87A', borderColor: '#5C7A3E', boxShadow: '4px 6px 18px rgba(92,122,62,0.25)' }}>
                            <div className="h-2.5 -mx-6 -mt-6 rounded-t-sm mb-5" style={{ backgroundColor: '#D9C060' }} />
                            <div className="absolute -top-3 -right-3 px-3 py-1 rounded-full text-[10px] font-bold text-[#F5EDD8] uppercase tracking-wider" style={{ backgroundColor: '#5C7A3E' }}>
                                ⭐ {isEn ? "The fit" : "隙間にぴったり"}
                            </div>
                            <div className="text-2xl mb-2">📝</div>
                            <div className="text-[10px] font-bold text-[#5C7A3E] uppercase tracking-widest mb-1">ONF Studios</div>
                            <h3 className="text-lg font-bold text-[#3A2C00] mb-4">{isEn ? "OreNoFusen" : "俺の付箋"}</h3>
                            <ul className="text-sm text-[#3A2C00] space-y-2 leading-relaxed font-medium">
                                <li>⚡ {isEn ? "0.3 s launch (Ctrl+N)" : "起動 0.3 秒（Ctrl+N）"}</li>
                                <li>📌 {isEn ? "Sticks on desktop" : "付箋として常駐"}</li>
                                <li>🖋️ {isEn ? "Draw on images" : "画像に書き込める"}</li>
                                <li>📱 {isEn ? "Reaches your iPhone" : "iPhone と繋がる"}</li>
                            </ul>
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

            {/* ==============================
                「こんな使い方」シナリオセクション
            ============================== */}
            <section className="py-20 px-6" style={{ backgroundColor: '#E2D7C3' }}>
                <div className="max-w-5xl mx-auto">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl sm:text-4xl font-bold text-[#2C1F0E] mb-3">
                            {isEn ? "How to use" : "こんな使い方"}
                        </h2>
                        <p className="text-[#8A7055]">
                            {isEn ? "What you can do with Win + iPhone" : "Win + iPhone の組み合わせで、こんなことができます"}
                        </p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-6">
                        {(isEn ? [
                            {
                                emoji: '🖥️',
                                scene: 'Personal PC',
                                title: 'When something comes to mind at home',
                                desc: 'Write it on your Windows sticky note. Check it later from your iPhone.',
                                color: '#EDD87A',
                                topColor: '#D9C060',
                                textColor: '#3A2C00',
                                rotation: '-rotate-1',
                            },
                            {
                                emoji: '📱',
                                scene: 'On the go',
                                title: 'Take notes on the go',
                                desc: 'Jot down ideas on your iPhone commuting. They are stuck to your PC desktop when you get home.',
                                color: '#A8C890',
                                topColor: '#8BAF75',
                                textColor: '#1E3A10',
                                rotation: 'rotate-1',
                            },
                            {
                                emoji: '📌',
                                scene: 'Always visible',
                                title: 'Keep them where you see them',
                                desc: "Stays on your PC screen. Doesn't disappear. Lightweight. No need to open Notion.",
                                color: '#9DC0D0',
                                topColor: '#7AAFC0',
                                textColor: '#102030',
                                rotation: '-rotate-1',
                            },
                        ] : [
                            {
                                emoji: '🖥️',
                                scene: '自宅PC',
                                title: '家のPCでふと思ったら',
                                desc: 'Windowsの付箋に書く。あとでiPhoneでも見られる。',
                                color: '#EDD87A',
                                topColor: '#D9C060',
                                textColor: '#3A2C00',
                                rotation: '-rotate-1',
                            },
                            {
                                emoji: '🍳',
                                scene: 'キッチン・お買い物',
                                title: 'レシピメモを片手に料理',
                                desc: 'PCで見つけたレシピのコツを付箋に。キッチンではiPhoneを立てかけて、それを見ながら料理。',
                                color: '#A8C890',
                                topColor: '#8BAF75',
                                textColor: '#1E3A10',
                                rotation: 'rotate-1',
                            },
                            {
                                emoji: '📌',
                                scene: 'デスクトップ常駐',
                                title: 'いつもの場所に貼っておく',
                                desc: 'PCの画面に常駐。消えない。重くない。Notionを開かなくていい。',
                                color: '#9DC0D0',
                                topColor: '#7AAFC0',
                                textColor: '#102030',
                                rotation: '-rotate-1',
                            },
                        ]).map((item) => (
                            <div
                                key={item.title}
                                className={`${item.rotation} p-6 rounded-sm hover:rotate-0 transition-all duration-200 cursor-default`}
                                style={{
                                    backgroundColor: item.color,
                                    boxShadow: '3px 5px 14px rgba(0,0,0,0.13)',
                                }}
                            >
                                <div
                                    className="h-2.5 -mx-6 -mt-6 rounded-t-sm mb-5"
                                    style={{ backgroundColor: item.topColor }}
                                />
                                <div
                                    className="text-[10px] font-bold px-2 py-0.5 rounded-full inline-block mb-3"
                                    style={{
                                        backgroundColor: 'rgba(0,0,0,0.08)',
                                        color: item.textColor,
                                    }}
                                >
                                    {item.scene}
                                </div>
                                <div className="text-2xl mb-3">{item.emoji}</div>
                                <h3
                                    className="text-base font-bold mb-2"
                                    style={{ color: item.textColor }}
                                >
                                    {item.title}
                                </h3>
                                <p
                                    className="text-sm leading-relaxed"
                                    style={{ color: item.textColor, opacity: 0.8 }}
                                >
                                    {item.desc}
                                </p>
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

            {/* ==============================
                体験デモセクション
            ============================== */}
            <section className="py-20 px-6" style={{ backgroundColor: '#EDE4D3' }}>
                <div className="max-w-5xl mx-auto">
                    <div className="text-center mb-10">
                        <h2 className="text-3xl sm:text-4xl font-bold text-[#2C1F0E] mb-3">
                            {isEn ? "Write on Windows, then send to iPhone." : "Windows で書いて、iPhone へ送る。"}
                        </h2>
                        <p className="text-[#8A7055]">
                            {isEn
                                ? <>No download required. Press Enter to stick on PC, then tap 📱→ to send. <span className="text-[#A53C2C]">(In the real app: right-click the note → &ldquo;Send to iPhone&rdquo;.)</span></>
                                : <>ダウンロード不要。Enter で PC に貼り、付箋の 📱→ ボタンで iPhone に送ります。<span className="text-[#A53C2C]">（実アプリでは付箋を右クリック→「iPhoneへ送る」です。）</span></>}
                        </p>
                    </div>

                    <div className="flex flex-col lg:flex-row items-start gap-8">
                        {/* 入力エリア */}
                        <div className="w-full lg:w-80 flex-shrink-0">
                            <div className="bg-white/80 p-5 sm:p-6 rounded-2xl shadow-lg border border-[#C8B89A]/80 backdrop-blur-md">
                                <label className="block text-sm font-bold text-[#4A6730] mb-3 flex items-center gap-2">
                                    <span className="text-lg">💡</span> {isEn ? "Write on Windows" : "Windows側で書く"}
                                </label>
                                <div className="relative">
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        value={inputValue}
                                        onChange={(e) => setInputValue(e.target.value)}
                                        onKeyDown={handleDemoKeyDown}
                                        placeholder={isEn ? "Recipe idea, shopping list..." : "例：今夜はカレー（玉ねぎ忘れない！）"}
                                        className="w-full text-base py-4 pl-4 pr-28 bg-[#FDFBF7] border-2 border-[#8BAF7C] rounded-xl focus:outline-none focus:border-[#5C7A3E] focus:ring-4 focus:ring-[#8BAF7C]/30 transition-all font-medium text-[#2C1F0E] placeholder:text-[#A89878] shadow-inner"
                                        autoComplete="off"
                                    />
                                    <button
                                        onClick={addDemoNote}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-[#5C7A3E] bg-[#F4F9F1] hover:bg-[#E8F0E4] px-3 py-2 rounded-lg border-2 border-[#8BAF7C]/60 shadow-sm transition-all cursor-pointer hover:scale-105 active:scale-95"
                                    >
                                        {isEn ? "Send ⏎" : "送る ⏎"}
                                    </button>
                                </div>
                                <p className="text-xs text-[#A89878] mt-2 text-right">{isEn ? "Press Enter to stick" : "Enterでも貼れます"}</p>
                            </div>
                        </div>

                        {/* 付箋キャンバス */}
                        <div className="flex-1 w-full">
                            <div
                                className="relative w-full rounded-2xl border border-[#C8B89A]/60 shadow-inner overflow-hidden"
                                style={{ backgroundColor: '#D8CEBA', minHeight: '280px' }}
                            >
                                <div className="absolute left-4 top-4 rounded-full bg-white/70 px-3 py-1 text-xs font-bold text-[#5C7A3E] border border-[#C8B89A]/70">
                                    {isEn ? "Windows sticky note" : "Windowsの付箋"}
                                </div>
                                <div className="absolute right-4 top-4 rounded-full bg-white/70 px-3 py-1 text-xs font-bold text-[#5C7A3E] border border-[#C8B89A]/70">
                                    {isEn ? "iPhone view" : "iPhoneでも見る"}
                                </div>

                                {/* 付箋（PC側） */}
                                {demoNotes.map((note, idx) => (
                                    <div
                                        key={note.id}
                                        className="absolute w-44 sm:w-52 rounded-sm shadow-xl"
                                        style={{
                                            backgroundColor: note.color,
                                            top: `${note.topPos}%`,
                                            left: `${note.leftPos}%`,
                                            zIndex: 100 + demoNotes.length - idx,
                                            animation: 'demoPopIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
                                            transform: `rotate(${note.rotation}deg)`,
                                        }}
                                    >
                                        <div className="h-2.5 rounded-t-sm" style={{ backgroundColor: 'rgba(0,0,0,0.08)' }} />
                                        <div className="p-4 min-h-[90px]">
                                            <p className="text-sm font-semibold text-[#2C1F0E] break-words whitespace-pre-wrap leading-relaxed">
                                                {note.text}
                                            </p>
                                        </div>
                                        {/* iPhone へ送るボタン（実アプリでは右クリック→送る） */}
                                        {!note.sentToIphone ? (
                                            <button
                                                type="button"
                                                onClick={() => sendDemoNoteToIphone(note.id)}
                                                title={isEn ? "Send to iPhone (right-click in the real app)" : "iPhoneへ送る（実アプリでは右クリック）"}
                                                className="absolute -top-2 -right-2 px-2 py-1 rounded-full text-[10px] font-bold bg-[#5C7A3E] text-[#F5EDD8] shadow hover:scale-105 active:scale-95 transition-transform"
                                            >
                                                📱→
                                            </button>
                                        ) : (
                                            <div className="absolute -top-2 -right-2 px-2 py-1 rounded-full text-[10px] font-bold bg-[#7A6A50] text-[#F0E0A0] shadow">
                                                ✓
                                            </div>
                                        )}
                                    </div>
                                ))}

                                {demoNotes.filter(n => n.sentToIphone).slice(0, 3).map((note, idx) => (
                                    <div
                                        key={`iphone-${note.id}`}
                                        className="absolute right-5 rounded-xl border-4 border-[#1C1C1E] bg-[#F5F0E8] px-3 py-3 shadow-lg"
                                        style={{
                                            top: `${25 + idx * 20}%`,
                                            width: 120,
                                            minHeight: 72,
                                            animation: 'demoPopIn 0.35s ease-out forwards',
                                        }}
                                    >
                                        <p className="text-[9px] font-bold text-[#5C4430] mb-2">
                                            {isEn ? "FUSEN" : "俺の付箋"}
                                        </p>
                                        <div
                                            className="rounded-sm px-2 py-1.5 text-[10px] font-semibold text-[#2C1F0E]"
                                            style={{ backgroundColor: note.color }}
                                        >
                                            {note.text}
                                        </div>
                                    </div>
                                ))}

                                {/* 初期ガイド */}
                                <div className={`absolute inset-0 transition-opacity duration-700 ${demoNotes.length > 0 ? 'opacity-0 pointer-events-none' : 'opacity-100 flex items-center justify-center'}`}>
                                    <div className="text-center text-[#8A7055] px-4">
                                        <div className="text-4xl mb-3 animate-bounce">✨</div>
                                        <p className="font-bold">{isEn ? "Write on the left, hit Enter." : "左の入力欄に書いて Enter。"}</p>
                                        <p className="text-sm mt-2">{isEn ? "Then tap 📱→ on the note to send it to iPhone." : "貼った付箋の 📱→ ボタンで iPhone に送れます。"}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* popInアニメーション */}
                <style>{`
                    @keyframes demoPopIn {
                        0% { opacity: 0; transform: scale(0.5) translateY(30px); }
                        100% { opacity: 1; transform: scale(1) translateY(0); }
                    }
                `}</style>
            </section>

            {/* 波形の区切り */}
            <div className="overflow-hidden leading-none" style={{ height: 40, backgroundColor: '#EDE4D3' }}>
                <svg viewBox="0 0 1200 40" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: '100%' }}>
                    <path d="M0,20 C300,40 900,0 1200,20 L1200,40 L0,40 Z" fill="#E2D7C3" />
                </svg>
            </div>

            {/* ==============================
                機能セクション
            ============================== */}
            <section id="features" className="py-20 sm:py-24 px-6" style={{ backgroundColor: '#EDE4D3' }}>
                <div className="max-w-5xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-4xl sm:text-5xl font-extrabold text-[#3A2C18] mb-8 leading-tight tracking-tight">
                            {isEn ? (
                                <>
                                    Keep important things<br />
                                    <span className="text-[#5C7A3E]">within sight.</span>
                                </>
                            ) : (
                                <>
                                    大事なことは、<br />
                                    <span className="text-[#5C7A3E]">貼っておけばいい。</span>
                                </>
                            )}
                        </h2>

                        {/* ポエム */}
                        <div className="inline-block text-left pl-6 py-2 border-l-4 border-[#8BAF7C]/70 mb-4">
                            <p className="text-lg sm:text-xl text-[#6A5540] mb-3 leading-relaxed font-medium">
                                {isEn ? (
                                    <>
                                        Since ancient times, people have drawn important things on walls.<br />
                                        Bringing the habit from Lascaux to your desktop.
                                    </>
                                ) : (
                                    <>
                                        人は太古から、大事なことは、壁に描いてきた。<br />
                                        ラスコーから続く習慣を、デスクトップへ。
                                    </>
                                )}
                            </p>
                            <p className="text-sm sm:text-base text-[#8A7055] font-medium">
                                {isEn ? "── Instincts haven't changed. The form has." : "── 本能は変わらない。形が変わった。"}
                            </p>
                        </div>
                    </div>

                    {/* MVP 3本柱：すぐ書ける ／ 強調できる ／ そこに残る */}
                    <p className="text-center text-xs font-bold text-[#8A7055] uppercase tracking-[0.3em] mb-6">
                        {isEn ? "Three Promises" : "三つの約束"}
                    </p>

                    <div className="grid md:grid-cols-3 gap-7">
                        {(isEn ? [
                            {
                                color: '#EDD87A',
                                topColor: '#D9C060',
                                rotation: '-rotate-1',
                                emoji: '⚡',
                                title: 'Write instantly.',
                                text: 'Ctrl + N in 0.3 s. Capture the thought before it slips away. Auto-save means you never stop to save.',
                                textColor: '#3A2C00',
                                badge: null,
                            },
                            {
                                color: '#9DC0D0',
                                topColor: '#7AAFC0',
                                rotation: 'rotate-1',
                                emoji: '🔒',
                                title: 'Stay prominent.',
                                text: 'Pick a color. Resize. Pin to the front. "Lock-Da-Ze" mode keeps the important things lined up where your eyes go — never buried under windows.',
                                textColor: '#102030',
                                badge: 'Lock-Da-Ze',
                            },
                            {
                                color: '#A8C890',
                                topColor: '#8BAF75',
                                rotation: '-rotate-1',
                                emoji: '📌',
                                title: 'Always there.',
                                text: 'Close the app. Restart your PC. The notes stay. Tomorrow you walk past your monitor and they catch your eye — you don\'t have to remember anything.',
                                textColor: '#1E3A10',
                                badge: null,
                            },
                        ] : [
                            {
                                color: '#EDD87A',
                                topColor: '#D9C060',
                                rotation: '-rotate-1',
                                emoji: '⚡',
                                title: 'すぐ書ける。',
                                text: 'Ctrl + N で 0.3 秒。思考が逃げる前に、捕まえる。書いた瞬間に自動保存、手は止まらない。',
                                textColor: '#3A2C00',
                                badge: null,
                            },
                            {
                                color: '#9DC0D0',
                                topColor: '#7AAFC0',
                                rotation: 'rotate-1',
                                emoji: '🔒',
                                title: '強調できる。',
                                text: '色を変える。サイズを変える。最前面に貼る。「ロックだぜ」モードで、大事なことを視界の真ん中に置く。他のウィンドウに埋もれない。',
                                textColor: '#102030',
                                badge: 'ロックだぜ',
                            },
                            {
                                color: '#A8C890',
                                topColor: '#8BAF75',
                                rotation: '-rotate-1',
                                emoji: '📌',
                                title: 'そこに残る。',
                                text: 'アプリを閉じても、PC を再起動しても、付箋はそこにある。明日もモニターの前を通れば、目に入る。覚えていなくていい。',
                                textColor: '#1E3A10',
                                badge: null,
                            },
                        ]).map((item) => (
                            <div
                                key={item.title}
                                className={`${item.rotation} p-6 rounded-sm hover:rotate-0 transition-all duration-200 cursor-default`}
                                style={{
                                    backgroundColor: item.color,
                                    boxShadow: '3px 5px 14px rgba(0,0,0,0.13)',
                                    position: 'relative',
                                }}
                            >
                                <div
                                    className="h-2.5 -mx-6 -mt-6 rounded-t-sm mb-5"
                                    style={{ backgroundColor: item.topColor }}
                                />
                                {item.badge && (
                                    <div
                                        className="absolute -top-3 right-4 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-md"
                                        style={{ backgroundColor: '#2C1F0E', color: '#F0E0A0' }}
                                    >
                                        {item.badge}
                                    </div>
                                )}
                                <div className="text-2xl mb-3">{item.emoji}</div>
                                <h3
                                    className="text-lg font-bold mb-2"
                                    style={{ color: item.textColor }}
                                >
                                    {item.title}
                                </h3>
                                <p
                                    className="text-sm leading-relaxed"
                                    style={{ color: item.textColor, opacity: 0.8 }}
                                >
                                    {item.text}
                                </p>
                            </div>
                        ))}
                    </div>

                    {/* サブ機能グリッド */}
                    <div className="grid sm:grid-cols-3 gap-4 mt-8">
                        {(isEn ? [
                            { emoji: '🖼️', text: 'Paste images & draw on them', highlight: true },
                            { emoji: '🖊️', text: 'Markdown Support' },
                            { emoji: '🔍', text: 'Full-text Search (Regex)' },
                            { emoji: '📊', text: 'Flowcharts with Mermaid' },
                            { emoji: '🏷️', text: 'Tags & Archive Management' },
                            { emoji: '🔔', text: 'System tray + Auto-start' },
                        ] : [
                            { emoji: '🖼️', text: '画像を貼って、その上に書き込める', highlight: true },
                            { emoji: '🖊️', text: 'Markdown対応' },
                            { emoji: '🔍', text: '全文検索（正規表現）' },
                            { emoji: '📊', text: 'Mermaidでフローチャート' },
                            { emoji: '🏷️', text: 'タグ・アーカイブ管理' },
                            { emoji: '🔔', text: 'システムトレイ常駐＋自動起動' },
                        ]).map((item) => (
                            <div
                                key={item.text}
                                className={`flex items-center gap-3 px-4 py-3 rounded-sm border text-sm ${item.highlight ? 'font-bold' : ''}`}
                                style={{
                                    backgroundColor: item.highlight ? '#F4F9F1' : '#EDE4D3',
                                    borderColor: item.highlight ? '#5C7A3E' : '#C8B898',
                                    color: item.highlight ? '#3A5020' : '#6A5540',
                                }}
                            >
                                <span>{item.emoji}</span>
                                <span>{item.text}</span>
                                {item.highlight && (
                                    <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full text-[#F5EDD8]" style={{ backgroundColor: '#5C7A3E' }}>
                                        {isEn ? 'NEW' : '注目'}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* 波形の区切り */}
            <div className="overflow-hidden leading-none" style={{ height: 40, backgroundColor: '#EDE4D3' }}>
                <svg
                    viewBox="0 0 1200 40"
                    preserveAspectRatio="none"
                    style={{ display: 'block', width: '100%', height: '100%' }}
                >
                    <path d="M0,20 C300,40 900,0 1200,20 L1200,40 L0,40 Z" fill="#E2D7C3" />
                </svg>
            </div>

            {/* ==============================
                スクリーンショット
            ============================== */}
            <section className="py-20 px-6" style={{ backgroundColor: '#E2D7C3' }}>
                <div className="max-w-5xl mx-auto">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl sm:text-4xl font-bold text-[#2C1F0E] mb-3">
                            {isEn ? "Here's how it looks" : "こんな感じです"}
                        </h2>
                        <p className="text-[#8A7055]">{isEn ? "Blends perfectly with your desktop" : "デスクトップに、ちゃんと馴染みます"}</p>
                    </div>

                    <div className="relative">
                        {/* テープ装飾 */}
                        <div
                            className="absolute -top-3 left-14 z-10 w-14 h-5 rounded-sm opacity-60 rotate-2"
                            style={{ backgroundColor: '#F0E0A0', border: '1px solid #D8C880' }}
                        />
                        <div
                            className="absolute -top-3 right-20 z-10 w-12 h-5 rounded-sm opacity-60 -rotate-1"
                            style={{ backgroundColor: '#F0E0A0', border: '1px solid #D8C880' }}
                        />
                        <div
                            className="rounded-sm overflow-hidden"
                            style={{
                                boxShadow: '4px 6px 24px rgba(0,0,0,0.15)',
                                border: '1px solid #C8B898',
                            }}
                        >
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
                <svg
                    viewBox="0 0 1200 40"
                    preserveAspectRatio="none"
                    style={{ display: 'block', width: '100%', height: '100%' }}
                >
                    <path d="M0,20 C300,0 900,40 1200,20 L1200,0 L0,0 Z" fill="#EDE4D3" />
                </svg>
            </div>

            {/* ==============================
                プロモ動画
            ============================== */}
            <section className="py-16 px-6" style={{ backgroundColor: '#EDE4D3' }}>
                <div className="max-w-4xl mx-auto text-center">
                    <h2 className="text-2xl font-bold text-[#2C1F0E] mb-8">
                        {isEn ? (
                            <>
                                Meet ORENOF, the Sticky Note Spirit.<br />
                                &quot;Don&apos;t worry, I&apos;m sticking around.&quot;
                            </>
                        ) : (
                            <>
                                はじめまして、付箋の精霊、オレノフです。<br />
                                「安心してください。付いてますよ。」
                            </>
                        )}
                    </h2>
                    <div className="relative inline-block">
                        {/* テープ装飾 */}
                        <div
                            className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 w-16 h-5 rounded-sm opacity-70 -rotate-1"
                            style={{ backgroundColor: '#F0E0A0', border: '1px solid #D8C880' }}
                        />
                        <div
                            className="rounded-sm overflow-hidden"
                            style={{
                                boxShadow: '4px 6px 24px rgba(0,0,0,0.18)',
                                border: '1px solid #C8B898',
                                aspectRatio: '1/1',
                                maxWidth: '280px',
                                background: '#000',
                            }}
                        >
                            <video
                                controls
                                loop
                                playsInline
                                preload="none"
                                poster="/promo/orenof-chan.png"
                                className="w-full h-full block"
                                style={{ objectFit: 'cover' }}
                            >
                                <source src="/promo/promo2.mp4" type="video/mp4" />
                            </video>
                        </div>
                    </div>
                </div>
            </section>

            {/* 波形の区切り */}
            <div className="overflow-hidden leading-none" style={{ height: 40, backgroundColor: '#EDE4D3' }}>
                <svg
                    viewBox="0 0 1200 40"
                    preserveAspectRatio="none"
                    style={{ display: 'block', width: '100%', height: '100%' }}
                >
                    <path d="M0,20 C300,40 900,0 1200,20 L1200,40 L0,40 Z" fill="#E2D7C3" />
                </svg>
            </div>

            {/* ==============================
                ダウンロードCTA
            ============================== */}
            <section className="py-24 px-6" style={{ backgroundColor: '#E2D7C3' }}>
                <div className="max-w-lg mx-auto text-center">
                    {/* 大きな付箋カード */}
                    <div
                        className="relative -rotate-1 rounded-sm px-10 py-12 mb-10"
                        style={{
                            backgroundColor: '#EDD87A',
                            boxShadow: '4px 6px 24px rgba(0,0,0,0.16)',
                        }}
                    >
                        <div
                            className="h-3.5 -mx-10 -mt-12 rounded-t-sm mb-10"
                            style={{ backgroundColor: '#D9C060' }}
                        />
                        {/* テープ */}
                        <div
                            className="absolute -top-3 left-1/2 -translate-x-1/2 w-16 h-5 rounded-sm opacity-70 rotate-1"
                            style={{ backgroundColor: '#F0E0A0', border: '1px solid #D8C880' }}
                        />

                        <h2 className="text-2xl font-bold text-[#2C1F0E] mb-2">
                            {isEn ? "Give it a try first" : "まず入れてみてください"}
                        </h2>
                        <p className="text-sm text-[#7A6200] mb-7">
                            {isEn ? "Free · 1-min install · Your data stays with you" : "無料・インストール1分・データはあなたの手元に"}
                        </p>
                        <Link
                            href={downloadUrl}
                            target="_blank"
                            onClick={() => trackEvent('download_click_cta')}
                            className="inline-flex items-center gap-2 px-7 py-3 rounded-sm font-semibold text-[#F5EDD8] transition-all duration-200 hover:-translate-y-0.5"
                            style={{
                                backgroundColor: '#5C7A3E',
                                boxShadow: '2px 3px 10px rgba(92,122,62,0.35)',
                            }}
                        >
                            <Download className="w-4 h-4" />
                            {isEn ? "Download for Windows" : "ダウンロード（Windows）"}
                        </Link>
                    </div>

                    <p className="text-sm text-[#9A8468] mb-6">{isEn ? "Windows 10/11 (64-bit) · ~100MB" : "Windows 10/11 (64-bit) · 約100MB"}</p>

                    <div className="flex flex-col sm:flex-row gap-4 justify-center text-sm">
                        <Link
                            href="https://github.com/ore-no-fusen/ore-no-fusen"
                            target="_blank"
                            className="text-[#5C7A3E] hover:text-[#3A5020] transition-colors"
                        >
                            📖 {isEn ? "View on GitHub" : "GitHubを見る"}
                        </Link>
                        <Link
                            href="https://x.com/uchikiman"
                            target="_blank"
                            className="text-[#5C7A3E] hover:text-[#3A5020] transition-colors"
                        >
                            💬 {isEn ? "Send Feedback" : "フィードバックを送る"}
                        </Link>
                    </div>
                </div>
            </section>

            {/* フッター */}
            <footer
                className="py-8 px-6 border-t"
                style={{ backgroundColor: '#D8CEBA', borderColor: '#C0B098' }}
            >
                <div className="max-w-5xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-[#8A7458]">
                    <div>© 2026 ore-no-fusen by ONF Studios. MIT License.</div>
                    <div className="flex gap-6">
                        <Link
                            href="https://github.com/ore-no-fusen/ore-no-fusen"
                            target="_blank"
                            className="hover:text-[#5A4830] transition-colors"
                        >
                            GitHub
                        </Link>
                        <Link
                            href="https://github.com/ore-no-fusen/ore-no-fusen/blob/main/README.md"
                            target="_blank"
                            className="hover:text-[#5A4830] transition-colors"
                        >
                            {isEn ? "Documentation" : "ドキュメント"}
                        </Link>
                    </div>
                </div>
            </footer>
        </div>
    );
}
