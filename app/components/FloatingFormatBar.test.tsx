import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import FloatingFormatBar from './FloatingFormatBar';

afterEach(() => cleanup());

function setup(props: Partial<React.ComponentProps<typeof FloatingFormatBar>> = {}) {
  const handlers = {
    onBold: vi.fn(),
    onHeading: vi.fn(),
    onList: vi.fn(),
    onCheckbox: vi.fn(),
  };
  const utils = render(<FloatingFormatBar top={120} left={48} {...handlers} {...props} />);
  const bar = utils.container.firstElementChild as HTMLElement;
  return { ...utils, handlers, bar };
}

describe('FloatingFormatBar', () => {
  it('太字・見出し・箇条書き・チェックの4ボタンが表示される', () => {
    setup();
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(4);
    expect(buttons.map((b) => b.textContent)).toEqual(['B', 'H1', '≡', '☑']);
    expect(screen.getByRole('button', { name: '太字' })).toBeTruthy();
  });

  it('英語では太字ボタンのラベルが Bold になる', () => {
    setup({ language: 'en' });
    expect(screen.getByRole('button', { name: 'Bold' })).toBeTruthy();
  });

  it('指定した座標に表示され、flip の有無で表示方向が変わる', () => {
    const { bar, rerender, handlers } = setup();
    expect(bar.style.top).toBe('120px');
    expect(bar.style.left).toBe('48px');
    // 通常は選択範囲の上に表示（バー自身の高さ分だけ上へずらす）
    expect(bar.style.transform).toBe('translateY(-100%) translateY(-4px)');

    rerender(<FloatingFormatBar top={120} left={48} flip {...handlers} />);
    const flipped = document.querySelector('.floatBar') as HTMLElement;
    // flip 時は選択範囲の下に表示
    expect(flipped.style.transform).toBe('translateY(4px)');
  });

  it('太字ボタンを押すと onBold だけが呼ばれる', () => {
    const { handlers } = setup();
    fireEvent.click(screen.getByRole('button', { name: '太字' }));
    expect(handlers.onBold).toHaveBeenCalledOnce();
    expect(handlers.onHeading).not.toHaveBeenCalled();
    expect(handlers.onList).not.toHaveBeenCalled();
    expect(handlers.onCheckbox).not.toHaveBeenCalled();
  });

  it('見出しボタンを押すと onHeading だけが呼ばれる', () => {
    const { handlers } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'H1' }));
    expect(handlers.onHeading).toHaveBeenCalledOnce();
    expect(handlers.onBold).not.toHaveBeenCalled();
    expect(handlers.onList).not.toHaveBeenCalled();
    expect(handlers.onCheckbox).not.toHaveBeenCalled();
  });

  it('箇条書きボタンを押すと onList だけが呼ばれる', () => {
    const { handlers } = setup();
    fireEvent.click(screen.getByRole('button', { name: '≡' }));
    expect(handlers.onList).toHaveBeenCalledOnce();
    expect(handlers.onBold).not.toHaveBeenCalled();
    expect(handlers.onHeading).not.toHaveBeenCalled();
    expect(handlers.onCheckbox).not.toHaveBeenCalled();
  });

  it('チェックボタンを押すと onCheckbox だけが呼ばれる', () => {
    const { handlers } = setup();
    fireEvent.click(screen.getByRole('button', { name: '☑' }));
    expect(handlers.onCheckbox).toHaveBeenCalledOnce();
    expect(handlers.onBold).not.toHaveBeenCalled();
    expect(handlers.onHeading).not.toHaveBeenCalled();
    expect(handlers.onList).not.toHaveBeenCalled();
  });

  it('バー上での pointerdown は既定動作が抑止され、エディタの選択が外れない', () => {
    const { bar } = setup();
    // StickyNote では isEditing 中のテキスト選択を保持したまま書式を適用するため、
    // バー側で pointerdown の既定動作（フォーカス移動）を止める契約になっている
    expect(fireEvent.pointerDown(bar)).toBe(false);
  });
});
