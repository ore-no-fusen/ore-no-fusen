// app/viewer/types.ts
// page.tsx から抽出した型定義。'use client' は不要（型のみ）。

import type { Language, TranslationKey } from '@/lib/i18n';

export type IphoneNote = {
  id: string;
  status: 'sent' | 'draft' | 'received_pc';
  type?: 'note' | 'video';
  title: string;
  body: string;
  created_at: string;
  sent_at?: string;
  tags?: string[];
  videoFileName?: string;
  originalFileName?: string;
  videos?: VideoAttachment[];
  memo?: string;
};

export type VideoAttachment = {
  videoFileName: string;
  originalFileName: string;
};

export type VideoBlobEntry = {
  blob: Blob;
  originalName: string;
};

export type VideoBlobMap = Map<string, VideoBlobEntry>;

export type PcDevice = {
  pcId: string;
  pcName: string;
  registeredAt?: string;
  updatedAt?: string;
  googleAccountEmail?: string | null;
};

export type PendingHydrate = {
  markdown: string;
  blobMap: Map<string, Blob>;
  draftId: string | null;
  tags: string[];
  videoMeta?: PendingVideoMeta | null;
  videoMetas?: PendingVideoMeta[];
  videoBlobMap?: VideoBlobMap;
};

export type PendingVideoMeta = {
  fileName: string;
  name: string;
  size: number;
  type: string;
};

export type DraftRecord = {
  id: string;
  type?: 'note' | 'video';
  title: string;
  body: string;
  created_at: string;
  images: { fileName: string; blob: Blob }[];
  tags?: string[];
  received_pc?: true;
  sent_at?: string;
  locked?: boolean;
  videoFileName?: string;
  originalFileName?: string;
  videos?: { fileName: string; originalName: string; blob?: Blob }[];
  memo?: string;
};

export type CropModalProps = {
    file: File;
    t: (key: TranslationKey) => string;
    onCancel: () => void;
  onCrop: (blob: Blob) => void;
};

export type MermaidModalProps = {
    t: (key: TranslationKey) => string;
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
  language: Language;
  swVersion: string | null;
  runtimeOrigin: string;
  runtimeKind: string;
  onNew: () => void;
  onOpen: (note: IphoneNote) => void;
  onDelete: (note: IphoneNote) => void;
  onLockToggle: (e: React.MouseEvent, note: IphoneNote) => void;
  onReRegisterPush: () => void;
  onLanguageChange: (language: Language) => void;
};
