import { pathsEqual } from './pathUtils';
import { normalizeTagForReservation } from './reservedTags';

export function shouldHandleCrystalTrashRequest(
  requestedPath: string,
  selectedPath: string | null | undefined,
  tags: string[],
): boolean {
  if (!selectedPath || !pathsEqual(requestedPath, selectedPath)) return false;
  return tags.some((tag) => {
    const normalized = normalizeTagForReservation(tag);
    return normalized === 'recipe' || normalized === 'qa' || normalized === 'term';
  });
}
