'use client';

import React, { useEffect, useRef, useState } from 'react';

/** A downloaded image belongs to this visible element, never to a disk cache. */
export function VisibleImage({ load, alt, display }: {
  load: (signal: AbortSignal) => Promise<string>;
  alt: string;
  display: 'block' | 'inline';
}) {
  const host = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  const [reservedHeight,setReservedHeight]=useState(32);
  useEffect(() => {
    if (!host.current) return;
    const hide=()=>setVisible(false);
    const show=()=>{const rect=host.current?.getBoundingClientRect();if(rect) setVisible(rect.bottom>0 && rect.top<window.innerHeight && rect.right>0 && rect.left<window.innerWidth);};
    window.addEventListener('pagehide',hide);window.addEventListener('pageshow',show);
    const detach=()=>{window.removeEventListener('pagehide',hide);window.removeEventListener('pageshow',show);};
    if (!('IntersectionObserver' in window)) { setVisible(true); return detach; }
    const observer = new IntersectionObserver(entries => {
      const entry=entries[0];
      if(entry && !entry.isIntersecting && entry.boundingClientRect?.height>32) setReservedHeight(entry.boundingClientRect.height);
      setVisible(entries.some(entry => entry.isIntersecting));
    });
    observer.observe(host.current);
    return () => {observer.disconnect();detach();};
  }, []);
  useEffect(() => {
    setUrl(''); setFailed(false);
    if (!visible) return;
    const abort = new AbortController();
    let owned = '';
    void load(abort.signal).then(result => {
      if (abort.signal.aborted) { URL.revokeObjectURL(result); return; }
      owned = result; setUrl(result);
    }).catch(() => { if (!abort.signal.aborted) setFailed(true); });
    const release=()=>{abort.abort();if(owned) {URL.revokeObjectURL(owned);owned='';}setUrl('');};
    window.addEventListener('pagehide',release);
    return () => {release();window.removeEventListener('pagehide',release);};
  }, [visible, load]);
  return <span ref={host} style={{ display, minHeight: reservedHeight }}>
    {url ? <img src={url} alt={alt} style={{ display, verticalAlign: 'middle', maxWidth: '100%', height: 'auto', borderRadius: 8, margin: '10px 0' }} />
      : <span role="status" style={{ color: failed ? '#a11' : '#6b7280' }}>{failed ? '画像を確認できませんでした。PCで同期後、更新してください。' : '画像を読み込み中…'}</span>}
  </span>;
}
