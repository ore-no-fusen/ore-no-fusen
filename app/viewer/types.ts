// app/viewer/types.ts
// page.tsx から抽出した型定義。'use client' は不要（型のみ）。

import type { TranslationKey } from '@/lib/i18n';

export type IphoneNote = {
  id: string;
  status: 'sent' | 'draft' | 'received_pc';
  title: string;
  body: string;
  created_at: string;
  sent_at?: string;
  tags?: string[];
};

export type PendingHydrate = {
  markdown: string;
  blobMap: Map<string, Blob>;
  draftId: string | null;
  tags: string[];
};

export type DraftRecord = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  images: { fileName: string; blob: Blob }[];
  tags?: string[];
  received_pc?: true;
  sent_at?: string;
  locked?: true;
};

export type CropModalProps = {
  file: File;
  onCancel: () => void;
  onCrop: (blob: Blob) => void;
};

export type MermaidModalProps = {
  onCancel: () => void;
  /** code: 入力コード, svg: プレビュー済みSVG（null = プレビューなし） */
  onInsert: (code: string, svg: string | null) => void;
};

export type NoteListStepProps = {
  notes: IphoneNote[];
  isLoading: boolean;
  thumbnailUrls: Map<string, string>;
  lockedNoteIds: string[];
  isLockPermissionPending: boolean;
  /** i18n 翻訳関数 */
  t: (key: TranslationKey) => string;
  onNew: () => void;
  onOpen: (note: IphoneNote) => void;
  onDelete: (note: IphoneNote) => void;
  onLockToggle: (e: React.MouseEvent, note: IphoneNote) => void;
};
