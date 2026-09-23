'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

/** お便り（開発者ホットライン）表示ページ。
 *  Tauriウィンドウで開かれ、クエリパラメータからお便り内容を受け取る。
 *  読み取り専用。AppState.notes には追加しない。 */

function AnnouncementContent() {
  const params = useSearchParams();
  const title = params.get('title') ?? 'お便り';
  const body = params.get('body') ?? '';
  const createdAt = params.get('createdAt') ?? '';

  // 簡易Markdown→HTML変換（太字、リンク、改行のみ対応）
  const renderBody = (text: string) => {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:#3b82f6;text-decoration:underline">$1</a>')
      .split('\n')
      .join('<br/>');
  };

  const formattedDate = createdAt
    ? new Date(createdAt).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  return (
    <div style={{
      fontFamily: "'Segoe UI', 'Yu Gothic UI', sans-serif",
      padding: '24px 28px',
      maxWidth: 520,
      margin: '0 auto',
      color: '#1a1a1a',
      lineHeight: 1.7,
      userSelect: 'text',
    }}>
      {/* ヘッダー */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 22 }}>✉️</span>
        <span style={{ fontSize: 11, color: '#888', letterSpacing: 1.5, textTransform: 'uppercase' as const }}>
          開発者ホットライン
        </span>
      </div>

      {/* タイトル */}
      <h1 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px 0', color: '#111' }}>
        {title}
      </h1>

      {/* 日付 */}
      {formattedDate && (
        <p style={{ fontSize: 12, color: '#999', margin: '0 0 20px 0' }}>
          {formattedDate}
        </p>
      )}

      {/* 本文 */}
      <div
        style={{ fontSize: 14, marginBottom: 28 }}
        dangerouslySetInnerHTML={{ __html: renderBody(body) }}
      />

      {/* 区切り線 */}
      <hr style={{ border: 'none', borderTop: '1px solid #e5e5e5', margin: '20px 0' }} />

      {/* 返信ボタン：設定画面のフィードバックタブを開く */}
      <button
        onClick={async () => {
          try {
            const { emit } = await import('@tauri-apps/api/event');
            await emit('fusen:open_settings', { tab: 'feedback' });
          } catch {
            // フォールバック: 何もしない
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 16px',
          fontSize: 13,
          color: '#3b82f6',
          background: '#f0f7ff',
          border: '1px solid #dbeafe',
          borderRadius: 6,
          cursor: 'pointer',
          transition: 'background 0.15s',
        }}
        onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.background = '#dbeafe'; }}
        onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.background = '#f0f7ff'; }}
      >
        ✉️ ヒロブに返信する
      </button>
    </div>
  );
}

export default function AnnouncementPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, color: '#888' }}>読み込み中...</div>}>
      <AnnouncementContent />
    </Suspense>
  );
}
