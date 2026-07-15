/**
 * ローディング画面コンポーネント
 *
 * 責務:
 * - アプリケーション起動時や処理中の待機画面表示
 * - 起動アニメーションの提供
 * - Tauriウィンドウの初期表示制御
 */

import React, { useEffect } from 'react';

export default function LoadingScreen({ message = "Loading..." }: { message?: string }) {
    useEffect(() => {
        const showWindow = async () => {
            try {
                // クライアントサイドでのみ実行
                if (typeof window === 'undefined') return;

                // Tauri環境かどうかの簡易チェック（あるいはtry-catchで握りつぶす）
                const { getCurrentWindow } = await import('@tauri-apps/api/window');
                const { LogicalSize } = await import('@tauri-apps/api/dpi');
                const win = getCurrentWindow();
                // メインウィンドウの場合のみ表示（念のため）
                if (win.label === 'main') {
                    // 少し遅延させて、レンダリングが確実に完了してから表示
                    setTimeout(async () => {
                        await win.setSize(new LogicalSize(240, 300));
                        await win.center();
                        await win.show();
                        await win.setFocus();
                    }, 100);
                }
            } catch (e) {
                // ブラウザ等で実行した場合は無視
            }
        };
        showWindow();
    }, []);

    return (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-gray-900 select-none cursor-wait overflow-hidden"
            style={{ WebkitAppRegion: 'drag' } as any}>

            {/* Background Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] bg-yellow-500/20 rounded-full blur-[60px] pointer-events-none"></div>

            <div className="relative z-10 flex flex-col items-center">
                {/* Animated Icon Container */}
                <div className="relative mb-6">
                    <div className="absolute inset-0 bg-yellow-400 rounded-xl blur-lg opacity-40 animate-pulse"></div>
                    <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-xl shadow-2xl flex items-center justify-center transform rotate-6 animate-[bounce_2s_infinite]">
                        <span className="text-3xl filter drop-shadow-md">📝</span>
                        {/* Corner Fold */}
                        <div className="absolute top-0 right-0 border-t-[12px] border-r-[12px] border-t-white/30 border-r-transparent"></div>
                    </div>
                </div>

                {/* Title */}
                <h1 className="text-xl font-black text-white tracking-widest mb-3 drop-shadow-md">
                    ORE-NO-FUSEN
                </h1>
                <p className="text-base text-gray-500 font-mono tracking-[0.2em] mb-4 opacity-80">
                    v{process.env.NEXT_PUBLIC_APP_VERSION}
                </p>

                {/* Loading Indicator */}
                <div className="flex flex-col items-center gap-2">
                    <div className="h-1 w-24 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-yellow-400 animate-[loading_1s_ease-in-out_infinite] w-1/2 rounded-full"></div>
                    </div>
                    <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase animate-pulse">
                        {message}
                    </p>
                </div>
            </div>

            <style jsx>{`
        @keyframes loading {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(200%); }
        }
      `}</style>
        </div>
    );
}
