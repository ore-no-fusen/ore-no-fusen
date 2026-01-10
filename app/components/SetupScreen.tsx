'use client';

import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

export default function SetupScreen({ onComplete }: { onComplete: () => void }) {
    const [mode, setMode] = useState<'default' | 'custom'>('default');
    const [customPath, setCustomPath] = useState('');
    const [importEnabled, setImportEnabled] = useState(false);
    const [importPath, setImportPath] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    const handleSelectCustomPath = async () => {
        const path = await invoke<string>('fusen_select_folder');
        if (path) setCustomPath(path);
    };

    const handleSelectImportPath = async () => {
        const path = await invoke<string>('fusen_select_folder');
        if (path) setImportPath(path);
    };

    const handleSetup = async () => {
        setIsProcessing(true);
        try {
            // セットアップ実行
            const basePath = await invoke<string>('setup_first_launch', {
                useDefault: mode === 'default',
                customPath: mode === 'custom' ? customPath : null,
                importPath: importEnabled ? importPath : null
            });

            // 既存のファイルをリスト取得
            const notes = await invoke<any[]>('fusen_list_notes', {
                folderPath: basePath
            });

            const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');

            if (notes.length > 0) {
                // 既存ファイルがある場合：それらを開く
                for (const note of notes) {
                    const safePath = note.path.replace(/\\/g, '/');
                    const pathParam = encodeURIComponent(safePath);
                    const url = `/?path=${pathParam}`;
                    const label = `fusen_${Date.now()}_${Math.random().toString(36).substring(7)}`;

                    await new WebviewWindow(label, {
                        url,
                        transparent: true,
                        decorations: false,
                        alwaysOnTop: false,
                        visible: true,
                        width: note.width || 400,
                        height: note.height || 300,
                        x: note.x,
                        y: note.y,
                    });

                    // ウィンドウ作成の間隔を空ける
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
            } else {
                // ファイルがない場合：最初の付箋を新規作成
                const note = await invoke<any>('fusen_create_note', {
                    folderPath: basePath,
                    context: ''
                });

                const safePath = note.meta.path.replace(/\\/g, '/');
                const pathParam = encodeURIComponent(safePath);
                const url = `/?path=${pathParam}`;
                const label = `fusen_${Date.now()}_${Math.random().toString(36).substring(7)}`;

                await new WebviewWindow(label, {
                    url,
                    transparent: true,
                    decorations: false,
                    alwaysOnTop: false,
                    visible: true,
                    width: note.meta.width || 400,
                    height: note.meta.height || 300,
                    x: note.meta.x,
                    y: note.meta.y,
                });
            }

            // 付箋が開いたら、mainウィンドウを非表示にする
            setTimeout(async () => {
                try {
                    console.log('[Setup] Attempting to hide main window...');
                    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
                    const mainWindow = await WebviewWindow.getByLabel('main');
                    if (mainWindow) {
                        console.log('[Setup] Main window found, calling hide()...');
                        await mainWindow.hide();
                        console.log('[Setup] Main window hidden successfully');
                    } else {
                        console.error('[Setup] Main window not found');
                    }
                } catch (e) {
                    console.error('[Setup] Failed to hide main window:', e);
                }
            }, 1000);

        } catch (e) {
            console.error('Setup failed:', e);
            alert('セットアップに失敗しました: ' + e);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div
            className="h-screen w-screen flex flex-col items-center justify-center p-8"
            style={{ fontFamily: 'BIZ UDGothic, sans-serif', background: '#ffffff' }}
        >
            <div className="max-w-xl w-full">
                {/* ヘッダー */}
                <div className="text-center mb-12">
                    <h1 className="text-4xl font-bold text-gray-900 mb-6">俺の付箋</h1>
                    <p className="text-gray-700 text-base leading-relaxed mb-2">
                        <strong>デスクトップ付箋アプリ</strong> - Markdownで書ける、自由に配置できる
                    </p>
                    <p className="text-gray-600 text-sm">
                        フォルダを選択して、セットアップを完了してください
                    </p>
                </div>

                {/* フォルダ選択 */}
                <div className="mb-6 space-y-3">
                    <label className="flex items-center gap-3 p-4 border-2 border-gray-300 rounded-lg hover:border-blue-500 cursor-pointer transition-colors bg-white">
                        <input
                            type="radio"
                            name="folder"
                            checked={mode === 'default'}
                            onChange={() => setMode('default')}
                            className="w-5 h-5 accent-blue-600"
                        />
                        <div className="flex-1">
                            <div className="font-bold text-base">推奨フォルダを使用</div>
                            <div className="text-sm text-gray-600">Documents/OreNoFusen</div>
                        </div>
                    </label>

                    <label className="flex items-center gap-3 p-4 border-2 border-gray-300 rounded-lg hover:border-blue-500 cursor-pointer transition-colors bg-white">
                        <input
                            type="radio"
                            name="folder"
                            checked={mode === 'custom'}
                            onChange={() => setMode('custom')}
                            className="w-5 h-5 accent-blue-600"
                        />
                        <div className="flex-1">
                            <div className="font-bold text-base">カスタムフォルダを選択</div>
                            <div className="text-sm text-gray-600">既存のフォルダを指定</div>
                        </div>
                    </label>

                    {mode === 'custom' && (
                        <div className="ml-11 mt-2">
                            <button
                                onClick={handleSelectCustomPath}
                                className="w-full p-3 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 text-left text-sm transition-colors"
                            >
                                {customPath || 'フォルダを選択...'}
                            </button>
                        </div>
                    )}
                </div>

                {/* インポート */}
                <div className="mb-8">
                    <label className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg cursor-pointer">
                        <input
                            type="checkbox"
                            checked={importEnabled}
                            onChange={(e) => setImportEnabled(e.target.checked)}
                            className="w-5 h-5 mt-0.5 accent-blue-600"
                        />
                        <div className="flex-1">
                            <div className="font-bold text-base">既存データを取り込む</div>
                            <div className="text-sm text-gray-600">他のフォルダから.mdファイルをコピー</div>
                        </div>
                    </label>

                    {importEnabled && (
                        <div className="ml-11 mt-2">
                            <button
                                onClick={handleSelectImportPath}
                                className="w-full p-3 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 text-left text-sm transition-colors"
                            >
                                {importPath || 'インポート元フォルダを選択...'}
                            </button>
                        </div>
                    )}
                </div>

                {/* OK ボタン */}
                <button
                    onClick={handleSetup}
                    disabled={isProcessing || (mode === 'custom' && !customPath) || (importEnabled && !importPath)}
                    className="w-full py-4 bg-gray-900 text-white rounded-lg font-bold text-base hover:bg-gray-800 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                    {isProcessing ? 'セットアップ中...' : 'OK'}
                </button>
            </div>
        </div>
    );
}
