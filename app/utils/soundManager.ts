/**
 * SoundManager - 効果音管理ユーティリティ
 * 設定に基づいて効果音の再生を制御します
 */

import { invoke } from '@tauri-apps/api/core';

// 利用可能なサウンド
export type SoundType = 'peel-off' | 'pop';

// サウンドファイルのマッピング
const SOUND_FILES: Record<SoundType, string> = {
    'peel-off': '/sounds/peel-off.mp3',
    'pop': '/sounds/pop.mp3', // 将来用
};

// キャッシュ用
let soundEnabledCache: boolean | null = null;
let lastCacheTime = 0;
const CACHE_DURATION = 5000; // 5秒間キャッシュ

/**
 * 設定から soundEnabled を取得（キャッシュ付き）
 */
async function isSoundEnabled(): Promise<boolean> {
    const now = Date.now();

    // キャッシュが有効な場合
    if (soundEnabledCache !== null && (now - lastCacheTime) < CACHE_DURATION) {
        return soundEnabledCache;
    }

    try {
        // ブラウザ環境（開発用）
        if (typeof window !== 'undefined' && !('__TAURI__' in window)) {
            const saved = localStorage.getItem('ore-no-fusen-settings');
            if (saved) {
                const settings = JSON.parse(saved);
                soundEnabledCache = settings.soundEnabled ?? true;
            } else {
                soundEnabledCache = true; // デフォルトは有効
            }
        } else {
            // Tauri環境
            const settings = await invoke<{ soundEnabled: boolean }>('get_settings');
            soundEnabledCache = settings.soundEnabled ?? true;
        }

        lastCacheTime = now;
        return soundEnabledCache ?? true;
    } catch (e) {
        console.error('[SoundManager] Failed to get settings:', e);
        return true; // エラー時はデフォルトで有効
    }
}

/**
 * キャッシュをクリア（設定変更時に呼び出す）
 */
export function clearSoundCache(): void {
    soundEnabledCache = null;
    lastCacheTime = 0;
}

/**
 * 効果音を再生
 * @param type サウンドタイプ
 * @param volume ボリューム (0.0 - 1.0)
 */
export async function playSound(type: SoundType, volume: number = 1.0): Promise<void> {
    try {
        const enabled = await isSoundEnabled();

        if (!enabled) {
            console.log('[SoundManager] Sound is disabled in settings');
            return;
        }

        const soundFile = SOUND_FILES[type];
        if (!soundFile) {
            console.warn('[SoundManager] Unknown sound type:', type);
            return;
        }

        const audio = new Audio(soundFile);
        audio.volume = Math.min(1.0, Math.max(0.0, volume));

        const playPromise = audio.play();
        if (playPromise !== undefined) {
            await playPromise;
        }
    } catch (e) {
        console.error('[SoundManager] Failed to play sound:', e);
    }
}

/**
 * 削除時の効果音（peel-off）
 */
export async function playDeleteSound(): Promise<void> {
    return playSound('peel-off', 1.0);
}
