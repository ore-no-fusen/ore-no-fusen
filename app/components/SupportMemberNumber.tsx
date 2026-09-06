'use client';

import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

type MemberView = { generalNumber: number | null };

export default function SupportMemberNumber({ language }: { language: string }) {
  const en = language === 'en';
  const [number, setNumber] = useState<number | null>(null);

  useEffect(() => {
    let stopped = false;
    void invoke<MemberView>('member_get')
      .then((member) => { if (!stopped) setNumber(member.generalNumber); })
      .catch(() => undefined);
    return () => { stopped = true; };
  }, []);

  if (number === null) return null;

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
      {en ? 'Member number' : '会員番号'}：<span className="font-semibold text-slate-900">{number}</span>
      <span className="ml-2 text-xs text-slate-500">
        {en ? 'Automatically included with your message' : '問い合わせに自動で付与されます'}
      </span>
    </div>
  );
}
