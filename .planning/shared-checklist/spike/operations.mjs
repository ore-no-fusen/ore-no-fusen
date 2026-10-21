// Offline feasibility experiment only. Not connected to production or Drive.
export function resolveChecks(snapshot, operations) {
  const selected = new Map();
  const seen = new Map();
  for (const operation of operations) {
    if (operation.generation !== snapshot.generation) continue;
    if (!snapshot.items.includes(operation.itemId)) continue;
    if (!Number.isSafeInteger(operation.clock) || operation.clock < 1 ||
        typeof operation.checked !== 'boolean' || !operation.actor || !operation.id) {
      throw new Error('Invalid operation');
    }
    const encoded = JSON.stringify([operation.itemId, operation.actor, operation.clock, operation.checked]);
    if (seen.has(operation.id) && seen.get(operation.id) !== encoded) {
      throw new Error('Conflicting duplicate operation ID');
    }
    seen.set(operation.id, encoded);
    const previous = selected.get(operation.itemId);
    // Lamport counter, then stable actor ID, then operation ID. Never wall time.
    const key = [operation.clock, operation.actor, operation.id];
    const old = previous && [previous.clock, previous.actor, previous.id];
    if (!old || key[0] > old[0] || (key[0] === old[0] &&
        (key[1] > old[1] || (key[1] === old[1] && key[2] > old[2])))) {
      selected.set(operation.itemId, operation);
    }
  }
  return Object.fromEntries(snapshot.items.map(id => [id, selected.get(id)?.checked ?? snapshot.initial[id] ?? false]));
}

export function nextClock(ownClock, observed) {
  const max = Math.max(ownClock, ...observed.map(operation => operation.clock));
  if (!Number.isSafeInteger(max) || max >= Number.MAX_SAFE_INTEGER) throw new Error('Clock exhausted');
  return max + 1;
}
