export function isDuplicateWindowCreationRequest(
  label: string,
  inProgressLabels: ReadonlySet<string>,
): boolean {
  return inProgressLabels.has(label);
}
