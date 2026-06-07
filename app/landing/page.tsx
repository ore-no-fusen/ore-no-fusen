/**
 * ランディングページ (LandingPage) - 「思考を現実へ」ブランド再設計版
 *
 * 構成（依頼書順 + ラスコー保持）:
 *  0. Hero            「消えそうな思考を、逃がさない。」+ 0.3秒の証拠 + CTA
 *  1. 共感             あとでやろうで消える
 *  2. ラスコー         思想の根拠（残す）
 *  3. 解決フロー       思考 → 固定 → 視界 → 決心 → 行動 → 現実
 *  4. 速さの証拠       0.04 秒の実測動画
 *  5. 機能             思想の言い換えとして
 *  6. PC↔iPhone        思考をどこでも逃がさない
 *  7. 棲み分け         Sticky Notes / Excel の、あいだ
 *  8. 使い方シナリオ
 *  9. 体験デモ
 * 10. オレノフ動画
 * 11. プライバシー
 * 12. 最後のCTA
 */

'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Check, Copy, Download, Globe, Volume2, VolumeX } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

export default function LandingPage() {
    const version = process.env.NEXT_PUBLIC_APP_VERSION ?? '';
    const latestReleaseUrl = 'https://github.com/ore-no-fusen/ore-no-fusen/releases/latest';
    const downloadUrl = version
        ? `https://github.com/ore-no-fusen/ore-no-fusen/releases/download/v${version}/ore-no-fusen_${version}_x64-setup.exe`
        : latestReleaseUrl;

    const [lang, setLang] = useState<'ja' | 'en'>('ja');

    useEffect(() => {
        const browserLang = navigator.language;
        if (!browserLang.toLowerCase().startsWith('ja')) {
            setLang('en');
        }
    }, []);

    const isEn = lang === 'en';

    useEffect(() => {
        document.title = isEn ? 'FUSEN — My Sticky Notes for Windows' : '俺の付箋（Ore-no-Fusen）';
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
        if (!next) v.currentTime = 0.5;
        v.play().catch(() => { });
        setSpeedProofMuted(next);
        trackEvent('speed_proof_unmute');
    };

    // インタラクティブデモ
    const inputRef = useRef<HTMLInputElement>(null);
    const [demoNotes, setDemoNotes] = useState<{ id: number; text: string; color: string; rotation: number; topPos: number; leftPos: number; sentToIphone: boolean }[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [wingetCopied, setWingetCopied] = useState(false);
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

    const copyWingetCommand = () => {
        navigator.clipboard.writeText('winget install ore-no-fusen').catch(() => { });
        setWingetCopied(true);
        setTimeout(() => setWingetCopied(false), 2500);
        trackEvent('winget_install_copy');
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
                    {isEn ? 'FUSEN — My Sticky Notes' : '俺の付箋 (Ore-no-Fusen)'}
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
                0. Hero
                「消えそうな思考を、逃がさない。」
            ============================== */}
            <section className="relative overflow-hidden py-24 sm:py-32 px-6 min-h-[88vh] flex items-center">
                <div
                    className="absolute inset-0 opacity-[0.04]"
                    style={{
                        backgroundImage: 'radial-gradient(circle, #5C7A3E 1px, transparent 1px)',
                        backgroundSize: '28px 28px',
                    }}
                />

                <div className="relative max-w-4xl mx-auto w-full text-center">
                    {/* 一行のサブブランド */}
                    <p className="text-xs sm:text-sm font-bold text-[#8A7055] uppercase tracking-[0.35em] mb-8">
                        {isEn ? 'FUSEN · My Sticky Notes for Windows' : '俺の付箋 ・ Thinking Canvas'}
                    </p>

                    {/* メインコピー */}
                    <h1 className="text-[2.4rem] sm:text-5xl lg:text-[3.8rem] font-extrabold leading-[1.15] tracking-tight mb-8 text-[#2C1F0E]">
                        {isEn ? (
                            <>
                                Don&apos;t let your thoughts<br />
                                <span className="text-[#5C7A3E]">slip away.</span>
                            </>
                        ) : (
                            <>
                                消えそうな思考を、<br />
                                <span className="text-[#5C7A3E]">逃がさない。</span>
                            </>
                        )}
                    </h1>

                    {/* 0.3秒の証拠（1行） */}
                    <p className="text-base sm:text-lg text-[#6A5540] leading-relaxed mb-10 max-w-xl mx-auto">
                        {isEn ? (
                            <>
                                Opens in 0.3 seconds.<br />
                                Always visible. Your resolve stays put.
                            </>
                        ) : (
                            <>
                                0.3秒で開く。常に見える。<br />
                                決心が、消えない。
                            </>
                        )}
                    </p>

                    {/* CTA */}
                    <div className="flex flex-col items-center gap-3">
                        <Link
                            href={downloadUrl}
                            target="_blank"
                            onClick={() => trackEvent('download_click')}
                            className="inline-flex items-center justify-center gap-3 px-10 py-4 bg-[#5C7A3E] hover:bg-[#4A6730] text-[#F5EDD8] rounded-xl font-bold text-lg shadow-[0_6px_20px_rgba(92,122,62,0.35)] hover:shadow-[0_8px_28px_rgba(92,122,62,0.5)] transition-all duration-300 hover:-translate-y-0.5"
                        >
                            <Download className="w-5 h-5" />
                            {isEn ? 'Download for Windows' : 'Windowsに入れる（無料）'}
                        </Link>
                        <p className="text-xs text-[#9A8468]">
                            {isEn
                                ? 'Windows 10/11 · Free · Your data stays with you'
                                : 'Windows 10/11 ・ 無料 ・ データはあなたの手元'}
                        </p>

                        {/* winget */}
                        <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-[#7A6A50] mt-2">
                            <span>{isEn ? 'or via Command Prompt:' : 'コマンドプロンプトでも入れられます:'}</span>
                            <code className="px-2 py-1 rounded bg-[#2C1F0E]/85 text-[#F0E0A0] font-mono select-all">
                                winget install ore-no-fusen
                            </code>
                            <button
                                type="button"
                                onClick={copyWingetCommand}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-[#C8B89A] bg-[#FFF8E8] hover:bg-[#F5EDD8] text-[#5C4A32] transition-colors"
                                aria-label={isEn ? 'Copy winget command' : 'wingetコマンドをコピー'}
                            >
                                {wingetCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                {wingetCopied ? (isEn ? 'Copied' : 'コピー済み') : (isEn ? 'Copy' : 'コピー')}
                            </button>
                        </div>
                        <p className="text-xs text-[#9A8468]">
                            {isEn
                                ? 'If you know winget, this is recommended because Windows warnings are less likely. Press Win+R, type cmd, press Enter, then paste this command.'
                                : 'winget が分かる方はこちらがおすすめです。Windowsの警告が出にくいです。Win+R → cmd → Enter でコマンドプロンプトを開き、このコマンドを貼り付けて実行します。'}
                        </p>

                        <details className="text-xs text-[#7A6A50] mt-1 max-w-md">
                            <summary className="cursor-pointer hover:text-[#5C7A3E] select-none">
                                {isEn ? 'ℹ️ Windows SmartScreen warning? — click here' : 'ℹ️ SmartScreen の警告が出たら？'}
                            </summary>
                            <div className="mt-2 pl-4 leading-relaxed text-left">
                                {isEn ? (
                                    <>
                                        The installer is not Authenticode-signed (yet), so SmartScreen may warn on first launch.
                                        Click <strong>「More info」</strong> → <strong>「Run anyway」</strong> to proceed.
                                        You can also{' '}
                                        <Link href={latestReleaseUrl} target="_blank" className="text-[#5C7A3E] underline">
                                            verify the SHA-256 hash
                                        </Link>{' '}
                                        on the release page.
                                    </>
                                ) : (
                                    <>
                                        インストーラに Authenticode 署名を付けていないため、初回起動で SmartScreen が警告を出します。
                                        <strong>「詳細情報」</strong> → <strong>「実行」</strong> で進めます。
                                        心配な方は{' '}
                                        <Link href={latestReleaseUrl} target="_blank" className="text-[#5C7A3E] underline">
                                            リリースページの SHA-256 ハッシュ
                                        </Link>{' '}
                                        でファイルを検証できます。
                                    </>
                                )}
                            </div>
                        </details>
                    </div>

                    {/* スクロールヒント */}
                    <div className="mt-16 text-[#A89878] text-xs tracking-widest">
                        {isEn ? '▼ WHY THIS MATTERS' : '▼ なぜ、これが必要なのか'}
                    </div>
                </div>

                {/* 「常に見える」を体現する装飾付箋（背景の縁から覗かせる） */}
                <div className="pointer-events-none absolute inset-0 hidden md:block" aria-hidden="true">
                    {/* 左下 - 黄 */}
                    <div
                        className="absolute"
                        style={{
                            bottom: '6%',
                            left: '-1.5%',
                            width: 168,
                            padding: '14px 16px 18px',
                            backgroundColor: '#EDD87A',
                            transform: 'rotate(-7deg)',
                            boxShadow: '4px 8px 22px rgba(0,0,0,0.12)',
                            opacity: 0.85,
                        }}
                    >
                        <div className="h-2 -mx-4 -mt-3 mb-3 rounded-t-sm" style={{ backgroundColor: '#D9C060' }} />
                        <p className="text-[13px] font-semibold text-[#3A2C00] leading-snug">
                            {isEn ? 'Decided things' : '決めたこと'}
                        </p>
                    </div>

                    {/* 右上 - 青 */}
                    <div
                        className="absolute"
                        style={{
                            top: '12%',
                            right: '-1.5%',
                            width: 152,
                            padding: '14px 16px 18px',
                            backgroundColor: '#9DC0D0',
                            transform: 'rotate(6deg)',
                            boxShadow: '4px 8px 22px rgba(0,0,0,0.12)',
                            opacity: 0.8,
                        }}
                    >
                        <div className="h-2 -mx-4 -mt-3 mb-3 rounded-t-sm" style={{ backgroundColor: '#7AAFC0' }} />
                        <p className="text-[13px] font-semibold text-[#102030] leading-snug">
                            {isEn ? 'An idea' : 'アイデア'}
                        </p>
                    </div>

                    {/* 右下 - 緑 */}
                    <div
                        className="absolute"
                        style={{
                            bottom: '14%',
                            right: '2%',
                            width: 140,
                            padding: '12px 14px 16px',
                            backgroundColor: '#A8C890',
                            transform: 'rotate(4deg)',
                            boxShadow: '4px 8px 22px rgba(0,0,0,0.12)',
                            opacity: 0.8,
                        }}
                    >
                        <div className="h-2 -mx-3.5 -mt-3 mb-3 rounded-t-sm" style={{ backgroundColor: '#8BAF75' }} />
                        <p className="text-[12px] font-semibold text-[#1E3A10] leading-snug">
                            {isEn ? 'Today\'s resolve' : '今日の決心'}
                        </p>
                    </div>
                </div>
            </section>

            {/* 波形 */}
            <div className="overflow-hidden leading-none" style={{ height: 40, backgroundColor: '#EDE4D3' }}>
                <svg viewBox="0 0 1200 40" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: '100%' }}>
                    <path d="M0,20 C300,40 900,0 1200,20 L1200,40 L0,40 Z" fill="#E2D7C3" />
                </svg>
            </div>

            {/* ==============================
                1. 共感（消える怖さ）
            ============================== */}
            <section className="py-28 sm:py-32 px-6" style={{ backgroundColor: '#E2D7C3' }}>
                <div className="max-w-2xl mx-auto text-center">
                    <p className="text-xs font-bold text-[#8A7055] uppercase tracking-[0.35em] mb-10">
                        {isEn ? 'The Quiet Loss' : '消えていくもの'}
                    </p>
                    <h2 className="text-3xl sm:text-4xl font-bold text-[#2C1F0E] leading-[1.5] mb-10 tracking-tight">
                        {isEn ? (
                            <>
                                People lose their best thoughts<br />
                                to <span className="text-[#A53C2C]">&ldquo;I&apos;ll do it later.&rdquo;</span>
                            </>
                        ) : (
                            <>
                                人は、<br />
                                <span className="text-[#A53C2C]">「あとでやろう」</span>で、<br />
                                大事な思考を失う。
                            </>
                        )}
                    </h2>
                    <div className="text-lg sm:text-xl text-[#6A5540] leading-[2.2] font-medium">
                        {isEn ? (
                            <>
                                <p>Ideas.</p>
                                <p>Resolutions.</p>
                                <p>The things you wanted to do.</p>
                                <p className="mt-8 text-[#8A7055]">
                                    In your head alone,<br />
                                    they vanish.
                                </p>
                            </>
                        ) : (
                            <>
                                <p>アイデア。</p>
                                <p>決心。</p>
                                <p>やりたいこと。</p>
                                <p className="mt-8 text-[#8A7055]">
                                    頭の中だけでは、<br />
                                    消えてしまう。
                                </p>
                            </>
                        )}
                    </div>

                    {/* ことわざブロック（共感の締め） */}
                    <div className="mt-20 mx-auto max-w-md">
                        <div
                            className="relative -rotate-1 px-8 py-10 rounded-sm"
                            style={{
                                backgroundColor: '#EDD87A',
                                boxShadow: '4px 8px 22px rgba(0,0,0,0.14)',
                            }}
                        >
                            <div
                                className="absolute -top-3 left-1/2 -translate-x-1/2 w-14 h-5 rounded-sm opacity-70 rotate-2"
                                style={{ backgroundColor: '#F0E0A0', border: '1px solid #D8C880' }}
                            />
                            <div className="h-2.5 -mx-8 -mt-10 mb-7 rounded-t-sm" style={{ backgroundColor: '#D9C060' }} />

                            <p className="text-2xl sm:text-[1.7rem] font-bold text-[#3A2C00] leading-snug text-center mb-6">
                                {isEn ? (
                                    <>&ldquo;Do it later&rdquo;<br />is for fools.</>
                                ) : (
                                    <>「あとでやろう」は、<br />ばかやろう。</>
                                )}
                            </p>
                            <p className="text-sm text-[#7A6200] text-center leading-relaxed">
                                {isEn ? (
                                    <>── <span className="italic">&ldquo;Opportunity has a forelock<br />but is bald behind.&rdquo;</span><br />（old proverb）</>
                                ) : (
                                    <>── 「思い立ったが吉日」<br />（日本のことわざ）より</>
                                )}
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* 波形 */}
            <div className="overflow-hidden leading-none" style={{ height: 40, backgroundColor: '#E2D7C3' }}>
                <svg viewBox="0 0 1200 40" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: '100%' }}>
                    <path d="M0,20 C300,0 900,40 1200,20 L1200,0 L0,0 Z" fill="#EDE4D3" />
                </svg>
            </div>

            {/* ==============================
                2. ラスコー（思想の根拠）
            ============================== */}
            <section className="py-28 sm:py-32 px-6" style={{ backgroundColor: '#EDE4D3' }}>
                <div className="max-w-3xl mx-auto text-center">
                    <p className="text-xs font-bold text-[#8A7055] uppercase tracking-[0.35em] mb-10">
                        {isEn ? '17,000 Years Ago · Lascaux' : '1万7千年前 ・ ラスコー'}
                    </p>

                    {/* 引用ブロック */}
                    <div className="inline-block text-left border-l-4 border-[#8BAF7C]/70 pl-7 py-2 mb-10">
                        <p className="text-xl sm:text-2xl text-[#3A2C18] leading-[2] font-medium">
                            {isEn ? (
                                <>
                                    Since ancient times, people have<br />
                                    drawn important things on walls.<br />
                                    <span className="text-[#5C7A3E]">
                                        Bringing the habit from Lascaux<br />
                                        to your desktop.
                                    </span>
                                </>
                            ) : (
                                <>
                                    人は太古から、<br />
                                    大事なことは、壁に描いてきた。<br />
                                    <span className="text-[#5C7A3E]">
                                        ラスコーから続く習慣を、<br />
                                        デスクトップへ。
                                    </span>
                                </>
                            )}
                        </p>
                    </div>

                    <p className="text-base sm:text-lg text-[#8A7055] font-medium mb-12">
                        {isEn ? '── Instincts haven\'t changed. The form has.' : '── 本能は変わらない。形が変わった。'}
                    </p>

                    {/* 思想ステートメント */}
                    <div className="max-w-xl mx-auto text-[#6A5540] leading-[2] text-base sm:text-lg">
                        {isEn ? (
                            <>
                                Cave paintings. Whiteboards. Sticky notes.<br />
                                <span className="font-bold text-[#3A2C18]">All of them do the same thing.</span><br />
                                <br />
                                Put a thought where you can see it,<br />
                                and it stops slipping away.
                            </>
                        ) : (
                            <>
                                洞窟の壁画も、ホワイトボードも、付箋も、<br />
                                <span className="font-bold text-[#3A2C18]">やっていることは同じ。</span><br />
                                <br />
                                思考を、視界に置く。<br />
                                それだけで、逃げなくなる。
                            </>
                        )}
                    </div>
                </div>
            </section>

            {/* 波形 */}
            <div className="overflow-hidden leading-none" style={{ height: 40, backgroundColor: '#EDE4D3' }}>
                <svg viewBox="0 0 1200 40" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: '100%' }}>
                    <path d="M0,20 C300,40 900,0 1200,20 L1200,40 L0,40 Z" fill="#E2D7C3" />
                </svg>
            </div>

            {/* ==============================
                3. 解決のフロー
                思考 → 固定 → 視界 → 決心 → 行動 → 現実
            ============================== */}
            <section className="py-28 px-6" style={{ backgroundColor: '#E2D7C3' }}>
                <div className="max-w-4xl mx-auto">
                    <div className="text-center mb-16">
                        <p className="text-xs font-bold text-[#8A7055] uppercase tracking-[0.35em] mb-6">
                            {isEn ? 'From Thought to Reality' : '思考から現実へ'}
                        </p>
                        <h2 className="text-3xl sm:text-4xl font-bold text-[#2C1F0E] leading-tight tracking-tight">
                            {isEn ? (
                                <>
                                    FUSEN pins your thoughts<br />
                                    <span className="text-[#5C7A3E]">into your field of view.</span>
                                </>
                            ) : (
                                <>
                                    俺の付箋は、思考を<br />
                                    <span className="text-[#5C7A3E]">視界に固定する。</span>
                                </>
                            )}
                        </h2>
                    </div>

                    {/* フロー図 */}
                    <div className="flex flex-col items-center gap-2">
                        {(isEn ? [
                            { word: 'Thought', sub: 'something comes to mind', accent: false },
                            { word: 'Pin it', sub: 'Ctrl + N · 0.3 s', accent: true },
                            { word: 'Visible', sub: 'always on your desktop', accent: false },
                            { word: 'Resolve', sub: 'it becomes a decision', accent: false },
                            { word: 'Action', sub: 'you actually do it', accent: false },
                            { word: 'Reality', sub: 'it happens', accent: true },
                        ] : [
                            { word: '思考', sub: 'ふと頭をよぎる', accent: false },
                            { word: '固定', sub: 'Ctrl + N ・ 0.3 秒', accent: true },
                            { word: '視界に残る', sub: 'デスクトップに、常に', accent: false },
                            { word: '決心になる', sub: '消えないから、決まる', accent: false },
                            { word: '行動になる', sub: '目に入るから、動く', accent: false },
                            { word: '現実になる', sub: 'そして、起きる', accent: true },
                        ]).map((step, idx, arr) => (
                            <div key={step.word} className="flex flex-col items-center">
                                <div
                                    className="px-8 py-4 rounded-sm text-center min-w-[200px]"
                                    style={{
                                        backgroundColor: step.accent ? '#EDD87A' : '#FAF3E2',
                                        border: `1px solid ${step.accent ? '#5C7A3E' : '#C8B898'}`,
                                        boxShadow: step.accent
                                            ? '2px 4px 14px rgba(92,122,62,0.2)'
                                            : '1px 2px 8px rgba(0,0,0,0.06)',
                                    }}
                                >
                                    <div className={`text-xl font-bold ${step.accent ? 'text-[#3A2C00]' : 'text-[#2C1F0E]'}`}>
                                        {step.word}
                                    </div>
                                    <div className="text-xs text-[#8A7055] mt-1">{step.sub}</div>
                                </div>
                                {idx < arr.length - 1 && (
                                    <div className="text-2xl text-[#8BAF7C]/70 my-1">↓</div>
                                )}
                            </div>
                        ))}
                    </div>

                    <p className="text-center text-sm text-[#8A7055] mt-14 leading-relaxed max-w-lg mx-auto">
                        {isEn
                            ? 'We shaved every friction between Thought and Pin down to 0.3 seconds. That is the entire point.'
                            : '「思考」と「固定」の間にあるすべての摩擦を、0.3秒まで削ぎ落とした。それが、このソフトの存在理由です。'}
                    </p>
                </div>
            </section>

            {/* 波形 */}
            <div className="overflow-hidden leading-none" style={{ height: 40, backgroundColor: '#E2D7C3' }}>
                <svg viewBox="0 0 1200 40" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: '100%' }}>
                    <path d="M0,20 C300,0 900,40 1200,20 L1200,0 L0,0 Z" fill="#EDE4D3" />
                </svg>
            </div>

            {/* ==============================
                4. 速さの証拠（実測動画）
            ============================== */}
            <section className="py-24 px-6" style={{ backgroundColor: '#EDE4D3' }}>
                <div className="max-w-4xl mx-auto">
                    <div className="text-center mb-12">
                        <div
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold mb-5 text-[#5C7A3E]"
                            style={{ backgroundColor: '#D8EAC8', border: '1px solid #8BAF7C' }}
                        >
                            {isEn ? '🎬 Measured, not edited' : '🎬 実測・無編集（キー押下含む）'}
                        </div>
                        <h2 className="text-3xl sm:text-4xl font-bold text-[#2C1F0E] mb-4 tracking-tight">
                            {isEn ? 'Before the heat fades.' : '熱が、冷める前に。'}
                        </h2>
                        <p className="text-[#6A5540] text-base sm:text-lg leading-relaxed max-w-xl mx-auto">
                            {isEn ? (
                                <>
                                    Measured: <span className="font-bold text-[#5C7A3E]">0.04 s</span> from Ctrl + N to a writable note.<br />
                                    Designed worst case: 0.3 s.
                                </>
                            ) : (
                                <>
                                    Ctrl + N から書ける状態まで <span className="font-bold text-[#5C7A3E]">実測 0.04 秒</span>。<br />
                                    設計上限は 0.3 秒。
                                </>
                            )}
                        </p>
                    </div>

                    <div className="relative max-w-2xl mx-auto">
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
                            ? <>Measured at 50 fps. Keypress visualization by NohBoard (lower right).<br />Pool window: a transparent window pre-launched, made opaque on Ctrl + N.</>
                            : <>50 fps で計測。右下のキーボード表示は NohBoard。<br />Pool 機構：透明な窓を待機させて Ctrl + N で不透明化する仕組みです。</>}
                    </p>
                </div>
            </section>

            {/* 波形 */}
            <div className="overflow-hidden leading-none" style={{ height: 40, backgroundColor: '#EDE4D3' }}>
                <svg viewBox="0 0 1200 40" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: '100%' }}>
                    <path d="M0,20 C300,40 900,0 1200,20 L1200,40 L0,40 Z" fill="#E2D7C3" />
                </svg>
            </div>

            {/* ==============================
                5. 機能（思想の言い換えとして）
            ============================== */}
            <section id="features" className="py-24 sm:py-28 px-6" style={{ backgroundColor: '#E2D7C3' }}>
                <div className="max-w-5xl mx-auto">
                    <div className="text-center mb-16">
                        <p className="text-xs font-bold text-[#8A7055] uppercase tracking-[0.35em] mb-6">
                            {isEn ? 'Four Disciplines' : '四つの作法'}
                        </p>
                        <h2 className="text-3xl sm:text-4xl font-bold text-[#3A2C18] leading-tight tracking-tight">
                            {isEn ? (
                                <>
                                    Not features.<br />
                                    <span className="text-[#5C7A3E]">A way of holding thought.</span>
                                </>
                            ) : (
                                <>
                                    機能ではなく、<br />
                                    <span className="text-[#5C7A3E]">思考の扱い方。</span>
                                </>
                            )}
                        </h2>
                    </div>

                    {/* 思想ラベル機能カード 4枚 */}
                    <div className="grid md:grid-cols-2 gap-7 mb-12">
                        {(isEn ? [
                            {
                                color: '#EDD87A',
                                topColor: '#D9C060',
                                rotation: '-rotate-1',
                                tag: 'Always present',
                                title: 'Resolve, undeleted.',
                                text: 'A pinned note stays on your desktop through reboots. You don\'t have to remember. The desk remembers for you.',
                                textColor: '#3A2C00',
                            },
                            {
                                color: '#A8C890',
                                topColor: '#8BAF75',
                                rotation: 'rotate-1',
                                tag: 'Fast launch',
                                title: 'Captured before it cools.',
                                text: 'Ctrl + N opens a writable note in 0.3 s. The window was already there, transparent, waiting.',
                                textColor: '#1E3A10',
                            },
                            {
                                color: '#9DC0D0',
                                topColor: '#7AAFC0',
                                rotation: 'rotate-1',
                                tag: 'Emphasis',
                                title: 'Engraved in your sight.',
                                text: 'Change color. Pin to the front. "Lock-Da-Ze" mode lines the important ones up where your eyes go.',
                                textColor: '#102030',
                            },
                            {
                                color: '#D4A48A',
                                topColor: '#B88060',
                                rotation: '-rotate-1',
                                tag: 'iPhone',
                                title: 'Thoughts you carry.',
                                text: 'Send a chosen note to your iPhone. Catch one on the way home. They land back on your desktop.',
                                textColor: '#3A1810',
                            },
                        ] : [
                            {
                                color: '#EDD87A',
                                topColor: '#D9C060',
                                rotation: '-rotate-1',
                                tag: '常時表示',
                                title: '決心を、消さない。',
                                text: '貼った付箋は、PCを再起動しても、そこにある。覚えていなくていい。机が、覚えていてくれる。',
                                textColor: '#3A2C00',
                            },
                            {
                                color: '#A8C890',
                                topColor: '#8BAF75',
                                rotation: 'rotate-1',
                                tag: '高速起動',
                                title: '熱が冷める前に、固定する。',
                                text: 'Ctrl + N、0.3秒で書ける状態に。窓は、もう透明になって待っていた。',
                                textColor: '#1E3A10',
                            },
                            {
                                color: '#9DC0D0',
                                topColor: '#7AAFC0',
                                rotation: 'rotate-1',
                                tag: '強調',
                                title: '大事なことを、視界へ刻む。',
                                text: '色を変える。最前面に貼る。「ロックだぜ」モードで、大事なことを目線の真ん中に置く。',
                                textColor: '#102030',
                            },
                            {
                                color: '#D4A48A',
                                topColor: '#B88060',
                                rotation: '-rotate-1',
                                tag: 'iPhone',
                                title: '思考を、どこでも逃がさない。',
                                text: '選んだ付箋を iPhone へ送る。帰り道に書いたメモは、家のデスクトップに帰ってくる。',
                                textColor: '#3A1810',
                            },
                        ]).map((item) => (
                            <div
                                key={item.title}
                                className={`${item.rotation} p-7 rounded-sm hover:rotate-0 transition-all duration-200 cursor-default`}
                                style={{
                                    backgroundColor: item.color,
                                    boxShadow: '3px 5px 14px rgba(0,0,0,0.13)',
                                    position: 'relative',
                                }}
                            >
                                <div className="h-2.5 -mx-7 -mt-7 rounded-t-sm mb-5" style={{ backgroundColor: item.topColor }} />
                                <div
                                    className="text-[10px] font-bold uppercase tracking-[0.2em] mb-3 inline-block px-2 py-0.5 rounded-full"
                                    style={{ backgroundColor: 'rgba(0,0,0,0.08)', color: item.textColor }}
                                >
                                    {item.tag}
                                </div>
                                <h3 className="text-xl font-bold mb-3" style={{ color: item.textColor }}>
                                    {item.title}
                                </h3>
                                <p className="text-sm leading-relaxed" style={{ color: item.textColor, opacity: 0.85 }}>
                                    {item.text}
                                </p>
                            </div>
                        ))}
                    </div>

                    {/* サブ機能（控えめに） */}
                    <p className="text-center text-xs font-bold text-[#8A7055] uppercase tracking-[0.3em] mb-5">
                        {isEn ? 'And more' : 'その他にも'}
                    </p>
                    <div className="grid sm:grid-cols-3 gap-3 max-w-3xl mx-auto">
                        {(isEn ? [
                            { emoji: '🖼️', text: 'Paste images & draw on them' },
                            { emoji: '🖊️', text: 'Markdown' },
                            { emoji: '🔍', text: 'Full-text search (Regex)' },
                            { emoji: '📊', text: 'Mermaid flowcharts' },
                            { emoji: '🏷️', text: 'Tags & archive' },
                            { emoji: '🔔', text: 'Tray + Auto-start' },
                        ] : [
                            { emoji: '🖼️', text: '画像を貼って、書き込める' },
                            { emoji: '🖊️', text: 'Markdown 対応' },
                            { emoji: '🔍', text: '全文検索（正規表現）' },
                            { emoji: '📊', text: 'Mermaid でフローチャート' },
                            { emoji: '🏷️', text: 'タグ・アーカイブ' },
                            { emoji: '🔔', text: 'トレイ常駐・自動起動' },
                        ]).map((item) => (
                            <div
                                key={item.text}
                                className="flex items-center gap-3 px-4 py-3 rounded-sm border text-sm"
                                style={{ backgroundColor: '#EDE4D3', borderColor: '#C8B898', color: '#6A5540' }}
                            >
                                <span>{item.emoji}</span>
                                <span>{item.text}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* 波形 */}
            <div className="overflow-hidden leading-none" style={{ height: 40, backgroundColor: '#E2D7C3' }}>
                <svg viewBox="0 0 1200 40" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: '100%' }}>
                    <path d="M0,20 C300,0 900,40 1200,20 L1200,0 L0,0 Z" fill="#EDE4D3" />
                </svg>
            </div>

            {/* ==============================
                6. PC↔iPhone 連携
                Heroから降ろした既存アニメーション
            ============================== */}
            <section className="py-24 px-6" style={{ backgroundColor: '#EDE4D3' }}>
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-14">
                        <p className="text-xs font-bold text-[#8A7055] uppercase tracking-[0.35em] mb-6">
                            {isEn ? 'Windows × iPhone' : 'Windows × iPhone'}
                        </p>
                        <h2 className="text-3xl sm:text-4xl font-bold text-[#2C1F0E] mb-4 tracking-tight">
                            {isEn ? (
                                <>Carry your thoughts <span className="text-[#5C7A3E]">anywhere.</span></>
                            ) : (
                                <>思考を、<span className="text-[#5C7A3E]">どこでも逃がさない。</span></>
                            )}
                        </h2>
                        <p className="text-[#8A7055] max-w-xl mx-auto leading-relaxed">
                            {isEn
                                ? 'Pick a note on your PC, send it to your iPhone. Pick one on your iPhone, it lands on your PC.'
                                : 'PCで書いた付箋を、iPhoneへ送る。iPhoneで書いた付箋を、PCへ送る。それだけを、軽く。'}
                        </p>
                    </div>

                    <div className="max-w-lg mx-auto">
                        <div className="flex items-center justify-center gap-4 sm:gap-8">
                            {/* PC側 */}
                            <div className="flex-1 flex flex-col items-center">
                                <div
                                    className="w-full rounded-xl overflow-hidden shadow-xl border border-[#C8B898]"
                                    style={{ backgroundColor: '#D8CEBA' }}
                                >
                                    <div
                                        className="flex items-center gap-1.5 px-3 py-2 border-b border-[#C0B090]"
                                        style={{ backgroundColor: '#C8B890' }}
                                    >
                                        <div className="w-2.5 h-2.5 rounded-full bg-[#E87070]/70" />
                                        <div className="w-2.5 h-2.5 rounded-full bg-[#E8D070]/70" />
                                        <div className="w-2.5 h-2.5 rounded-full bg-[#70C870]/70" />
                                        <span className="text-[10px] text-[#8A7050] ml-1 font-medium">
                                            {isEn ? 'FUSEN' : '俺の付箋'}
                                        </span>
                                    </div>
                                    <div className="p-3 min-h-[200px] relative overflow-hidden">
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
                                            <div className="h-1.5 -mx-2 -mt-2 mb-2 rounded-t-sm" style={{ backgroundColor: '#8BAF75' }} />
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
                                            <div className="h-1.5 -mx-2 -mt-2 mb-2 rounded-t-sm" style={{ backgroundColor: '#7AAFC0' }} />
                                            <p className="text-[10px] font-semibold text-[#102030]">
                                                {isEn ? 'Reading Notes' : '読書メモ'}
                                            </p>
                                        </div>
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
                                                transform: isFlying ? 'translateX(60px) scale(0.6)' : 'translateX(-50%) scale(1)',
                                            }}
                                        >
                                            <div className="h-1.5 -mx-2 -mt-2 mb-2 rounded-t-sm" style={{ backgroundColor: '#D9C060' }} />
                                            <p className="text-[10px] font-semibold text-[#3A2C00]">
                                                {noteTexts[noteIdx % noteTexts.length]}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                <p className="text-center text-xs text-[#8A7055] mt-2 font-medium">💻 Windows PC</p>
                            </div>

                            <div className="flex flex-col items-center gap-1 flex-shrink-0">
                                <div className="text-2xl font-bold text-[#8BAF7C]" style={{ animation: 'pulse 2s infinite' }}>⇄</div>
                                <div className="text-[9px] text-[#A89878] text-center leading-tight font-medium">
                                    {isEn ? <>Choose<br />Send</> : <>選んで<br />送る</>}
                                </div>
                            </div>

                            {/* iPhone */}
                            <div className="flex-1 flex flex-col items-center">
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
                                    <div
                                        className="overflow-hidden min-h-[185px] pt-5"
                                        style={{ backgroundColor: '#F5F0E8', borderRadius: '18px' }}
                                    >
                                        <div className="px-2 py-1.5">
                                            <p className="text-[9px] font-bold text-[#5C4430] mb-2 pl-0.5">
                                                {isEn ? 'FUSEN' : '俺の付箋'}
                                            </p>
                                            {iphoneNotes.map((note, i) => (
                                                <div
                                                    key={`${note}-${i}`}
                                                    className="mb-1.5 rounded-sm px-2 py-1.5"
                                                    style={{
                                                        backgroundColor: i === 0 ? '#EDD87A' : i === 1 ? '#A8C890' : '#9DC0D0',
                                                        opacity: i === 0 ? 1 : i === 1 ? 0.8 : 0.6,
                                                        transform: `scale(${i === 0 ? 1 : 0.95})`,
                                                        boxShadow: '1px 2px 4px rgba(0,0,0,0.1)',
                                                        transition: 'all 0.4s ease',
                                                    }}
                                                >
                                                    <p className="text-[9px] font-semibold text-[#2C1F0E]">{note}</p>
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
                                <p className="text-center text-xs text-[#8A7055] mt-2 font-medium">📱 iPhone</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* 波形 */}
            <div className="overflow-hidden leading-none" style={{ height: 40, backgroundColor: '#EDE4D3' }}>
                <svg viewBox="0 0 1200 40" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: '100%' }}>
                    <path d="M0,20 C300,40 900,0 1200,20 L1200,40 L0,40 Z" fill="#E2D7C3" />
                </svg>
            </div>

            {/* ==============================
                7. 棲み分け
            ============================== */}
            <section className="py-24 px-6" style={{ backgroundColor: '#E2D7C3' }}>
                <div className="max-w-5xl mx-auto">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl sm:text-4xl font-bold text-[#2C1F0E] mb-3 tracking-tight">
                            {isEn
                                ? <>Why not just <span className="text-[#5C7A3E]">Sticky Notes</span> or <span className="text-[#5C7A3E]">Excel</span>?</>
                                : <><span className="text-[#5C7A3E]">Sticky Notes</span> でも <span className="text-[#5C7A3E]">Excel</span> でもない理由。</>}
                        </h2>
                        <p className="text-[#8A7055] max-w-2xl mx-auto leading-relaxed">
                            {isEn
                                ? <>Sticky Notes is fast, but too limited. Excel is flexible, but too heavy.<br className="hidden sm:inline" /> FUSEN lives in the gap.</>
                                : <>Sticky Notes は速いが、できることが少ない。Excel は自由だが、ちょっと重い。<br className="hidden sm:inline" />俺の付箋は、その隙間にいる。</>}
                        </p>
                    </div>

                    {/* ポジショニング・チャート */}
                    <div className="bg-white/60 rounded-2xl border border-[#C8B89A]/70 p-6 sm:p-10 mb-12 shadow-md">
                        <div className="text-center mb-4">
                            <p className="text-xs font-bold text-[#8A7055] uppercase tracking-widest">
                                {isEn ? 'Positioning' : 'ポジショニング・チャート'}
                            </p>
                        </div>
                        <div className="relative mx-auto" style={{ maxWidth: 600, paddingLeft: 56, paddingBottom: 36, paddingTop: 12, paddingRight: 12 }}>
                            <div className="relative h-72 sm:h-80 border-l-2 border-b-2 border-[#8A7055]/50">
                                <div className="absolute -left-12 top-0 text-xs text-[#5C7A3E] font-bold leading-tight">
                                    <div>↑ {isEn ? 'Fast' : '速い'}</div>
                                </div>
                                <div className="absolute -left-12 bottom-0 text-xs text-[#A53C2C] font-bold leading-tight">
                                    <div>↓ {isEn ? 'Slow' : '遅い'}</div>
                                </div>
                                <div className="absolute -bottom-7 left-0 text-xs text-[#A53C2C] font-bold">
                                    ← {isEn ? "Can't draw" : '書けない'}
                                </div>
                                <div className="absolute -bottom-7 right-0 text-xs text-[#5C7A3E] font-bold">
                                    {isEn ? 'Can draw' : '書ける'} →
                                </div>

                                <div className="absolute" style={{ top: '14%', left: '12%', transform: 'translate(-50%, -50%)' }}>
                                    <div className="flex flex-col items-center">
                                        <div className="w-4 h-4 rounded-full bg-[#7A6A50] shadow" />
                                        <div className="text-xs mt-2 whitespace-nowrap text-[#5A4030] font-medium">📌 Sticky Notes</div>
                                    </div>
                                </div>

                                <div className="absolute" style={{ top: '78%', left: '78%', transform: 'translate(-50%, -50%)' }}>
                                    <div className="flex flex-col items-center">
                                        <div className="w-4 h-4 rounded-full bg-[#7A6A50] shadow" />
                                        <div className="text-xs mt-2 whitespace-nowrap text-[#5A4030] font-medium">📊 Excel</div>
                                    </div>
                                </div>

                                <div className="absolute" style={{ top: '14%', left: '78%', transform: 'translate(-50%, -50%)' }}>
                                    <div className="flex flex-col items-center">
                                        <div className="relative">
                                            <div className="absolute inset-0 w-7 h-7 rounded-full bg-[#8BAF7C] animate-ping opacity-50" style={{ left: -6, top: -6 }} />
                                            <div className="relative w-4 h-4 rounded-full bg-[#5C7A3E] ring-4 ring-[#8BAF7C]/40 shadow" />
                                        </div>
                                        <div className="text-xs mt-2 whitespace-nowrap font-bold text-[#5C7A3E]">⭐ {isEn ? 'FUSEN' : '俺の付箋'}</div>
                                        <div className="text-[10px] text-[#8A7055] mt-0.5">+ 📱 iPhone</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <p className="text-center text-xs text-[#8A7055] mt-8">
                            {isEn ? 'The top-right corner had nobody. So we built it.' : '右上に居る人がいなかったので、自分で作りました。'}
                        </p>
                    </div>

                    {/* 3列比較カード */}
                    <div className="grid md:grid-cols-3 gap-7">
                        <div className="rotate-1 p-6 rounded-sm transition-all duration-200 hover:rotate-0" style={{ backgroundColor: '#E2D7C3', boxShadow: '3px 5px 14px rgba(0,0,0,0.13)' }}>
                            <div className="h-2.5 -mx-6 -mt-6 rounded-t-sm mb-5" style={{ backgroundColor: '#C8B898' }} />
                            <div className="text-2xl mb-2">📌</div>
                            <div className="text-[10px] font-bold text-[#8A7055] uppercase tracking-widest mb-1">Microsoft</div>
                            <h3 className="text-lg font-bold text-[#2C1F0E] mb-4">Sticky Notes</h3>
                            <ul className="text-sm text-[#5A4030] space-y-2 leading-relaxed">
                                <li>⚡ {isEn ? 'Fast launch' : '起動が速い'}</li>
                                <li>📌 {isEn ? 'Sticks on desktop' : '付箋として常駐'}</li>
                                <li className="text-[#A53C2C]">❌ {isEn ? "Can't draw on images" : '画像に書き込めない'}</li>
                                <li className="text-[#A53C2C]">❌ {isEn ? 'No iPhone handoff' : 'iPhone と繋がらない'}</li>
                            </ul>
                        </div>

                        <div className="-rotate-1 p-6 rounded-sm transition-all duration-200 hover:rotate-0" style={{ backgroundColor: '#E2D7C3', boxShadow: '3px 5px 14px rgba(0,0,0,0.13)' }}>
                            <div className="h-2.5 -mx-6 -mt-6 rounded-t-sm mb-5" style={{ backgroundColor: '#C8B898' }} />
                            <div className="text-2xl mb-2">📊</div>
                            <div className="text-[10px] font-bold text-[#8A7055] uppercase tracking-widest mb-1">Microsoft</div>
                            <h3 className="text-lg font-bold text-[#2C1F0E] mb-4">Excel</h3>
                            <ul className="text-sm text-[#5A4030] space-y-2 leading-relaxed">
                                <li>🖋️ {isEn ? 'Draw on images' : '画像に書き込める'}</li>
                                <li>📐 {isEn ? 'Free layout' : '自由なレイアウト'}</li>
                                <li className="text-[#A53C2C]">❌ {isEn ? 'Slow to launch' : '起動が遅い'}</li>
                                <li className="text-[#A53C2C]">❌ {isEn ? 'Not a sticky note' : '付箋として常駐できない'}</li>
                            </ul>
                        </div>

                        <div className="rotate-1 p-6 rounded-sm border-2 transition-all duration-200 hover:rotate-0 relative" style={{ backgroundColor: '#EDD87A', borderColor: '#5C7A3E', boxShadow: '4px 6px 18px rgba(92,122,62,0.25)' }}>
                            <div className="h-2.5 -mx-6 -mt-6 rounded-t-sm mb-5" style={{ backgroundColor: '#D9C060' }} />
                            <div className="absolute -top-3 -right-3 px-3 py-1 rounded-full text-[10px] font-bold text-[#F5EDD8] uppercase tracking-wider" style={{ backgroundColor: '#5C7A3E' }}>
                                ⭐ {isEn ? 'The fit' : '隙間にぴったり'}
                            </div>
                            <div className="text-2xl mb-2">📝</div>
                            <div className="text-[10px] font-bold text-[#5C7A3E] uppercase tracking-widest mb-1">ONF Studios</div>
                            <h3 className="text-lg font-bold text-[#3A2C00] mb-4">{isEn ? 'FUSEN' : '俺の付箋'}</h3>
                            <ul className="text-sm text-[#3A2C00] space-y-2 leading-relaxed font-medium">
                                <li>⚡ {isEn ? '0.3 s launch (Ctrl+N)' : '起動 0.3 秒（Ctrl+N）'}</li>
                                <li>📌 {isEn ? 'Sticks on desktop' : '付箋として常駐'}</li>
                                <li>🖋️ {isEn ? 'Draw on images' : '画像に書き込める'}</li>
                                <li>📱 {isEn ? 'Reaches your iPhone' : 'iPhone と繋がる'}</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </section>

            {/* 波形 */}
            <div className="overflow-hidden leading-none" style={{ height: 40, backgroundColor: '#E2D7C3' }}>
                <svg viewBox="0 0 1200 40" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: '100%' }}>
                    <path d="M0,20 C300,0 900,40 1200,20 L1200,0 L0,0 Z" fill="#EDE4D3" />
                </svg>
            </div>

            {/* ==============================
                8. 使い方シナリオ
            ============================== */}
            <section className="py-24 px-6" style={{ backgroundColor: '#EDE4D3' }}>
                <div className="max-w-5xl mx-auto">
                    <div className="text-center mb-14">
                        <h2 className="text-3xl sm:text-4xl font-bold text-[#2C1F0E] mb-3 tracking-tight">
                            {isEn ? 'How it lives with you' : 'こんな風に、そばにいる'}
                        </h2>
                        <p className="text-[#8A7055]">
                            {isEn ? 'Small scenes from Win + iPhone' : 'Win + iPhone で起こる、小さな場面'}
                        </p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-6">
                        {(isEn ? [
                            { emoji: '🖥️', scene: 'Home PC', title: 'A thought at home', desc: 'Write it on a Windows note. Read it later on iPhone.', color: '#EDD87A', topColor: '#D9C060', textColor: '#3A2C00', rotation: '-rotate-1' },
                            { emoji: '🍳', scene: 'Kitchen', title: 'Cooking with a recipe note', desc: 'Save tips from your PC. Stand the iPhone up in the kitchen and cook.', color: '#A8C890', topColor: '#8BAF75', textColor: '#1E3A10', rotation: 'rotate-1' },
                            { emoji: '📌', scene: 'Always there', title: 'Stays where you see it', desc: 'On your screen. Doesn\'t fade. Doesn\'t need Notion.', color: '#9DC0D0', topColor: '#7AAFC0', textColor: '#102030', rotation: '-rotate-1' },
                        ] : [
                            { emoji: '🖥️', scene: '自宅PC', title: '家のPCでふと思ったら', desc: 'Windowsの付箋に書く。あとでiPhoneでも見られる。', color: '#EDD87A', topColor: '#D9C060', textColor: '#3A2C00', rotation: '-rotate-1' },
                            { emoji: '🍳', scene: 'キッチン', title: 'レシピメモを片手に料理', desc: 'PCで見つけたレシピのコツを付箋に。キッチンではiPhoneを立てかけて、それを見ながら料理。', color: '#A8C890', topColor: '#8BAF75', textColor: '#1E3A10', rotation: 'rotate-1' },
                            { emoji: '📌', scene: 'デスクトップ常駐', title: 'いつもの場所に貼っておく', desc: 'PCの画面に常駐。消えない。重くない。Notionを開かなくていい。', color: '#9DC0D0', topColor: '#7AAFC0', textColor: '#102030', rotation: '-rotate-1' },
                        ]).map((item) => (
                            <div
                                key={item.title}
                                className={`${item.rotation} p-6 rounded-sm hover:rotate-0 transition-all duration-200 cursor-default`}
                                style={{ backgroundColor: item.color, boxShadow: '3px 5px 14px rgba(0,0,0,0.13)' }}
                            >
                                <div className="h-2.5 -mx-6 -mt-6 rounded-t-sm mb-5" style={{ backgroundColor: item.topColor }} />
                                <div
                                    className="text-[10px] font-bold px-2 py-0.5 rounded-full inline-block mb-3"
                                    style={{ backgroundColor: 'rgba(0,0,0,0.08)', color: item.textColor }}
                                >
                                    {item.scene}
                                </div>
                                <div className="text-2xl mb-3">{item.emoji}</div>
                                <h3 className="text-base font-bold mb-2" style={{ color: item.textColor }}>
                                    {item.title}
                                </h3>
                                <p className="text-sm leading-relaxed" style={{ color: item.textColor, opacity: 0.8 }}>
                                    {item.desc}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* 波形 */}
            <div className="overflow-hidden leading-none" style={{ height: 40, backgroundColor: '#EDE4D3' }}>
                <svg viewBox="0 0 1200 40" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: '100%' }}>
                    <path d="M0,20 C300,40 900,0 1200,20 L1200,40 L0,40 Z" fill="#E2D7C3" />
                </svg>
            </div>

            {/* ==============================
                9. 体験デモ
            ============================== */}
            <section className="py-24 px-6" style={{ backgroundColor: '#E2D7C3' }}>
                <div className="max-w-5xl mx-auto">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl sm:text-4xl font-bold text-[#2C1F0E] mb-3 tracking-tight">
                            {isEn ? 'Try it right here.' : 'この場で、試してみる。'}
                        </h2>
                        <p className="text-[#8A7055]">
                            {isEn
                                ? <>No download required. Press Enter to stick, then tap 📱→ to send. <span className="text-[#A53C2C]">(In the real app: right-click → &ldquo;Send to iPhone&rdquo;.)</span></>
                                : <>ダウンロード不要。Enter で貼り、付箋の 📱→ ボタンで iPhone に送ります。<span className="text-[#A53C2C]">（実アプリでは付箋を右クリック→「iPhoneへ送る」）</span></>}
                        </p>
                    </div>

                    <div className="flex flex-col lg:flex-row items-start gap-8">
                        <div className="w-full lg:w-80 flex-shrink-0">
                            <div className="bg-white/80 p-5 sm:p-6 rounded-2xl shadow-lg border border-[#C8B89A]/80 backdrop-blur-md">
                                <label className="block text-sm font-bold text-[#4A6730] mb-3 flex items-center gap-2">
                                    <span className="text-lg">💡</span> {isEn ? 'Write on Windows' : 'Windows側で書く'}
                                </label>
                                <div className="relative">
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        value={inputValue}
                                        onChange={(e) => setInputValue(e.target.value)}
                                        onKeyDown={handleDemoKeyDown}
                                        placeholder={isEn ? 'Recipe idea, shopping list...' : '例：今夜はカレー（玉ねぎ忘れない！）'}
                                        className="w-full text-base py-4 pl-4 pr-28 bg-[#FDFBF7] border-2 border-[#8BAF7C] rounded-xl focus:outline-none focus:border-[#5C7A3E] focus:ring-4 focus:ring-[#8BAF7C]/30 transition-all font-medium text-[#2C1F0E] placeholder:text-[#A89878] shadow-inner"
                                        autoComplete="off"
                                    />
                                    <button
                                        onClick={addDemoNote}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-[#5C7A3E] bg-[#F4F9F1] hover:bg-[#E8F0E4] px-3 py-2 rounded-lg border-2 border-[#8BAF7C]/60 shadow-sm transition-all cursor-pointer hover:scale-105 active:scale-95"
                                    >
                                        {isEn ? 'Send ⏎' : '送る ⏎'}
                                    </button>
                                </div>
                                <p className="text-xs text-[#A89878] mt-2 text-right">{isEn ? 'Press Enter to stick' : 'Enterでも貼れます'}</p>
                            </div>
                        </div>

                        <div className="flex-1 w-full">
                            <div
                                className="relative w-full rounded-2xl border border-[#C8B89A]/60 shadow-inner overflow-hidden"
                                style={{ backgroundColor: '#D8CEBA', minHeight: '280px' }}
                            >
                                <div className="absolute left-4 top-4 rounded-full bg-white/70 px-3 py-1 text-xs font-bold text-[#5C7A3E] border border-[#C8B89A]/70">
                                    {isEn ? 'Windows sticky note' : 'Windowsの付箋'}
                                </div>
                                <div className="absolute right-4 top-4 rounded-full bg-white/70 px-3 py-1 text-xs font-bold text-[#5C7A3E] border border-[#C8B89A]/70">
                                    {isEn ? 'iPhone view' : 'iPhoneでも見る'}
                                </div>

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
                                        {!note.sentToIphone ? (
                                            <button
                                                type="button"
                                                onClick={() => sendDemoNoteToIphone(note.id)}
                                                title={isEn ? 'Send to iPhone (right-click in the real app)' : 'iPhoneへ送る（実アプリでは右クリック）'}
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
                                            {isEn ? 'FUSEN' : '俺の付箋'}
                                        </p>
                                        <div className="rounded-sm px-2 py-1.5 text-[10px] font-semibold text-[#2C1F0E]" style={{ backgroundColor: note.color }}>
                                            {note.text}
                                        </div>
                                    </div>
                                ))}

                                <div className={`absolute inset-0 transition-opacity duration-700 ${demoNotes.length > 0 ? 'opacity-0 pointer-events-none' : 'opacity-100 flex items-center justify-center'}`}>
                                    <div className="text-center text-[#8A7055] px-4">
                                        <div className="text-4xl mb-3 animate-bounce">✨</div>
                                        <p className="font-bold">{isEn ? 'Write on the left, hit Enter.' : '左の入力欄に書いて Enter。'}</p>
                                        <p className="text-sm mt-2">{isEn ? 'Then tap 📱→ on the note to send it to iPhone.' : '貼った付箋の 📱→ ボタンで iPhone に送れます。'}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <style>{`
                    @keyframes demoPopIn {
                        0% { opacity: 0; transform: scale(0.5) translateY(30px); }
                        100% { opacity: 1; transform: scale(1) translateY(0); }
                    }
                `}</style>
            </section>

            {/* 波形 */}
            <div className="overflow-hidden leading-none" style={{ height: 40, backgroundColor: '#E2D7C3' }}>
                <svg viewBox="0 0 1200 40" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: '100%' }}>
                    <path d="M0,20 C300,0 900,40 1200,20 L1200,0 L0,0 Z" fill="#EDE4D3" />
                </svg>
            </div>

            {/* ==============================
                10. オレノフ動画
            ============================== */}
            <section className="py-20 px-6" style={{ backgroundColor: '#EDE4D3' }}>
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

            {/* 波形 */}
            <div className="overflow-hidden leading-none" style={{ height: 40, backgroundColor: '#EDE4D3' }}>
                <svg viewBox="0 0 1200 40" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: '100%' }}>
                    <path d="M0,20 C300,40 900,0 1200,20 L1200,40 L0,40 Z" fill="#E2D7C3" />
                </svg>
            </div>

            {/* ==============================
                11. プライバシー
            ============================== */}
            <section className="py-24 px-6" style={{ backgroundColor: '#E2D7C3' }}>
                <div className="max-w-2xl mx-auto text-center">
                    <p className="text-xs font-bold text-[#8A7055] uppercase tracking-[0.35em] mb-8">
                        {isEn ? 'Your PC, Your Data' : 'あなたのPC、あなたのデータ'}
                    </p>
                    <h2 className="text-3xl sm:text-4xl font-bold text-[#2C1F0E] leading-tight mb-10 tracking-tight">
                        {isEn ? (
                            <>
                                FUSEN lives<br />
                                on <span className="text-[#5C7A3E]">your own PC.</span>
                            </>
                        ) : (
                            <>
                                俺の付箋は、<br />
                                <span className="text-[#5C7A3E]">あなたの PC</span> に残る。
                            </>
                        )}
                    </h2>
                    <p className="text-base sm:text-lg text-[#6A5540] leading-[2] mb-8">
                        {isEn ? (
                            <>
                                When you send a note to your iPhone,<br />
                                it passes through <span className="font-bold text-[#3A2C18]">your own Google Drive</span> ── nowhere else.<br />
                                No third-party server. No one else&apos;s cloud.<br />
                                <span className="font-bold text-[#3A2C18]">Not even the developer can see them.</span>
                            </>
                        ) : (
                            <>
                                iPhone へ送るときだけ、<br />
                                <span className="font-bold text-[#3A2C18]">あなたの Google Drive</span> を経由する。<br />
                                他人のサーバーは、通りません。<br />
                                <span className="font-bold text-[#3A2C18]">開発者ですら、見ることはできません。</span>
                            </>
                        )}
                    </p>
                    <p className="text-sm text-[#8A7055]">
                        {isEn
                            ? 'Open source on GitHub. Verifiable.'
                            : 'ソースコードは GitHub で公開。検証できます。'}
                    </p>
                </div>
            </section>

            {/* 波形 */}
            <div className="overflow-hidden leading-none" style={{ height: 40, backgroundColor: '#E2D7C3' }}>
                <svg viewBox="0 0 1200 40" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: '100%' }}>
                    <path d="M0,20 C300,0 900,40 1200,20 L1200,0 L0,0 Z" fill="#EDE4D3" />
                </svg>
            </div>

            {/* ==============================
                12. 最後のCTA（円環）
            ============================== */}
            <section className="py-28 sm:py-32 px-6" style={{ backgroundColor: '#EDE4D3' }}>
                <div className="max-w-2xl mx-auto text-center">
                    <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#2C1F0E] leading-tight mb-12 tracking-tight">
                        {isEn ? (
                            <>
                                Pin a slipping thought.<br />
                                <span className="text-[#5C7A3E]">Right now.</span>
                            </>
                        ) : (
                            <>
                                消えそうな思考を、<br />
                                <span className="text-[#5C7A3E]">いま、固定する。</span>
                            </>
                        )}
                    </h2>

                    <div
                        className="relative -rotate-1 rounded-sm px-10 py-12 mb-10 inline-block"
                        style={{
                            backgroundColor: '#EDD87A',
                            boxShadow: '4px 6px 24px rgba(0,0,0,0.16)',
                        }}
                    >
                        <div className="h-3.5 -mx-10 -mt-12 rounded-t-sm mb-10" style={{ backgroundColor: '#D9C060' }} />
                        <div
                            className="absolute -top-3 left-1/2 -translate-x-1/2 w-16 h-5 rounded-sm opacity-70 rotate-1"
                            style={{ backgroundColor: '#F0E0A0', border: '1px solid #D8C880' }}
                        />

                        <Link
                            href={downloadUrl}
                            target="_blank"
                            onClick={() => trackEvent('download_click_cta')}
                            className="inline-flex items-center gap-2 px-8 py-4 rounded-sm font-bold text-base text-[#F5EDD8] transition-all duration-200 hover:-translate-y-0.5"
                            style={{
                                backgroundColor: '#5C7A3E',
                                boxShadow: '2px 3px 10px rgba(92,122,62,0.35)',
                            }}
                        >
                            <Download className="w-5 h-5" />
                            {isEn ? 'Download for Windows' : 'ダウンロード（Windows）'}
                        </Link>
                        <p className="text-xs text-[#7A6200] mt-4">
                            {isEn ? 'Free · 1-min install · Your data stays with you' : '無料 ・ インストール 1 分 ・ データはあなたの手元に'}
                        </p>
                    </div>

                    <p className="text-sm text-[#9A8468] mb-6">
                        {isEn ? 'Windows 10/11 (64-bit) · ~100 MB' : 'Windows 10/11 (64-bit) ・ 約100MB'}
                    </p>

                    <div className="flex flex-col sm:flex-row gap-5 justify-center text-sm">
                        <Link
                            href="https://github.com/ore-no-fusen/ore-no-fusen"
                            target="_blank"
                            className="text-[#5C7A3E] hover:text-[#3A5020] transition-colors"
                        >
                            📖 {isEn ? 'View on GitHub' : 'GitHubを見る'}
                        </Link>
                        <Link
                            href="https://x.com/uchikiman"
                            target="_blank"
                            className="text-[#5C7A3E] hover:text-[#3A5020] transition-colors"
                        >
                            💬 {isEn ? 'Send Feedback' : 'フィードバックを送る'}
                        </Link>
                    </div>
                </div>
            </section>

            {/* フッター */}
            <footer
                className="py-8 px-6 border-t"
                style={{ backgroundColor: '#D8CEBA', borderColor: '#C0B098' }}
            >
                <div className="max-w-5xl mx-auto flex flex-col gap-6">
                    <div className="flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-[#8A7458]">
                        <div>© 2026 ore-no-fusen by ONF Studios. MIT License.</div>
                        <div className="flex gap-6">
                            <Link href="https://github.com/ore-no-fusen/ore-no-fusen" target="_blank" className="hover:text-[#5A4830] transition-colors">
                                GitHub
                            </Link>
                            <Link href="https://github.com/ore-no-fusen/ore-no-fusen/blob/main/README.md" target="_blank" className="hover:text-[#5A4830] transition-colors">
                                {isEn ? 'Documentation' : 'ドキュメント'}
                            </Link>
                        </div>
                    </div>
                    <div className="border-t border-[#C0B098]/40 pt-4 flex justify-center gap-8 text-sm text-[#7A6A50] font-medium">
                        <Link href="https://ore-no-fusen.github.io/ore-no-fusen/100_PRIVACY.html" target="_blank" className="hover:text-[#5C7A3E] transition-colors">
                            {isEn ? 'Privacy Policy' : 'プライバシーポリシー'}
                        </Link>
                        <Link href="https://ore-no-fusen.github.io/ore-no-fusen/101_TERMS.html" target="_blank" className="hover:text-[#5C7A3E] transition-colors">
                            {isEn ? 'Terms of Service' : '利用規約'}
                        </Link>
                    </div>
                </div>
            </footer>
        </div>
    );
}
