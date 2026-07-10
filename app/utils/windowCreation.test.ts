import { describe, expect, it } from 'vitest';
import { isDuplicateWindowCreationRequest } from './windowCreation';

describe('windowCreation', () => {
  it('detects repeated requests for a label that is still being created', () => {
    const inProgress = new Set(['note-active']);

    expect(isDuplicateWindowCreationRequest('note-active', inProgress)).toBe(true);
    expect(isDuplicateWindowCreationRequest('note-other', inProgress)).toBe(false);
  });
});
