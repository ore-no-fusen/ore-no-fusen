import React from 'react';

export type ReceivedAnnouncement = {
  id: string; title: string; body: string; createdAt: string;
};

export function announcementReplyDraft(announcement: ReceivedAnnouncement): string {
  return `お便り「${announcement.title}」（ID: ${announcement.id}）への返信:\n`;
}

function renderInline(text: string) {
  return text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) {
      try {
        const url = new URL(link[2]);
        if (url.protocol === 'https:' || url.protocol === 'http:') {
          return <a key={index} href={url.href} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{link[1]}</a>;
        }
      } catch { /* Unsupported links remain plain text. */ }
    }
    return part;
  });
}

type AnnouncementCardProps = {
  announcement: ReceivedAnnouncement;
  onReply: () => void;
  replying?: boolean;
  replyText?: string;
  onReplyTextChange?: (text: string) => void;
  onSend?: () => void;
  onCancel?: () => void;
  sending?: boolean;
  error?: boolean;
};

export default function AnnouncementCard({ announcement, onReply, replying = false, replyText = '', onReplyTextChange, onSend, onCancel, sending = false, error = false }: AnnouncementCardProps) {
  const date = new Date(announcement.createdAt);
  return (
    <article className="rounded-lg border border-blue-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900">
      <div className="mb-1 text-xs font-bold text-blue-700">開発者からのお便り</div>
      <h3 className="font-bold text-slate-900">{announcement.title}</h3>
      {!Number.isNaN(date.getTime()) && <time className="text-xs text-slate-500">{date.toLocaleDateString('ja-JP')}</time>}
      <div className="mt-2 whitespace-pre-wrap break-words text-slate-900">
        {announcement.body.split('\n').map((line, index) => <React.Fragment key={index}>{index > 0 && <br />}{renderInline(line)}</React.Fragment>)}
      </div>
      {replying ? (
        <div className="mt-4 space-y-2 border-t border-blue-100 pt-4">
          <label htmlFor={`announcement-reply-${announcement.id}`} className="block font-semibold text-blue-900">このお便りへの返信</label>
          <textarea
            id={`announcement-reply-${announcement.id}`}
            autoFocus
            value={replyText}
            onChange={(event) => onReplyTextChange?.(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); onSend?.(); } }}
            placeholder="返信を書いてください"
            className="w-full min-h-[100px] rounded-md border border-blue-200 bg-white p-3 text-slate-900"
          />
          {error && <p role="alert" className="text-red-700">送信できませんでした。もう一度お試しください。</p>}
          <div className="flex gap-2">
            <button type="button" onClick={onSend} disabled={sending || !replyText.trim()} className="rounded-md bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-50">{sending ? '送信中…' : '返信を送信'}</button>
            <button type="button" onClick={onCancel} disabled={sending} className="rounded-md border border-slate-300 px-4 py-2 text-slate-700">キャンセル</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={onReply} className="mt-3 rounded border border-blue-200 px-3 py-1 text-blue-700 hover:bg-blue-50">このお便りに返信</button>
      )}
    </article>
  );
}
