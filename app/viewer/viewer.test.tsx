/**
 * app/viewer/page.tsx のテストスタブ
 * Wave 0 で先行作成 — Wave 1 (Plan 02) 実装後に GREEN になること
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { SimpleNoteBody } from './SimpleNoteBody';

// Wave 1 で実装される — Plan 02 完了まで TODO
// import ViewerPage from './page';

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
});

describe('ViewerPage — 非standalone 時はバナーをレンダリングする', () => {
  // display-mode: standalone の検出テスト
  it.todo('matchMedia display-mode: standalone が false の場合、ホーム画面追加バナーが表示される');
  it.todo('matchMedia display-mode: standalone が true の場合、バナーは表示されない');
  it.todo('standalone + ?code= パラメータなし の場合、Googleでログインボタンが表示される');
});

describe('ServiceWorker push handler', () => {
  it.todo('showNotification が push イベントで呼ばれる（worker.test.js で検証）');
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
