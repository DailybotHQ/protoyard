import { PermissionDeniedError, SimulatedServiceError } from '@protoyard/core';

export type QueryErrorKind = 'offline' | 'denied' | 'failed';

export interface QueryErrorInfo {
  kind: QueryErrorKind;
  title: string;
  message: string;
  /** False when trying again cannot help (a role without the capability). */
  retryable: boolean;
  /** The missing capability, for `denied`. */
  capability?: string;
}

/** True for an error of `type`, or one with its name (a duplicated core copy breaks `instanceof`). */
function isError<T extends Error>(
  error: unknown,
  type: abstract new (...args: never[]) => T,
  name: string
): error is T {
  return error instanceof type || (error instanceof Error && error.name === name);
}

/**
 * Sorts a query failure by its error class, never by message text:
 * `PermissionDeniedError` → denied (simulated policy; switch persona),
 * `SimulatedServiceError` offline → offline, anything else → failed.
 */
export function classifyQueryError(error: unknown): QueryErrorInfo {
  if (isError(error, PermissionDeniedError, 'PermissionDeniedError')) {
    return {
      kind: 'denied',
      title: "You don't have access",
      message: `This persona's role can't view this (${error.capability}). Roles here are simulated: switch persona in DevTools to try another one.`,
      retryable: false,
      capability: error.capability,
    };
  }
  if (isError(error, SimulatedServiceError, 'SimulatedServiceError')) {
    if (error.code === 'offline') {
      return {
        kind: 'offline',
        title: "You're offline",
        message: 'The simulated network is offline. Turn it back on in DevTools, then try again.',
        retryable: true,
      };
    }
    return { kind: 'failed', title: "Couldn't load this", message: error.message, retryable: true };
  }
  return {
    kind: 'failed',
    title: "Couldn't load this",
    message:
      error instanceof Error && error.message
        ? error.message
        : 'Something went wrong while loading.',
    retryable: true,
  };
}
