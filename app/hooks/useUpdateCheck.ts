/**
 * アップデートチェック Hook
 *
 * 責務:
 * - 起動3秒後の自動アップデートチェック
 * - アップデートダイアログの状態管理
 * - ダイアログ表示時のウィンドウリサイズ
 * - ダウンロード＆インストールの実行
 */

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getTranslation, type Language } from '@/lib/i18n';

type UseUpdateCheckOptions = {
    isMainWindow: boolean;
};

type UseUpdateCheckReturn = {
    pendingUpdate: any;
    showUpdateDialog: boolean;
    isHidingAfterUpdate: boolean;
    handleUpdateConfirm: () => Promise<void>;
    handleUpdateCancel: () => Promise<void>;
    tUpdate: ReturnType<typeof getTranslation>;
};

export function useUpdateCheck({ isMainWindow }: UseUpdateCheckOptions): UseUpdateCheckReturn {
    const [pendingUpdate, setPendingUpdate] = useState<any>(null);
    const [showUpdateDialog, setShowUpdateDialog] = useState(false);
    const [isHidingAfterUpdate, setIsHidingAfterUpdate] = useState(false);
    const [uiLanguage, setUiLanguage] = useState<Language>('ja');
    const tUpdate = getTranslation(uiLanguage);

    // UI言語の読み込みと監視
    useEffect(() => {
        let unlisten: (() => void) | undefined;
        
        // 初期読み込み
        invoke<any>('get_settings').then(s => {
            if (s?.language) setUiLanguage(s.language as Language);
        }).catch(() => {});

        // 更新監視
        import('@tauri-apps/api/event').then(({ listen }) => {
            listen<any>('settings_updated', (event) => {
                if (event.payload?.language) setUiLanguage(event.payload.language as Language);
            }).then(u => { unlisten = u; });
        }).catch(console.error);

        return () => { if (unlisten) unlisten(); };
    }, []);

    // 自動アップデート確認（メインウィンドウのみ・起動3秒後）
    useEffect(() => {
        if (!isMainWindow) return;
        const checkForUpdate = async () => {
            try {
                const { check } = await import('@tauri-apps/plugin-updater');
                const update = await check();
                if (!update) return;
                console.log(`[Updater] 新しいバージョンが見つかりました: ${update.version}`);
                setPendingUpdate(update);
                setShowUpdateDialog(true);
            } catch (e) {
                // アップデートチェック失敗はサイレントに無視
                console.warn('[Updater] アップデートチェック失敗:', e);
            }
        };
        const timer = setTimeout(checkForUpdate, 3000);
        return () => clearTimeout(timer);
    }, [isMainWindow]);

    // ダイアログ表示時のウィンドウリサイズ（レンダー内サイドエフェクト排除）
    useEffect(() => {
        if (!showUpdateDialog || !pendingUpdate) return;
        import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
            const { LogicalSize } = await import('@tauri-apps/api/dpi');
            const win = getCurrentWindow();
            await win.setSize(new LogicalSize(420, 280)).catch(() => {});
            await win.center().catch(() => {});
            await win.show().catch(() => {});
            await win.setFocus().catch(() => {});
        });
    }, [showUpdateDialog, pendingUpdate]);

    // ダウンロード＆インストール実行
    const handleUpdateConfirm = useCallback(async () => {
        setShowUpdateDialog(false);
        if (!pendingUpdate) return;
        try {
            const { relaunch } = await import('@tauri-apps/plugin-process');
            await pendingUpdate.downloadAndInstall();
            await relaunch();
        } catch (installErr) {
            console.error('[Updater] インストール失敗:', installErr);
        }
        setPendingUpdate(null);
    }, [pendingUpdate]);

    // アップデートキャンセル時の処理
    const handleUpdateCancel = useCallback(async () => {
        setIsHidingAfterUpdate(true);
        setShowUpdateDialog(false);
        setPendingUpdate(null);
        try {
            const { getCurrentWindow } = await import('@tauri-apps/api/window');
            const { LogicalSize } = await import('@tauri-apps/api/dpi');
            const win = getCurrentWindow();
            await win.setSize(new LogicalSize(240, 300)).catch(() => {});
            await win.center().catch(() => {});
            await win.hide().catch(() => {});
        } catch (e) {
            console.error('[Updater] キャンセル処理中のエラー:', e);
        } finally {
            setIsHidingAfterUpdate(false);
        }
    }, []);

    return {
        pendingUpdate,
        showUpdateDialog,
        isHidingAfterUpdate,
        handleUpdateConfirm,
        handleUpdateCancel,
        tUpdate,
    };
}
