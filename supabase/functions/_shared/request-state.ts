// Per-request state shared by every agent step in one HTTP call (Deno supports AsyncLocalStorage).
// `degraded` flips when an LLM call gives up and a deterministic fallback answers instead.
import { AsyncLocalStorage } from 'node:async_hooks';

type State = { degraded: boolean };
const als = new AsyncLocalStorage<State>();

export const runRequest = <T>(fn: () => T): T => als.run({ degraded: false }, fn);
export const isDegraded = () => als.getStore()?.degraded ?? false;
export function markDegraded() {
  const s = als.getStore();
  if (s) s.degraded = true;
}
