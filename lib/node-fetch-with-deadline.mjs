import { AsyncLocalStorage } from 'node:async_hooks';
import { fetchWithDeadline as boundedFetch } from './fetch-with-deadline.mjs';
const budget = new AsyncLocalStorage();
export function networkTimeRemaining() { return Math.max(0, (budget.getStore() ?? (Date.now()+10_000))-Date.now()); }
/** @template T @param {number} milliseconds @param {() => Promise<T>} action @returns {Promise<T>} */
export function withNetworkBudget(milliseconds, action) { return budget.run(Date.now()+milliseconds,action); }
/** @param {RequestInfo | URL} input @param {RequestInit} [init] @param {number} [milliseconds] */
export function fetchWithDeadline(input, init = {}, milliseconds = 10_000) {
  return boundedFetch(input,init,Math.max(1,Math.min(milliseconds,networkTimeRemaining())));
}
