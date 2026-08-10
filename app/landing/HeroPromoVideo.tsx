'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export default function HeroPromoVideo() {
    const [mountNode, setMountNode] = useState<HTMLElement | null>(null);

    useEffect(() => {
        const id = 'hero-promo-video-slot';

        const placeVideo = () => {
            const existing = document.getElementById(id);
            if (existing) {
                setMountNode(existing);
                return true;
            }

            const hero = document.querySelector('section');
            if (!hero) return false;

            // Next/Image でも alt は実DOMに残る。src変換には依存しない。
            const screenshot = Array.from(hero.querySelectorAll('img')).find((img) => {
                const alt = img.getAttribute('alt') ?? '';
                return alt.includes('俺の付箋') || alt.includes('FUSEN sticky notes');
            });
            if (!screenshot) return false;

            // page.tsx の製品スクショ構造:
            // outer(relative mt-16) > frame(relative rounded...) > img
            const frame = screenshot.parentElement;
            const screenshotBlock = frame?.parentElement;
            const parent = screenshotBlock?.parentElement;
            if (!screenshotBlock || !parent) return false;

            const slot = document.createElement('div');
            slot.id = id;
            parent.insertBefore(slot, screenshotBlock);
            setMountNode(slot);
            return true;
        };

        if (placeVideo()) return;

        // layout は page より先に mount される場合があるので、
        // Hero のスクショがDOMに現れるまで監視する。
        const observer = new MutationObserver(() => {
            if (placeVideo()) observer.disconnect();
        });
        observer.observe(document.body, { childList: true, subtree: true });

        return () => observer.disconnect();
    }, []);

    if (!mountNode) return null;

    return createPortal(
        <div className="relative mt-16 max-w-3xl mx-auto">
            <div
                className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 w-16 h-5 rounded-sm opacity-70 -rotate-1"
                style={{ backgroundColor: '#F0E0A0', border: '1px solid #D8C880' }}
                aria-hidden="true"
            />
            <div
                className="relative rounded-sm overflow-hidden"
                style={{
                    boxShadow: '4px 6px 24px rgba(0,0,0,0.18)',
                    border: '1px solid #C8B898',
                    background: '#000',
                }}
            >
                <video
                    controls
                    playsInline
                    preload="metadata"
                    className="w-full h-auto block"
                    aria-label="俺の付箋の操作デモ動画"
                >
                    <source
                        src="/ore-no-fusen-cm.mp4"
                        type="video/mp4"
                    />
                </video>
            </div>
        </div>,
        mountNode
    );
}
