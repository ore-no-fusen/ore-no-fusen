import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ConfirmDialog from './ConfirmDialog';

afterEach(cleanup);
it.each(['ja', 'en'] as const)('%s: 長文でも確認とキャンセルをそれぞれ操作できる', language => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const { rerender } = render(<ConfirmDialog isOpen title="Test" message={'Long error\n'.repeat(100)} language={language} onConfirm={onConfirm} onCancel={onCancel} />);
  fireEvent.click(screen.getByRole('button', { name: language === 'en' ? 'Cancel' : 'キャンセル' }));
  expect(onCancel).toHaveBeenCalledOnce();
  expect(onConfirm).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: language === 'en' ? 'Delete' : '削除する' }));
  expect(onConfirm).toHaveBeenCalledOnce();
  rerender(<ConfirmDialog isOpen={false} title="Test" message="" onConfirm={onConfirm} onCancel={onCancel} />);
  expect(screen.queryByRole('dialog')).toBeNull();
});
