'use client';

import { getSoundPreset, isSoundEnabled } from './settingsManager';
import { playSoundPreview } from './soundManager';

export function playDefaultPinToggleSound(isPinned: boolean): void {
    try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContext) {
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const now = ctx.currentTime;

            osc.connect(gain);
            gain.connect(ctx.destination);

            if (!isPinned) {
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(120, now);
                osc.frequency.exponentialRampToValueAtTime(60, now + 0.08);

                gain.gain.setValueAtTime(0.6, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

                osc.start(now);
                osc.stop(now + 0.15);
            } else {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(400, now);
                osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);

                gain.gain.setValueAtTime(0.3, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

                osc.start(now);
                osc.stop(now + 0.1);
            }

            setTimeout(() => {
                ctx.close();
            }, 200);
        }
    } catch (e) {
        console.error('SFX Error:', e);
    }
}

export async function playPinToggleSound(isPinned: boolean): Promise<void> {
    try {
        if (!await isSoundEnabled()) return;
        const scene = isPinned ? 'unpin' : 'pin';
        const preset = await getSoundPreset(scene);
        if (preset === 'silent') return;
        if (preset !== 'standard') {
            await playSoundPreview(scene, preset);
            return;
        }
        playDefaultPinToggleSound(isPinned);
    } catch (e) {
        console.error('SFX Error:', e);
    }
}
