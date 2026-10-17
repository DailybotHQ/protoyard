import { CODES, HttpError, MockResponse } from './response.ts';

/**
 * Maps whatever a handler (or the simulated environment) throws to real HTTP
 * semantics. Names are checked as well as classes: a duplicated package copy
 * would break `instanceof`, and prototypes define their own error classes.
 */

/** Seconds a client should wait after a simulated 429. */
export const RETRY_AFTER_SECONDS = 2;

const named = (error: unknown, name: string): error is Error & Record<string, unknown> =>
  error instanceof Error && error.name === name;

function body(status: number, message: string, extra: Record<string, unknown> = {}) {
  return { error: CODES[status] ?? 'error', message, ...extra };
}

/** Thrown for `offline`: what `fetch` itself rejects with when there is no network. */
export class OfflineFetchError extends TypeError {
  constructor() {
    super('Failed to fetch');
  }
}

export type ErrorMapping = MockResponse | OfflineFetchError;

export function mapError(error: unknown): ErrorMapping {
  if (error instanceof HttpError || named(error, 'HttpError')) {
    const e = error as HttpError;
    return new MockResponse(e.status, body(e.status, e.message, e.details));
  }
  if (named(error, 'SimulatedServiceError')) {
    switch (error.code) {
      case 'offline':
        return new OfflineFetchError();
      case 'timeout':
        return new MockResponse(504, body(504, error.message));
      case 'rate-limited':
        return new MockResponse(429, body(429, error.message), {
          'retry-after': String(RETRY_AFTER_SECONDS),
        });
      case 'permission-denied':
        return new MockResponse(403, body(403, error.message));
      default:
        return new MockResponse(500, body(500, error.message));
    }
  }
  if (named(error, 'PermissionDeniedError')) {
    return new MockResponse(
      403,
      body(403, error.message, { capability: error.capability, role: error.role ?? null })
    );
  }
  // Validation: zod errors (`issues` array) and prototype ValidationErrors (`issues` object).
  if (
    error instanceof Error &&
    'issues' in error &&
    error.issues &&
    typeof error.issues === 'object'
  ) {
    return new MockResponse(422, body(422, error.message, { issues: error.issues }));
  }
  const message = error instanceof Error ? error.message : String(error);
  return new MockResponse(500, body(500, message));
}
