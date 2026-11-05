export function isDuplicateWindowCreationRequest(
  label: string,
  inProgressLabels: ReadonlySet<string>,
): boolean {
  return inProgressLabels.has(label);
}

/** Keep the queue moving while reporting each task's own result to its caller. */
export function enqueueObservedTask(queue: { queue: Array<() => Promise<void>>; processing: boolean }, task: () => Promise<void>, start: () => void): Promise<void> {
  return new Promise((resolve, reject) => {
    queue.queue.push(async () => {
      try { await task(); resolve(); } catch (error) { reject(error); }
    });
    if (!queue.processing) start();
  });
}
