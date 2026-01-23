
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleCreateNoteFromTray, TrayActionContext } from './tray-actions';

describe('handleCreateNoteFromTray', () => {
    let mockCtx: TrayActionContext;

    beforeEach(() => {
        mockCtx = {
            getCurrentWindowLabel: vi.fn(),
            getBasePath: vi.fn(),
            createNote: vi.fn(),
            openWindow: vi.fn(),
            folderPath: undefined,
        };
    });

    it('should DO NOTHING if window label is NOT main', async () => {
        // Arrange
        vi.mocked(mockCtx.getCurrentWindowLabel).mockResolvedValue('note-12345'); // Not main

        // Act
        await handleCreateNoteFromTray(mockCtx);

        // Assert
        expect(mockCtx.getCurrentWindowLabel).toHaveBeenCalled();
        // Should NOT call createNote or openWindow
        expect(mockCtx.createNote).not.toHaveBeenCalled();
        expect(mockCtx.openWindow).not.toHaveBeenCalled();
    });

    it('should create note and open window if window label IS main', async () => {
        // Arrange
        vi.mocked(mockCtx.getCurrentWindowLabel).mockResolvedValue('main');
        mockCtx.folderPath = 'C:/MyNotes';
        vi.mocked(mockCtx.createNote).mockResolvedValue({ meta: { path: 'C:/MyNotes/NewNote.md' } });

        // Act
        await handleCreateNoteFromTray(mockCtx);

        // Assert
        expect(mockCtx.createNote).toHaveBeenCalledWith('C:/MyNotes', '新規メモ');
        expect(mockCtx.openWindow).toHaveBeenCalledWith('C:/MyNotes/NewNote.md', true);
    });

    it('should fetch base path if folderPath is missing', async () => {
        // Arrange
        vi.mocked(mockCtx.getCurrentWindowLabel).mockResolvedValue('main');
        mockCtx.folderPath = undefined;
        vi.mocked(mockCtx.getBasePath).mockResolvedValue('C:/Fallback');
        vi.mocked(mockCtx.createNote).mockResolvedValue({ meta: { path: 'C:/Fallback/NewNote.md' } });

        // Act
        await handleCreateNoteFromTray(mockCtx);

        // Assert
        expect(mockCtx.getBasePath).toHaveBeenCalled();
        expect(mockCtx.createNote).toHaveBeenCalledWith('C:/Fallback', '新規メモ');
    });

    it('should log error and return if no base path available', async () => {
        // Arrange
        vi.mocked(mockCtx.getCurrentWindowLabel).mockResolvedValue('main');
        mockCtx.folderPath = undefined;
        vi.mocked(mockCtx.getBasePath).mockResolvedValue(null);
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        // Act
        await handleCreateNoteFromTray(mockCtx);

        // Assert
        expect(mockCtx.createNote).not.toHaveBeenCalled();
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No folder path available'));
        consoleSpy.mockRestore();
    });
});
