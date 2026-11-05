/** A deadline covers both headers and the response body. Never retries writes.
 * @param {RequestInfo | URL} input
 * @param {RequestInit} [init]
 * @param {number} [timeoutMs]
 */
export function fetchWithDeadline(input, init = {}, timeoutMs = 10_000) {
  const deadline = AbortSignal.timeout(timeoutMs);
  const signal = init.signal ? AbortSignal.any([init.signal, deadline]) : deadline;
  return fetch(input, { ...init, signal });
}
