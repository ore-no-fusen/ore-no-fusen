'use client';

import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

type Status = { lastCheckedAt: string | null; failed: boolean; intervalMinutes: number };

export default function AnnouncementDeliveryStatus({ isEnglish }: { isEnglish: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    let cancelled = false;
    let dispose: (() => void) | undefined;
    let updated = false;
    // Subscribe first so a check finishing during the initial read is not lost.
    void listen<Status>('fusen:announcement_status', event => {
      updated = true;
      if (!cancelled) setStatus(event.payload);
    }).then(async unlisten => {
      if (cancelled) { unlisten(); return; }
      dispose = unlisten;
      const current = await invoke<Status>('member_announcement_status');
      if (!cancelled && !updated) setStatus(current);
    }).catch(() => { /* A browser has no desktop membership status. */ });
    return () => { cancelled = true; dispose?.(); };
  }, []);
  if (!status) return null;
  const checked = status.lastCheckedAt ? new Date(status.lastCheckedAt) : null;
  const time = checked && !Number.isNaN(checked.getTime())
    ? checked.toLocaleString(isEnglish ? 'en-US' : 'ja-JP')
    : (isEnglish ? 'Not checked yet' : 'まだ確認していません');
  return <div role="status" className="space-y-1 text-sm text-slate-600">
    <p>{status.intervalMinutes === 5
      ? (isEnglish ? 'Letters are checked about every 5 minutes while the development app is running.' : '開発版のお便りは、起動中に約5分ごとに確認します。')
      : (isEnglish ? 'Letters are checked about every 3 hours while the app is running.' : 'お便りは、アプリの起動中に約3時間ごとに確認します。')}</p>
    <p>{isEnglish ? 'Last successful check: ' : '最後に確認できた日時：'}{time}</p>
    {status.failed && <p className="text-amber-700">{isEnglish
      ? 'The letter check failed. It will retry automatically in about 15 minutes (5 minutes in the development app).'
      : 'お便りの確認に失敗しました。約15分後に自動で再試行します（開発版は約5分後）。'}</p>}
  </div>;
}
