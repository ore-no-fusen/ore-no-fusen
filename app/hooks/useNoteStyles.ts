import { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useSettings } from '@/lib/settings-store';
import { Note } from '@/app/api/notes';
import { safeUnlisten } from '@/app/utils/safeUnlisten';

export function useNoteStyles(note: Note | null, initialBackgroundColor?: string | null) {
    const { settings } = useSettings();
    // 開く側が色を知っている場合はそれを初期値にする（黄色フラッシュ防止）。無ければ従来どおり黄色
    const [noteBackgroundColor, setNoteBackgroundColor] = useState<string>(
        initialBackgroundColor && /^#[0-9a-fA-F]{6}$/.test(initialBackgroundColor)
            ? initialBackgroundColor
            : '#f7e9b0'
    );
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
            safeUnlisten(unlisten);
        };
    }, []);

    // 3. 個別付箋の設定（先頭の---部分）を適用（優先度高）
    useEffect(() => {
        if (!note?.meta) return;

        // 背景色が個別に設定されているか
        if (note.meta.background_color) {
            setNoteBackgroundColor(note.meta.background_color);
        }

        // フォントサイズが個別に設定されているか
        if (typeof note.meta.font_size === 'number') {
            setNoteFontSize(note.meta.font_size);
        }
    }, [note?.meta]);

    return {
        noteBackgroundColor,
        setNoteBackgroundColor,
        noteFontSize,
        setNoteFontSize
    };
}
