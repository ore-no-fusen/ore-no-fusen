import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ToolbarButtons from './ToolbarButtons';

afterEach(() => cleanup());

describe('ToolbarButtons cautious actions', () => {
    it('keeps a CSS hover fallback when JavaScript hover state is delayed', () => {
        const { container } = render(
            <ToolbarButtons
                isEditing={false}
                isMinimized={false}
                isPinned={false}
                show={false}
                onToggleMinimize={vi.fn()}
                onTogglePin={vi.fn()}
                onArchive={vi.fn()}
                onDelete={vi.fn()}
            />
        );

        expect(container.firstElementChild?.className).toContain('group-hover:opacity-100');
        expect(container.firstElementChild?.className).toContain('group-hover:pointer-events-auto');
    });

    it('places archive and delete in a spaced vertical group below the pin controls', () => {
        const onArchive = vi.fn();
        const onDelete = vi.fn();
        render(
            <ToolbarButtons
                isEditing={false}
                isMinimized={false}
                isPinned={false}
                show
                onToggleMinimize={vi.fn()}
                onTogglePin={vi.fn()}
                archiveLabel="アーカイブへしまう"
                onArchive={onArchive}
                deleteLabel="削除"
                onDelete={onDelete}
            />
        );

        const cautiousGroup = screen.getByTestId('sticky-caution-actions');
        const primaryGroup = screen.getByTestId('sticky-primary-actions');
        expect(primaryGroup.className).toContain('flex-row');
        expect(primaryGroup.className).not.toContain('flex-col');
        expect(cautiousGroup.className).toContain('mt-3');
        expect(cautiousGroup.className).toContain('flex-col');

        fireEvent.click(screen.getByRole('button', { name: 'アーカイブへしまう' }));
        fireEvent.click(screen.getByRole('button', { name: '削除' }));
        expect(onArchive).toHaveBeenCalledTimes(1);
        expect(onDelete).toHaveBeenCalledTimes(1);
    });

    it('hides cautious actions while the note is folded', () => {
        render(
            <ToolbarButtons
                isEditing={false}
                isMinimized
                show
                onToggleMinimize={vi.fn()}
                archiveLabel="アーカイブへしまう"
                onArchive={vi.fn()}
                onDelete={vi.fn()}
            />
        );

        expect(screen.queryByTestId('sticky-caution-actions')).toBeNull();
    });
});
