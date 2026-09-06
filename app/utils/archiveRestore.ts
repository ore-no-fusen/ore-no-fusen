import { pathsEqual } from './pathUtils';

export type ArchivedNoteSummary = {
  path: string;
  preview: string;
  backgroundColor?: string | null;
  previewImagePath?: string | null;
  locationKind: 'archive' | 'tag';
  locationName: string;
  archivedAt: string;
};

export type RestoreArchivedNotesResult = {
  restored: Array<{ sourcePath: string; restoredPath?: string | null; status: string; error?: string | null }>;
  conflicts: Array<{ sourcePath: string; status: string; error?: string | null }>;
  failed: Array<{ sourcePath: string; status: string; error?: string | null }>;
};

export type RestoredNoteWindowMeta = {
  path: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  always_on_top?: boolean;
  opacity?: number;
  background_color?: string;
};

export function restoredNoteWindowMeta(notes: RestoredNoteWindowMeta[], path: string): RestoredNoteWindowMeta | undefined {
  return notes.find(note => pathsEqual(note.path, path));
}

export function recentArchivedNotes(notes: ArchivedNoteSummary[], limit = 5): ArchivedNoteSummary[] {
  return [...notes].sort((a, b) => b.archivedAt.localeCompare(a.archivedAt) || a.path.localeCompare(b.path)).slice(0, limit);
}

export function archivedLocations(notes: ArchivedNoteSummary[]): Array<{ name: string; kind: 'archive' | 'tag'; count: number }> {
  const counts = new Map<string, { name: string; kind: 'archive' | 'tag'; count: number }>();
  for (const note of notes) {
    const key = `${note.locationKind}:${note.locationName}`;
    const current = counts.get(key);
    counts.set(key, current ? { ...current, count: current.count + 1 } : { name: note.locationName, kind: note.locationKind, count: 1 });
  }
  return [...counts.values()].sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, 'ja') : a.kind === 'archive' ? -1 : 1));
}

export function searchArchivedNotes(notes: ArchivedNoteSummary[], query: string): ArchivedNoteSummary[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return notes;
  return notes.filter(note => {
    const filename = note.path.split(/[\\/]/).pop() ?? '';
    return note.preview.toLocaleLowerCase().includes(normalized) || filename.toLocaleLowerCase().includes(normalized);
  });
}
