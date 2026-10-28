'use client';

import { trackEvent } from '../utils/analytics';
import React, { useEffect, useState } from 'react';

export const SHARED_WEB_PUBLIC_URL = 'https://ore-no-fusen.vercel.app/shared';
// Stable develop alias; its /viewer callback is registered in Google OAuth.
export const SHARED_WEB_TEST_URL = 'https://ore-no-fusen-git-develop-uch54s-projects.vercel.app/shared';

export default function SharedWebQr({ isEnglish, webSyncBusy, onSync, onOpen }: {
    isEnglish: boolean;
    webSyncBusy: boolean;
    onSync: () => void;
    onOpen: () => void;
}) {
    const url = process.env.NODE_ENV === 'development' ? SHARED_WEB_TEST_URL : SHARED_WEB_PUBLIC_URL;
    const [expanded, setExpanded] = useState(false);
    const [image, setImage] = useState('');
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (!expanded) return;
        let cancelled = false;
        setFailed(false);
        void import('qrcode').then(({ default: QRCode }) => QRCode.toDataURL(url, {
            width: 240, margin: 4, errorCorrectionLevel: 'M',
        })).then((url) => { if (!cancelled) setImage(url); })
            .catch(() => { if (!cancelled) setFailed(true); });
        return () => { cancelled = true; };
    }, [expanded, url]);

    return <div className="ml-auto min-w-0 text-xs">
        <div className="flex items-center text-sky-200" role="group" aria-label={isEnglish ? 'Web connection' : 'Web連携'}>
            <button type="button" onClick={onSync} disabled={webSyncBusy} className="rounded border border-sky-900 px-2 py-1 hover:bg-zinc-800 disabled:opacity-50">{webSyncBusy ? (isEnglish ? 'Syncing…' : '同期中…') : (isEnglish ? '↻ Sync' : '↻ 同期')}</button>
            <span aria-hidden="true" className="px-2 text-zinc-500">→</span>
            <div className="flex items-center border-l border-zinc-600 pl-1">
                <button type="button" onClick={() => { trackEvent('feature_used', {feature_name:'web_guide_open'}); onOpen(); }} aria-label={isEnglish ? 'Open Web on this PC' : 'このPCでWebを開く'} className="rounded px-2 py-1 hover:bg-zinc-800">PC</button>
                <span aria-hidden="true" className="text-zinc-600">／</span>
                <button type="button" aria-label={isEnglish ? 'Open Web on phone (QR)' : 'スマホでWebを開く（QR）'} aria-expanded={expanded} onClick={() => { if (!expanded) trackEvent('feature_used', {feature_name:'web_guide_open'}); setExpanded(!expanded); }} className="rounded px-2 py-1 hover:bg-zinc-800">{isEnglish ? 'Phone' : 'スマホ'}</button>
            </div>
        </div>
        {expanded && <div className="mt-2 rounded border border-zinc-700 bg-zinc-900 p-3 text-zinc-100">
            <p>{isEnglish ? 'Scan with your iPhone or Android camera, then connect the same Google account.' : 'iPhone・Androidのカメラで読み取り、同じGoogleアカウントで接続してください。'}</p>
            {image && <img src={image} width={240} height={240} alt={isEnglish ? 'QR code for the public Web page' : '公開Webを開くQRコード'} className="my-2 max-w-full" />}
            {failed && <p role="alert">{isEnglish ? 'Could not generate QR. Use the URL below.' : 'QRを生成できませんでした。下のURLをお使いください。'}</p>}
            <p className="break-all select-text">{url}</p>
            {process.env.NODE_ENV === 'development' && <p className="mt-2 text-amber-200">{isEnglish ? 'Develop test page. Sign-in to Vercel may be required.' : 'developの実機確認用です。Vercelのログインを求められる場合があります。'}</p>}
        </div>}
    </div>;
}
