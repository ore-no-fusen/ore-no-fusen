/**
 * SoundManager - 効果音管理ユーティリティ
 * 設定に基づいて効果音の再生を制御します
 */

import { invoke } from '@tauri-apps/api/core';
import { isSoundEnabled } from './settingsManager';

// 利用可能なサウンド
export type SoundType = 'peel-off' | 'pop';

// サウンドファイルのマッピング
const SOUND_FILES: Record<SoundType, string> = {
    'peel-off': '/sounds/peel-off.mp3',
    'pop': '/sounds/pop.mp3', // 将来用
};

/**
 * 実際に音を再生する（ローカル再生用）
 * page.tsx など、常駐するプロセスから呼ばれることを想定
 */
export async function playLocalSound(type: SoundType, volume: number = 1.0): Promise<void> {
    try {
        // [Fix] settingsManagerに委譲（ここで最新の設定が取れる）
        const enabled = await isSoundEnabled();

        if (!enabled) {
            // console.log('[SoundManager] Sound is disabled in settings');
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
 * 効果音を再生（Rustバックエンドに依頼）
 * @param type サウンドタイプ
 * @param volume ボリューム (0.0 - 1.0) - Rust側では現在無視されますが、API互換性のために残します
 */
export async function playSound(type: SoundType, volume: number = 1.0): Promise<void> {
    try {
        const enabled = await isSoundEnabled();
        if (!enabled) return;

        // Rustコマンドを呼び出す
        // Rust側で非同期に再生されるため、awaitしてもブロックはしません
        await invoke('fusen_play_sound', { name: type });
    } catch (e) {
        console.error('[SoundManager] Failed to invoke fusen_play_sound:', e);
        // フォールバック：Rustコマンドが失敗した場合（Web環境など）はローカルで鳴らす
        await playLocalSound(type, volume);
    }
}

/**
 * 削除時の効果音（peel-off）
 */
export async function playDeleteSound(): Promise<void> {
    return playSound('peel-off', 0.3);
}
