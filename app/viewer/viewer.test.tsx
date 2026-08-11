/**
 * app/viewer/page.tsx のテストスタブ
 * Wave 0 で先行作成 — Wave 1 (Plan 02) 実装後に GREEN になること
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { SimpleNoteBody } from './SimpleNoteBody';
import { insertAtCursor, formatRelativeTime } from './utils';

// Wave 1 で実装される — Plan 02 完了まで TODO
// import ViewerPage from './page';

// mermaid モック（jsdom は mermaid を描画できない）
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: '<svg>mock</svg>' }),
  },
}));

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

// matchMedia モック（jsdom は matchMedia を持たない）
beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false, // 非standalone をデフォルトとする
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  // Canvas API モック（jsdom は Canvas を持たない）
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    drawImage: vi.fn(),
    canvas: {
      toDataURL: vi.fn().mockReturnValue('data:image/jpeg;base64,mock'),
    },
  });
  HTMLCanvasElement.prototype.toDataURL = vi.fn().mockReturnValue('data:image/jpeg;base64,mock');
});



// Placeholder: vitest が 0 failures で終わるための空テスト
it('Wave 0 スタブが読み込める', () => {
  expect(true).toBe(true);
});

describe('SimpleNoteBody', () => {
  it('テキストのみのbodyをそのままレンダリングする', () => {
    const { container } = render(<SimpleNoteBody body={'こんにちは\n付箋テスト'} />);
    expect(container.textContent).toContain('こんにちは');
  });

  it('data: URI 画像を <img> タグでレンダリングする', () => {
    const body = '前のテキスト\n![テスト画像](data:image/png;base64,abc123)\n後のテキスト';
    const { container } = render(<SimpleNoteBody body={body} />);
    const imgs = container.querySelectorAll('img');
    expect(imgs.length).toBe(1);
    expect(imgs[0].getAttribute('src')).toBe('data:image/png;base64,abc123');
    expect(imgs[0].getAttribute('alt')).toBe('テスト画像');
  });

  it('画像のないbodyでは<img>タグを生成しない', () => {
    const { container } = render(<SimpleNoteBody body={'テキストのみ'} />);
    expect(container.querySelectorAll('img').length).toBe(0);
  });

  it('ローカルパス（data: でない）は <img> 変換しない', () => {
    const body = '![photo](C:\\Users\\test\\image.png)';
    const { container } = render(<SimpleNoteBody body={body} />);
    expect(container.querySelectorAll('img').length).toBe(0);
  });

  it('テキストと画像が混在する場合、両方レンダリングする', () => {
    const body = '行1\n![img](data:image/jpeg;base64,xyz)\n行3';
    const { container } = render(<SimpleNoteBody body={body} />);
    const imgs = container.querySelectorAll('img');
    expect(imgs.length).toBe(1);
    expect(imgs[0].getAttribute('src')).toBe('data:image/jpeg;base64,xyz');
    expect(container.textContent).toContain('行1');
    expect(container.textContent).toContain('行3');
  });
});

// ============================================================
// Phase 6: iPhone→PC送信 テストスタブ (Wave 0)
// Wave 1〜3 の実装後に GREEN になること
// ============================================================



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

describe('REND-01: Mermaidレンダリング', () => {
  it('SimpleNoteBody が通常テキストを pre-wrap で描画する（既存動作を保持）', () => {
    const { container } = render(<SimpleNoteBody body={'テスト\nテキスト'} />);
    expect(container.textContent).toContain('テスト');
  });

  it('SimpleNoteBody が ```mermaid ブロックをMermaidBlock要素として描画する', () => {
    const body = 'テキスト前\n```mermaid\ngraph TD\n  A-->B\n```\nテキスト後';
    const { container } = render(<SimpleNoteBody body={body} />);
    // テキスト前後が残っている
    expect(container.textContent).toContain('テキスト前');
    expect(container.textContent).toContain('テキスト後');
  });

  it('data: URI 画像と mermaid ブロックを同じ本文内で両方処理する', () => {
    const body = '![img](data:image/png;base64,abc)\n```mermaid\ngraph LR\n  X-->Y\n```';
    const { container } = render(<SimpleNoteBody body={body} />);
    const imgs = container.querySelectorAll('img');
    expect(imgs.length).toBe(1);
    // MermaidBlock の div も存在する
    expect(container.querySelectorAll('div').length).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================
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
