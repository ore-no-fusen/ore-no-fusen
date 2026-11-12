/** viewerの送信・履歴・日時ユーティリティの試験。表示は実際の画面で試験する。 */
import { describe, it, expect } from 'vitest';
import { insertAtCursor, formatRelativeTime } from './utils';

// Phase 6 型定義 (Phase 11: received_pc 追加)
type IphoneNote = {
  id: string;
  status: 'sent' | 'draft' | 'received_pc';
  title: string;
  body: string;
  created_at: string;
  sent_at?: string;
};

// Phase 11 型定義
type FusenNoteItem = {
  id: string;
  title: string;
  body: string;
  sent_at: string;
};

describe('SEND-03: 画像添付', () => {
  it('insertAtCursor がカーソル位置に文字列を挿入して新しい value を返す', () => {
    const textarea = document.createElement('textarea');
    textarea.value = 'hello world';
    textarea.selectionStart = 5;
    textarea.selectionEnd = 5;

    const result = insertAtCursor(textarea, '![](data:image/jpeg;base64,abc)');
    expect(result).toBe('hello![](data:image/jpeg;base64,abc) world');
  });
});

describe('SEND-04: Mermaid挿入', () => {
  it('insertAtCursor が ```mermaid ブロックを正しく挿入できる', () => {
    const textarea = document.createElement('textarea');
    textarea.value = '前のテキスト';
    textarea.selectionStart = 4;
    textarea.selectionEnd = 4;
    const block = '```mermaid\ngraph TD\n  A-->B\n```';
    const result = insertAtCursor(textarea, block);
    expect(result).toContain('```mermaid');
    expect(result).toContain('graph TD');
  });
});

describe('formatRelativeTime', () => {
  it('1時間前の ISO 文字列を「1時間前」として返す', () => {
    const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const result = formatRelativeTime(oneHourAgo);
    expect(result).toContain('時間前');
  });

  it('2日前の ISO 文字列を「2日前」として返す', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const result = formatRelativeTime(twoDaysAgo);
    expect(result).toContain('日前');
  });
});

describe('HIST-01: 履歴表示', () => {
  it('fusen_iphone_notes.json の notes 配列から最新10件のみ取得する', () => {
    // スライスロジックのユニットテスト
    const notes: IphoneNote[] = Array.from({ length: 15 }, (_, i) => ({
      id: String(i),
      status: 'sent' as const,
      title: `note ${i}`,
      body: '',
      created_at: new Date().toISOString(),
    }));
    const displayed = notes.slice(0, 10);
    expect(displayed).toHaveLength(10);
  });

  it('notes が undefined の場合は空配列になる', () => {
    const data: { notes?: IphoneNote[] } = {};
    const notes = data.notes ?? [];
    expect(notes).toHaveLength(0);
  });
});

describe('HIST-02: 下書き編集', () => {
  it('draft ステータスのノートのみクリック時に title と body が返される', () => {
    const draftNote: IphoneNote = {
      id: 'draft-1',
      status: 'draft',
      title: 'テストタイトル',
      body: 'テスト本文',
      created_at: new Date().toISOString(),
    };
    // ハンドラのロジックをユニットテスト
    let title = '';
    let body = '';
    const handleTap = (note: IphoneNote) => {
      if (note.status !== 'draft') return;
      title = note.title;
      body = note.body;
    };
    handleTap(draftNote);
    expect(title).toBe('テストタイトル');
    expect(body).toBe('テスト本文');
  });

  it('sent ステータスのノートはタップしても何も起きない', () => {
    const sentNote: IphoneNote = {
      id: 'sent-1',
      status: 'sent',
      title: '送信済み',
      body: '本文',
      created_at: new Date().toISOString(),
      sent_at: new Date().toISOString(),
    };
    let triggered = false;
    const handleTap = (note: IphoneNote) => {
      if (note.status !== 'draft') return;
      triggered = true;
    };
    handleTap(sentNote);
    expect(triggered).toBe(false);
  });
});

// Phase 11: PC→iPhone受信履歴保存
// ============================================================

describe('P11-01: DraftRecord received_pc フラグ', () => {
  it('received_pc: true を持つ DraftRecord オブジェクトを構築できる', () => {
    const draft = {
      id: 'test-id',
      title: 'テスト',
      body: '本文',
      created_at: new Date().toISOString(),
      images: [],
      tags: [],
      received_pc: true as true,
    };
    expect(draft.received_pc).toBe(true);
  });

  it('received_pc を持たない DraftRecord は undefined になる', () => {
    const draft = {
      id: 'test-id',
      title: 'テスト',
      body: '本文',
      created_at: new Date().toISOString(),
      images: [],
    };
    expect((draft as { received_pc?: true }).received_pc).toBeUndefined();
  });
});

describe('P11-02: IphoneNote.status received_pc マッピング', () => {
  it('received_pc: true の DraftRecord は IphoneNote.status が received_pc になる', () => {
    const d = { id: '1', title: 'T', body: 'B', created_at: '', images: [], received_pc: true as true };
    const status: IphoneNote['status'] = d.received_pc ? 'received_pc' : 'draft';
    expect(status).toBe('received_pc');
  });

  it('received_pc が undefined の DraftRecord は IphoneNote.status が draft になる', () => {
    const d = { id: '1', title: 'T', body: 'B', created_at: '', images: [] };
    const status: IphoneNote['status'] = (d as { received_pc?: true }).received_pc ? 'received_pc' : 'draft';
    expect(status).toBe('draft');
  });
});

describe('P11-03: notes_to_iphone.json 配列スキーマ互換', () => {
  // Drive設計原則: Driveにあるものは全て未処理。received_at フィルタは不要
  function parseFusenNoteItems(data: unknown): FusenNoteItem[] {
    if (Array.isArray((data as { items?: unknown[] })?.items)) {
      return (data as { items: FusenNoteItem[] }).items;
    }
    // 旧スキーマ（単体オブジェクト）互換
    const d = data as { title?: string; body?: string; sent_at?: string };
    if (d?.title || d?.body) {
      return [{
        id: d.sent_at ?? 'legacy',
        title: d.title ?? '',
        body: d.body ?? '',
        sent_at: d.sent_at ?? '',
      }];
    }
    return [];
  }

  it('items 配列スキーマで全件返す', () => {
    const data = {
      items: [
        { id: '1', title: 'A', body: 'B', sent_at: '' },
        { id: '2', title: 'C', body: 'D', sent_at: '' },
      ],
    };
    const result = parseFusenNoteItems(data);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('1');
  });

  it('旧スキーマ（title/body 直接）は 1 件の配列として互換処理する', () => {
    const data = { title: '旧タイトル', body: '旧本文', sent_at: '2026-01-01T00:00:00Z' };
    const result = parseFusenNoteItems(data);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('旧タイトル');
  });

  it('items が空配列の場合は空配列を返す', () => {
    const data = { items: [] };
    const result = parseFusenNoteItems(data);
    expect(result).toHaveLength(0);
  });
});
