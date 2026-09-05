import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SupportMemberNumber from './SupportMemberNumber';

const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invokeMock(...args) }));

describe('SupportMemberNumber', () => {
  beforeEach(() => invokeMock.mockReset());

  it('shows the locally assigned number as automatically attached', async () => {
    invokeMock.mockResolvedValue({ generalNumber: 10001 });
    render(<SupportMemberNumber language="ja" />);

    await waitFor(() => expect(screen.getByText('10001')).toBeTruthy());
    expect(screen.getByText('問い合わせに自動で付与されます')).toBeTruthy();
    expect(invokeMock).toHaveBeenCalledWith('member_get');
  });

  it('does not show an identifier while registration is pending', async () => {
    invokeMock.mockResolvedValue({ generalNumber: null });
    const { container } = render(<SupportMemberNumber language="ja" />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    expect(container.childElementCount).toBe(0);
  });
});
