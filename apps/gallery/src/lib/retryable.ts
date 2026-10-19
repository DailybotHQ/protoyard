/**
 * Memoizes an async loader (a lazy `import()`), but forgets a failure so the
 * next call tries again. A cached rejection would disable the feature until a
 * full reload after one transient chunk error (offline, or a redeploy that
 * changed the chunk hashes).
 */
export function retryable<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => {
    pending ??= load().catch((error: unknown) => {
      pending = null;
      throw error;
    });
    return pending;
  };
}
