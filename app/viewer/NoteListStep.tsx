'use client';

import React from 'react';
import { formatRelativeTime } from './utils';
import type { NoteListStepProps } from './types';
import type { TranslationKey } from '@/lib/i18n';

// ---------------------------------------------------------------------------
// NoteListStep: メモ一覧画面（step === 'list'）
// ---------------------------------------------------------------------------

/**
 * 責務: ノート一覧画面を描画する（新規作成・開く・削除・ロック・通知表示）
 * 入力: NoteListStepProps
 * 出力: JSX.Element
 * 副作用: なし（コールバックは親から注入）
 */
export function NoteListStep({
  notes,
  isLoading,
  thumbnailUrls,
  lockedNoteIds,
  isLockPermissionPending,
  t,
  onNew,
  onOpen,
  onDelete,
  onLockToggle,
}: NoteListStepProps) {
  return (
    <div className="flex flex-col min-h-[100dvh] bg-[#F2F2F7]">
      {/* ヘッダー */}
      <div className="flex items-center px-5 pt-6 pb-2 bg-[#F2F2F7]">
        <span className="text-3xl font-bold text-gray-900 flex-1">メモ</span>
        <button
          className="w-11 h-11 flex items-center justify-center bg-blue-500 text-white rounded-full text-2xl font-light shadow-md active:scale-95 transition-transform"
          aria-label="新規作成"
          onClick={onNew}
        >
          ＋
        </button>
      </div>

      {/* コンテンツ */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <p className="text-center text-gray-400 py-8 text-sm">読み込み中...</p>
        ) : notes.length === 0 ? (
          <p className="text-center text-gray-400 py-8 text-sm">{t('pwa.emptyList')}</p>
        ) : (
          <ul className="flex flex-col gap-2 px-3 pb-3">
            {notes.map((note) => (
              <li
                key={note.id}
                className="cursor-pointer bg-white rounded-2xl shadow-sm active:bg-gray-50 flex items-stretch gap-0 overflow-hidden transition-colors"
                onClick={() => onOpen(note)}
              >
                <div className="flex-1 min-w-0 px-3 py-3">
                  <div className="flex items-start gap-2">
                    {thumbnailUrls.get(note.id) && (
                      <img
                        src={thumbnailUrls.get(note.id)}
                        alt=""
                        className="w-10 h-10 object-cover rounded flex-shrink-0"
                      />
                    )}
                    <p className="text-sm text-gray-700 line-clamp-3 whitespace-pre-wrap">
                      {(
                        ((note.title ? note.title + '\n' : '') + (note.body ?? ''))
                          .replace(/!\[.*?\]\(.*?\)/g, '')
                          .replace(/\n\n+/g, '\n')
                          .trim()
                          .slice(0, 120)
                      ) || '（空のメモ）'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end justify-between py-2 pr-2 flex-shrink-0">
                  <div className="flex flex-col items-end gap-0.5">
                    <span
                      className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                        note.status === 'sent'
                          ? 'bg-blue-100 text-blue-600'
                          : note.status === 'received_pc'
                          ? 'bg-indigo-50 text-indigo-500'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {note.status === 'sent'
                        ? t('pwa.statusSent')
                        : note.status === 'received_pc'
                        ? 'PC受信'
                        : t('pwa.statusDraft')}
                    </span>
                    <span className="text-xs text-gray-400">
                      {note.created_at
                        ? (() => { try { return formatRelativeTime(note.created_at); } catch { return ''; } })()
                        : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-0">
                    {/* ロックボタン */}
                    <button
                      className={`p-2 ${lockedNoteIds.includes(note.id) ? 'text-blue-500' : 'text-gray-400'} hover:text-blue-500`}
                      aria-label={lockedNoteIds.includes(note.id) ? 'ロック解除' : 'ロック画面に表示'}
                      disabled={isLockPermissionPending}
                      onClick={(e) => onLockToggle(e, note)}
                    >
                      🔔
                    </button>
                    {/* 削除ボタン */}
                    {(note.status === 'draft' || note.status === 'received_pc' || note.status === 'sent') && (
                      <button
                        className="p-2 text-gray-400 hover:text-red-500"
                        aria-label="削除"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(note);
                        }}
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
