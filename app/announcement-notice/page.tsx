'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function Notice() {
  const params = useSearchParams();
  const title = params.get('title') || '新しいお便り';
  const count = Number(params.get('count'));
  const multiple = Number.isSafeInteger(count) && count > 1;

  const openConversation = async () => {
    const { emit } = await import('@tauri-apps/api/event');
    await emit('fusen:open_settings', { tab: 'conversation' });
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().close();
  };

  return (
    <main style={{ minHeight: '100vh', boxSizing: 'border-box', padding: 24, background: '#fff', color: '#111827', fontFamily: 'Segoe UI, Yu Gothic UI, sans-serif' }}>
      <div style={{ color: '#1d4ed8', fontWeight: 700, fontSize: 15 }}>✉️ 開発者からのお便りが届きました</div>
      <h1 style={{ margin: '18px 0 8px', fontSize: 20, overflowWrap: 'anywhere' }}>{title}</h1>
      {multiple && <p style={{ margin: '0 0 12px', color: '#475569' }}>新しいお便りが{count}件あります。</p>}
      <button type="button" onClick={() => void openConversation()} style={{ marginTop: 12, padding: '10px 16px', border: 0, borderRadius: 8, background: '#1d4ed8', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
        お便りを読む・返信する
      </button>
    </main>
  );
}

export default function AnnouncementNoticePage() {
  return <Suspense fallback={null}><Notice /></Suspense>;
}
