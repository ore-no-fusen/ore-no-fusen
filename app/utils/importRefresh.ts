export type ImportStats = {
    total_files: number;
    imported_md: number;
    imported_images: number;
    imported_paths: string[];
    skipped: number;
    errors: string[];
};

type EmitEvent = (event: string, payload?: unknown) => Promise<unknown>;

export async function refreshImportedNotes(
    stats: Pick<ImportStats, 'imported_paths'>,
    emitEvent: EmitEvent,
): Promise<void> {
    await emitEvent('fusen:notes_updated');
    await emitEvent('fusen:open_imported_notes', { paths: stats.imported_paths });
}
