import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import IphoneReturnDialog from './IphoneReturnDialog';

const note = { id: 'return-1', title: '元', body: 'iPhoneで育てた本文', context: '元' };
const origin = {
  path: 'note.md', body: 'PCで追記した本文', bodyHash: 'hash', changedSinceSend: true,
};

describe('iPhone返送の確認画面', () => {
  afterEach(cleanup);
  it('PCとiPhoneの内容を並べ、PC側も変わったことを知らせて選択を受ける', () => {
    const onDecide = vi.fn();
    render(<IphoneReturnDialog note={note} origin={origin} busy={false} error={null}
      language="ja" onDecide={onDecide} />);
    expect(screen.getByText('PCで追記した本文')).toBeTruthy();
    expect(screen.getByText('iPhoneで育てた本文')).toBeTruthy();
    expect(screen.getByText(/送信後にPC側も変更/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '元の付箋に反映' }));
    expect(onDecide).toHaveBeenCalledWith('apply');
  });

  it('元の付箋がないときは反映を禁止し、新規保存と保留を選べる', () => {
    const onDecide = vi.fn();
    render(<IphoneReturnDialog note={note} origin={null} busy={false} error={null}
      language="ja" onDecide={onDecide} />);
    expect((screen.getByRole('button', { name: '元の付箋に反映' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '新しい付箋として開く' }));
    fireEvent.click(screen.getByRole('button', { name: 'あとで決める' }));
    expect(onDecide.mock.calls).toEqual([['new'], ['later']]);
  });
});
