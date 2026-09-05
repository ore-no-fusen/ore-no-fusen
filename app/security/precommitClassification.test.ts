import { describe, expect, it } from 'vitest';
import { classifyChangedFiles } from '../../scripts/precommit-classify.mjs';

describe('pre-commit staged-file classification', () => {
  it('skips checks when every staged file is documentation', () => {
    expect(classifyChangedFiles([
      '.planning/ai-collab/CURRENT.md',
      'docs/010_RELEASE.md',
      'docs-v2/002_PC.md',
      'README.md',
    ])).toBe('skip');
  });

  it('runs checks when application or test code is staged with documentation', () => {
    expect(classifyChangedFiles([
      'docs-v2/002_PC.md',
      'app/components/RichTextEditor.tsx',
      'e2e/sticky-note.spec.ts',
    ])).toBe('run');
  });

  it('runs checks for the hook itself and for an empty staged set', () => {
    expect(classifyChangedFiles(['.husky/pre-commit'])).toBe('run');
    expect(classifyChangedFiles([])).toBe('run');
  });
});
