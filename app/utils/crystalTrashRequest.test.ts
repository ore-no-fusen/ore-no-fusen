import { describe, expect, it } from 'vitest';
import { shouldHandleCrystalTrashRequest } from './crystalTrashRequest';

describe('shouldHandleCrystalTrashRequest', () => {
  it('accepts only the matching crystal window', () => {
    expect(shouldHandleCrystalTrashRequest('C:/notes/recipe.md', 'c:\\notes\\recipe.md', ['recipe'])).toBe(true);
    expect(shouldHandleCrystalTrashRequest('C:/notes/recipe.md', 'C:/notes/other.md', ['recipe'])).toBe(false);
    expect(shouldHandleCrystalTrashRequest('C:/notes/recipe.md', 'C:/notes/recipe.md', ['work'])).toBe(false);
  });
});
