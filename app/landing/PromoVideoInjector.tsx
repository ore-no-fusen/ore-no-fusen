'use client';

import { useEffect } from 'react';

export default function PromoVideoInjector() {
    useEffect(() => {
        const id = 'ore-no-fusen-promo-video';
        if (document.getElementById(id)) return;

        const hero = document.querySelector('section');
        if (!hero) return;

        const screenshot = hero.querySelector<HTMLImageElement>('img[src="/screenshots/ScreenShot_OreNoFusen-lcp.jpg"]');
        const screenshotBlock = screenshot?.parentElement?.parentElement;
        if (!screenshotBlock || !screenshotBlock.parentElement) return;

        const wrapper = document.createElement('div');
        wrapper.id = id;
        wrapper.className = 'relative mt-12 max-w-3xl mx-auto';

        const tape = document.createElement('div');
        tape.className = 'absolute -top-3 left-1/2 -translate-x-1/2 z-10 w-16 h-5 rounded-sm opacity-70 rotate-1';
        tape.style.backgroundColor = '#F0E0A0';
        tape.style.border = '1px solid #D8C880';
        tape.setAttribute('aria-hidden', 'true');

        const frame = document.createElement('div');
        frame.className = 'relative rounded-sm overflow-hidden';
        frame.style.boxShadow = '4px 8px 28px rgba(0,0,0,0.18)';
        frame.style.border = '1px solid #C8B898';
        frame.style.background = '#111';

        const video = document.createElement('video');
        video.controls = true;
        video.playsInline = true;
        video.preload = 'metadata';
        video.className = 'w-full h-auto block';
        video.setAttribute('aria-label', '俺の付箋の操作デモ動画');

        const source = document.createElement('source');
        source.src = '/ore-no-fusen-cm.mp4';
        source.type = 'video/mp4';
        video.appendChild(source);

        frame.appendChild(video);
        wrapper.appendChild(tape);
        wrapper.appendChild(frame);

        screenshotBlock.parentElement.insertBefore(wrapper, screenshotBlock);

        return () => {
            wrapper.remove();
        };
    }, []);

    return null;
}
