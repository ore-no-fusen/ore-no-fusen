// app/viewer/types.ts
// page.tsx から抽出した型定義。'use client' は不要（型のみ）。

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
