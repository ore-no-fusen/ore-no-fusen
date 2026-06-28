/**
 * 効果音管理ユーティリティ (SoundManager)
 *
 * 責務:
 * - 操作音（作成、保存、削除）の再生
 * - 設定に基づいたミュート制御
 * - ローカル再生とRustバックエンド再生の抽象化
 */

import { invoke } from '@tauri-apps/api/core';
import { isSoundEnabled } from './settingsManager';

// 利用可能なサウンド
export type SoundType = 'create' | 'save' | 'delete';

// サウンドファイルのマッピング
const SOUND_FILES: Record<SoundType, string> = {
    'create': '/sounds/create.wav',
    'save': '/sounds/save.wav',
    'delete': '/sounds/delete.wav',
};

const CHECK_COMPLETED_COUNT_KEY = 'ore-no-fusen.checkbox.completed_count';
const CHECK_MILESTONE_INTERVAL = 100;

function incrementCheckboxCompletedCount(): number {
    if (typeof window === 'undefined') return 1;

    try {
        const current = Number.parseInt(localStorage.getItem(CHECK_COMPLETED_COUNT_KEY) ?? '0', 10);
        const next = (Number.isFinite(current) ? current : 0) + 1;
        localStorage.setItem(CHECK_COMPLETED_COUNT_KEY, String(next));
        return next;
    } catch {
        return 1;
    }
}

async function playCheckboxMilestoneSound(): Promise<void> {
    const enabled = await isSoundEnabled();
    if (!enabled || typeof window === 'undefined') return;

    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) {
        await playLocalSound('create', 0.45);
        return;
    }

    try {
        const context = new AudioContextClass();
        const masterGain = context.createGain();
        masterGain.gain.setValueAtTime(0.22, context.currentTime);
        masterGain.connect(context.destination);

        const notes = [
            { frequency: 523.25, duration: 0.08 },
            { frequency: 659.25, duration: 0.08 },
            { frequency: 783.99, duration: 0.08 },
            { frequency: 1046.5, duration: 0.16 },
        ];

        let startTime = context.currentTime;
        for (const note of notes) {
            const oscillator = context.createOscillator();
            const overtone = context.createOscillator();
            const noteGain = context.createGain();
            const endTime = startTime + note.duration;

            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(note.frequency, startTime);
            overtone.type = 'triangle';
            overtone.frequency.setValueAtTime(note.frequency * 2, startTime);

            noteGain.gain.setValueAtTime(0.0001, startTime);
            noteGain.gain.exponentialRampToValueAtTime(1.0, startTime + 0.01);
            noteGain.gain.exponentialRampToValueAtTime(0.0001, endTime);

            oscillator.connect(noteGain);
            overtone.connect(noteGain);
            noteGain.connect(masterGain);

            oscillator.start(startTime);
            overtone.start(startTime);
            oscillator.stop(endTime);
            overtone.stop(endTime);

            startTime = endTime;
        }

        setTimeout(() => {
            context.close().catch(() => { });
        }, Math.ceil((startTime - context.currentTime + 0.05) * 1000));
    } catch (e) {
        console.error('[SoundManager] Failed to play checkbox milestone sound:', e);
        await playLocalSound('create', 0.45);
    }
}

async function playCheckboxCompletionSound(): Promise<void> {
    const enabled = await isSoundEnabled();
    if (!enabled || typeof window === 'undefined') return;

    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) {
        await playLocalSound('save', 0.35);
        return;
    }

    try {
        const context = new AudioContextClass();
        const masterGain = context.createGain();
        masterGain.gain.setValueAtTime(0.18, context.currentTime);
        masterGain.connect(context.destination);

        const startTime = context.currentTime;
        const duration = 0.165;
        const notes = [
            { frequency: 659, gain: 0.34, delay: 0 },
            { frequency: 988, gain: 0.22, delay: 0 },
            { frequency: 1318, gain: 0.15, delay: 0 },
            { frequency: 1568, gain: 0.16, delay: 0.035 },
        ];

        for (const note of notes) {
            const oscillator = context.createOscillator();
            const overtone = context.createOscillator();
            const noteGain = context.createGain();
            const noteStart = startTime + note.delay;
            const noteEnd = startTime + duration;

            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(note.frequency, noteStart);
            overtone.type = 'sine';
            overtone.frequency.setValueAtTime(note.frequency * 2, noteStart);

            noteGain.gain.setValueAtTime(0.0001, noteStart);
            noteGain.gain.exponentialRampToValueAtTime(note.gain, noteStart + 0.007);
            noteGain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

            oscillator.connect(noteGain);
            overtone.connect(noteGain);
            noteGain.connect(masterGain);

            oscillator.start(noteStart);
            overtone.start(noteStart);
            oscillator.stop(noteEnd);
            overtone.stop(noteEnd);
        }

        setTimeout(() => {
            context.close().catch(() => { });
        }, Math.ceil((duration + 0.05) * 1000));
    } catch (e) {
        console.error('[SoundManager] Failed to play checkbox completion sound:', e);
        await playLocalSound('save', 0.35);
    }
}

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
async function playSound(type: SoundType, volume: number = 1.0): Promise<void> {
    try {
        const enabled = await isSoundEnabled();
        if (!enabled) return;

        // Rustコマンドを呼び出す
        // Rust側で非同期に再生されるため、awaitしてもブロックはしません
        await invoke('fusen_play_sound', { name: type, volume: volume });
    } catch (e) {
        console.error('[SoundManager] Failed to invoke fusen_play_sound:', e);
        // フォールバック：Rustコマンドが失敗した場合（Web環境など）はローカルで鳴らす
        await playLocalSound(type, volume);
    }
}

/**
 * 新規作成時の効果音
 */
export async function playCreateSound(): Promise<void> {
    return playSound('create', 0.5);
}

/**
 * 保存/アーカイブ時の効果音
 */
export async function playSaveSound(): Promise<void> {
    return playSound('save', 0.4);
}

/**
 * 削除時の効果音
 */
export async function playDeleteSound(): Promise<void> {
    return playSound('delete', 0.3);
}

/**
 * チェックボックス完了時の効果音
 */
export async function playCheckboxSound(): Promise<void> {
    const completedCount = incrementCheckboxCompletedCount();
    if (completedCount % CHECK_MILESTONE_INTERVAL === 0) {
        return playCheckboxMilestoneSound();
    }

    return playCheckboxCompletionSound();
}
