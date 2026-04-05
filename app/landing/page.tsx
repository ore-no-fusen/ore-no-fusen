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
import { Download, Globe } from 'lucide-react';
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

    // PC→iPhone 連携アニメーション
    const noteTexts = ['買い物リスト', 'MTGのアジェンダ', 'アイデアメモ', '今日やること'];
    const [noteIdx, setNoteIdx] = useState(0);
    const [iphoneNotes, setIphoneNotes] = useState<string[]>([]);
    const [isFlying, setIsFlying] = useState(false);

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

    // インタラクティブデモ用ステート
    const inputRef = useRef<HTMLInputElement>(null);
    const [demoNotes, setDemoNotes] = useState<{ id: number; text: string; color: string; rotation: number; topPos: number; leftPos: number }[]>([]);
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
        };
        setDemoNotes((prev) => [newNote, ...prev].slice(0, 5));
        setInputValue('');
        if (inputRef.current) inputRef.current.focus();
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
                            <h1 className="text-4xl sm:text-5xl lg:text-[4.2rem] font-extrabold leading-tight tracking-tight mb-5 text-[#2C1F0E] drop-shadow-sm">
                                {isEn ? (
                                    <>
                                        The solution for everyone <br />
                                        using <span className="text-[#5C7A3E]">iPhone & Windows.</span>
                                    </>
                                ) : (
                                    <>
                                        Macじゃなくていい。<br />
                                        <span className="text-[#5C7A3E]">繋がればいい。</span>
                                    </>
                                )}
                            </h1>

                            {/* サブコピー */}
                            <p className="text-lg sm:text-xl text-[#6A5540] mb-8 font-medium leading-relaxed">
                                {isEn ? (
                                    <>
                                        Write on PC, reaches your iPhone.<br className="sm:hidden" />
                                        Write on iPhone, stays on your PC.
                                    </>
                                ) : (
                                    <>
                                        PCで書いて、iPhoneへ届く。<br className="sm:hidden" />
                                        iPhoneで書いて、PCに残る。
                                    </>
                                )}
                            </p>

                            {/* ターゲット共感チェックリスト */}
                            <div className="bg-white/70 p-5 rounded-2xl border border-[#C8B89A]/70 backdrop-blur-md mb-8 text-left shadow-md">
                                <p className="text-xs font-bold text-[#8A7055] mb-3 uppercase tracking-widest">
                                    こんな人に刺さります
                                </p>
                                {[
                                    'iPhoneは好き。でもPCはWindows派。',
                                    'Appleメモ使いたいけど、Windowsだから...',
                                    'Notionは大げさ。OneNoteは重い。',
                                    'なんかちょうどいいやつ、ないかな。',
                                ].map((text) => (
                                    <div
                                        key={text}
                                        className="flex items-center gap-2.5 py-1.5 text-sm text-[#5A4030]"
                                    >
                                        <span className="text-[#5C7A3E] font-bold text-base flex-shrink-0">
                                            ✓
                                        </span>
                                        <span>{text}</span>
                                    </div>
                                ))}
                                <p className="text-sm font-bold text-[#5C7A3E] mt-3 pt-3 border-t border-[#C8B89A]/50">
                                    ── それ、全部あなたのことです。
                                </p>
                            </div>

                            {/* CTA */}
                            <div className="flex flex-col items-center lg:items-start gap-2 mt-8">
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
                                    {isEn ? "Windows 10/11 · Free · 100% Local Storage" : "Windows 10/11 · 無料 · データはローカル保存"}
                                </p>
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
                                                俺の付箋
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
                                                    会議メモ
                                                    <br />
                                                    14:00〜
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
                                                    読書メモ
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

                                {/* 矢印（双方向） */}
                                <div className="flex flex-col items-center gap-1 flex-shrink-0">
                                    <div
                                        className="text-2xl font-bold text-[#8BAF7C]"
                                        style={{ animation: 'pulse 2s infinite' }}
                                    >
                                        ⇄
                                    </div>
                                    <div className="text-[9px] text-[#A89878] text-center leading-tight font-medium">
                                        自動
                                        <br />
                                        同期
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
                                                    俺の付箋
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
                                                        PCから
                                                        <br />
                                                        届きます
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
                「こんな使い方」シナリオセクション
            ============================== */}
            <section className="py-20 px-6" style={{ backgroundColor: '#E2D7C3' }}>
                <div className="max-w-5xl mx-auto">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl sm:text-4xl font-bold text-[#2C1F0E] mb-3">
                            こんな使い方
                        </h2>
                        <p className="text-[#8A7055]">
                            Win + iPhone の組み合わせで、こんなことができます
                        </p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-6">
                        {[
                            {
                                emoji: '🖥️',
                                scene: 'PC作業中',
                                title: '仕事中にふと思ったら',
                                desc: 'デスクトップの付箋に書く。気づいたらiPhoneに届いてる。',
                                color: '#EDD87A',
                                topColor: '#D9C060',
                                textColor: '#3A2C00',
                                rotation: '-rotate-1',
                            },
                            {
                                emoji: '📱',
                                scene: '移動中',
                                title: '通勤中にiPhoneでメモ',
                                desc: 'iPhoneでサッと書いたメモが、帰宅後にPCのデスクトップに貼ってある。',
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
                        ].map((item) => (
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
                            まず1行、書いてみてください
                        </h2>
                        <p className="text-[#8A7055]">ダウンロード不要。ここで体験できます。</p>
                    </div>

                    <div className="flex flex-col lg:flex-row items-start gap-8">
                        {/* 入力エリア */}
                        <div className="w-full lg:w-80 flex-shrink-0">
                            <div className="bg-white/80 p-5 sm:p-6 rounded-2xl shadow-lg border border-[#C8B89A]/80 backdrop-blur-md">
                                <label className="block text-sm font-bold text-[#4A6730] mb-3 flex items-center gap-2">
                                    <span className="text-lg">💡</span> 思ったことを書く
                                </label>
                                <div className="relative">
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        value={inputValue}
                                        onChange={(e) => setInputValue(e.target.value)}
                                        onKeyDown={handleDemoKeyDown}
                                        placeholder="ここに書いてみてください..."
                                        className="w-full text-base py-4 pl-4 pr-28 bg-[#FDFBF7] border-2 border-[#8BAF7C] rounded-xl focus:outline-none focus:border-[#5C7A3E] focus:ring-4 focus:ring-[#8BAF7C]/30 transition-all font-medium text-[#2C1F0E] placeholder:text-[#A89878] shadow-inner"
                                        autoComplete="off"
                                    />
                                    <button
                                        onClick={addDemoNote}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-[#5C7A3E] bg-[#F4F9F1] hover:bg-[#E8F0E4] px-3 py-2 rounded-lg border-2 border-[#8BAF7C]/60 shadow-sm transition-all cursor-pointer hover:scale-105 active:scale-95"
                                    >
                                        貼る ⏎
                                    </button>
                                </div>
                                <p className="text-xs text-[#A89878] mt-2 text-right">Enterでも貼れます</p>
                            </div>
                        </div>

                        {/* 付箋キャンバス */}
                        <div className="flex-1 w-full">
                            <div
                                className="relative w-full rounded-2xl border border-[#C8B89A]/60 shadow-inner overflow-hidden"
                                style={{ backgroundColor: '#D8CEBA', minHeight: '280px' }}
                            >
                                {/* 付箋 */}
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
                                    </div>
                                ))}

                                {/* 初期ガイド */}
                                <div className={`absolute inset-0 transition-opacity duration-700 ${demoNotes.length > 0 ? 'opacity-0 pointer-events-none' : 'opacity-100 flex items-center justify-center'}`}>
                                    <div className="text-center text-[#8A7055] px-4">
                                        <div className="text-4xl mb-3 animate-bounce">✨</div>
                                        <p className="font-bold">左の入力欄に書いてEnter！</p>
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
                            大事なことは、
                            <br />
                            <span className="text-[#5C7A3E]">貼っておけばいい。</span>
                        </h2>

                        {/* ポエム */}
                        <div className="inline-block text-left pl-6 py-2 border-l-4 border-[#8BAF7C]/70 mb-4">
                            <p className="text-lg sm:text-xl text-[#6A5540] mb-3 leading-relaxed font-medium">
                                人は太古から、大事なことは、壁に描いてきた。
                                <br />
                                ラスコーから続く習慣を、デスクトップへ。
                            </p>
                            <p className="text-sm sm:text-base text-[#8A7055] font-medium">
                                ── 本能は変わらない。形が変わった。
                            </p>
                        </div>
                    </div>

                    <div className="grid md:grid-cols-3 gap-7">
                        {[
                            {
                                color: '#EDD87A',
                                topColor: '#D9C060',
                                rotation: '-rotate-1',
                                emoji: '🔗',
                                title: 'Win ↔ iPhone で繋がる',
                                text: 'PCで書いたメモがiPhoneに届く。iPhoneで書いたメモがPCに残る。Appleメモが羨ましかった、あのやつです。',
                                textColor: '#3A2C00',
                            },
                            {
                                color: '#A8C890',
                                topColor: '#8BAF75',
                                rotation: 'rotate-1',
                                emoji: '⚡',
                                title: '速い。とにかく速い。',
                                text: '起動0.5秒。書いたら自動保存。思考を止めないために作りました。Excelの起動待ち、もうやめませんか。',
                                textColor: '#1E3A10',
                            },
                            {
                                color: '#9DC0D0',
                                topColor: '#7AAFC0',
                                rotation: '-rotate-1',
                                emoji: '🔒',
                                title: '軽い。安心。ローカル保存。',
                                text: 'データはPC上に保存。クラウド不要。オフライン動作。プライバシーはあなたのもの。',
                                textColor: '#102030',
                            },
                        ].map((item) => (
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
                        {[
                            { emoji: '🖊️', text: 'Markdown対応' },
                            { emoji: '🔍', text: '全文検索（正規表現）' },
                            { emoji: '📊', text: 'Mermaidでフローチャート' },
                            { emoji: '🖼️', text: 'クリップボードから画像貼り付け' },
                            { emoji: '📌', text: '最前面固定（ピン留め）' },
                            { emoji: '🏷️', text: 'タグ・アーカイブ管理' },
                        ].map((item) => (
                            <div
                                key={item.text}
                                className="flex items-center gap-3 px-4 py-3 rounded-sm border text-sm text-[#6A5540]"
                                style={{ backgroundColor: '#EDE4D3', borderColor: '#C8B898' }}
                            >
                                <span>{item.emoji}</span>
                                <span>{item.text}</span>
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
                            こんな感じです
                        </h2>
                        <p className="text-[#8A7055]">デスクトップに、ちゃんと馴染みます</p>
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
                        はじめまして、付箋の精霊、オレノフです。
                        <br />
                        「安心してください。付いてますよ。」
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
                            まず入れてみてください
                        </h2>
                        <p className="text-sm text-[#7A6200] mb-7">
                            無料・インストール1分・データはローカル保存
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
                            ダウンロード（Windows）
                        </Link>
                    </div>

                    <p className="text-sm text-[#9A8468] mb-6">Windows 10/11 (64-bit) · 約100MB</p>

                    <div className="flex flex-col sm:flex-row gap-4 justify-center text-sm">
                        <Link
                            href="https://github.com/ore-no-fusen/ore-no-fusen"
                            target="_blank"
                            className="text-[#5C7A3E] hover:text-[#3A5020] transition-colors"
                        >
                            📖 GitHubを見る
                        </Link>
                        <Link
                            href="https://x.com/uchikiman"
                            target="_blank"
                            className="text-[#5C7A3E] hover:text-[#3A5020] transition-colors"
                        >
                            💬 フィードバックを送る
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
                            ドキュメント
                        </Link>
                    </div>
                </div>
            </footer>
        </div>
    );
}
