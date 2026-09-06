import { describe, expect, it } from 'vitest';
import { archivedLocations, recentArchivedNotes, restoredNoteWindowMeta, searchArchivedNotes, type ArchivedNoteSummary } from './archiveRestore';

const note = (path: string, locationName: string, archivedAt: string, preview = path): ArchivedNoteSummary => ({
  path, preview, archivedAt, locationName,
  locationKind: locationName === 'Archive' ? 'archive' : 'tag',
});

describe('archiveRestore', () => {
  it('returns only the five newest notes', () => {
    const notes = Array.from({ length: 7 }, (_, index) => note(`${index}.md`, 'Archive', `2026-09-0${index + 1}T00:00:00Z`));
    expect(recentArchivedNotes(notes).map(item => item.path)).toEqual(['6.md', '5.md', '4.md', '3.md', '2.md']);
  });

  it('counts Archive and tag locations', () => {
    const notes = [note('a.md', 'Archive', '1'), note('b.md', '仕事', '2'), note('c.md', '仕事', '3')];
    expect(archivedLocations(notes)).toEqual([
      { name: 'Archive', kind: 'archive', count: 1 },
      { name: '仕事', kind: 'tag', count: 2 },
    ]);
  });

  it('searches the three-line preview and filename', () => {
    const notes = [note('買い物.md', 'Archive', '1', '牛乳を買う'), note('work.md', '仕事', '2', '会議メモ')];
    expect(searchArchivedNotes(notes, '牛乳')).toHaveLength(1);
    expect(searchArchivedNotes(notes, 'work')).toHaveLength(1);
  });

  it('finds restored window metadata across Windows path separator and case differences', () => {
    const meta = { path: 'C:\\Notes\\restored.md', x: 321, y: 123, width: 500, height: 260 };
    expect(restoredNoteWindowMeta([meta], 'c:/notes/restored.md')).toEqual(meta);
  });
});
