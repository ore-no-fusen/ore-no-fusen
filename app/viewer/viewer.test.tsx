/**
 * app/viewer/page.tsx のテストスタブ
 * Wave 0 で先行作成 — Wave 1 (Plan 02) 実装後に GREEN になること
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

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
