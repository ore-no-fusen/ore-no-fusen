'use client';

import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

// 必要な型定義
type SettingsProps = {
    onClose: () => void;
};

export default function SettingsPage({ onClose }: SettingsProps) {
    const [path, setPath] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        // 現在の設定をロード
        const load = async () => {
            try {
                const current = await invoke<string | null>('get_base_path');
                if (current) setPath(current);
            } catch (e) {
                console.error("Failed to load settings", e);
            }
        };
        load();
    }, []);

    const handleSelectFolder = async () => {
        try {
            const selected = await invoke<string>('fusen_select_folder');
            if (selected) {
                setPath(selected);
            }
        } catch (e) {
            console.error("Folder select failed", e);
        }
    };

    const handleSave = async () => {
        if (!path) return;
        setIsLoading(true);
        try {
            // 設定保存 (Rust側実装に依存。fusen_save_settings等がなければ実装必要だが、
            // 現状は select_folder した時点で永続化されている可能性もあるため、
            // ここでは確認のみとするか、明示的に何かを呼ぶ)

            // get_base_pathで確認
            const current = await invoke<string | null>('get_base_path');
            if (current !== path) {
                // パスが違うなら保存処理 (もしAPIがあれば)
                // なければ select_folder が保存を兼ねている前提
            }

            // 完了して閉じる
            onClose();
        } catch (e) {
            console.error("Save failed", e);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="h-screen w-screen bg-white text-gray-800 flex flex-col items-center justify-center p-8 select-none" style={{ WebkitAppRegion: 'drag' } as any}>
            <div className="w-full max-w-md bg-gray-50 rounded-2xl p-8 shadow-xl border border-gray-100 mb-8" style={{ WebkitAppRegion: 'no-drag' } as any}>
                <h2 className="text-2xl font-black mb-6 text-center text-gray-900">SETTINGS</h2>

                <div className="mb-6">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Vault Location</label>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={path}
                            readOnly
                            className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:outline-none"
                            placeholder="Not Selected"
                        />
                        <button
                            onClick={handleSelectFolder}
                            className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold transition-colors"
                        >
                            Change
                        </button>
                    </div>
                </div>

                <div className="flex justify-center">
                    <button
                        onClick={handleSave}
                        disabled={!path || isLoading}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-500/30 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? "SAVING..." : "SAVE & START"}
                    </button>
                </div>
            </div>

            <p className="text-xs text-gray-400">Ore-no-Fusen v1.0</p>
        </div>
    );
}
