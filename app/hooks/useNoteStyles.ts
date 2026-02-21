import { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useSettings } from '@/lib/settings-store';
import { Note } from '@/app/api/notes';

export function useNoteStyles(note: Note | null) {
    const { settings } = useSettings();
    const [noteBackgroundColor, setNoteBackgroundColor] = useState<string>('#f7e9b0');
    const [noteFontSize, setNoteFontSize] = useState<number>(16);

    // 1. グローバル設定の適用 (フォントサイズ)
    useEffect(() => {
        setNoteFontSize(settings.font_size);
    }, [settings.font_size]);

    // 2. Tauriイベント経由でのリアルタイム設定更新受信 (フォントサイズ等)
    useEffect(() => {
        let unlisten: (() => void) | undefined;
        (async () => {
            try {
                unlisten = await listen<any>('settings_updated', (event) => {
                    const newSettings = event.payload;
                    if (newSettings && typeof newSettings.font_size === 'number') {
                        setNoteFontSize(newSettings.font_size);
                    }
                });
            } catch (e) {
                console.error('Failed to setup settings_updated listener', e);
            }
        })();
        return () => {
            if (unlisten) unlisten();
        };
    }, []);

    // 3. 個別付箋のフロントマター(メタデータ)の設定適用 (優先度高)
    useEffect(() => {
        if (!note?.meta) return;

        // 背景色が個別に設定されているか
        if (note.meta.background_color) {
            setNoteBackgroundColor(note.meta.background_color);
        }

        // （将来的に）フォントサイズの個別設定があればここで上書きする等の拡張が可能になる
    }, [note?.meta]);

    return {
        noteBackgroundColor,
        setNoteBackgroundColor,
        noteFontSize,
        setNoteFontSize
    };
}
