import type { MockApi } from './api.ts';

export interface InstalledFetch {
  /** Puts the original `fetch` back (only if nothing replaced ours since). */
  restore(): void;
}

/**
 * Routes `fetch()` calls under the API's base URL to the mock and passes every
 * other request to the original `fetch` untouched. For code that calls
 * `fetch('/api/...')` directly (generated clients, copied snippets).
 */
export function installGlobalFetch(
  api: MockApi,
  target: { fetch: typeof fetch } = globalThis
): InstalledFetch {
  const original = target.fetch;
  const intercept: typeof fetch = (input, init) => {
    let ours = false;
    try {
      ours = api.matches(input);
    } catch {
      // Unparseable URLs are the original fetch's problem.
    }
    return ours ? api.fetch(input, init) : original.call(target, input, init);
  };
  target.fetch = intercept;
  return {
    restore() {
      if (target.fetch === intercept) target.fetch = original;
    },
  };
}
