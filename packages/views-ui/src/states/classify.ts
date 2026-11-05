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
 * A message lookup: `useMessages()` from `texuli/i18n` fits, so the titles
 * and messages follow the prototype's dictionary (`protoyard.views.query-state.*`).
 */
export type QueryMessages = (
  id: string,
  english: string,
  values?: Readonly<Record<string, string>>
) => string;

/** English with `{name}` placeholders filled: the lookup when none is passed. */
const english: QueryMessages = (_id, text, values) =>
  values
    ? text.replace(/\{([a-z][a-z0-9_-]*)\}/gi, (match, name: string) => values[name] ?? match)
    : text;

const M = 'protoyard.views.query-state';

/**
 * Sorts a query failure by its error class, never by message text:
 * `PermissionDeniedError` → denied (simulated policy; switch persona),
 * `SimulatedServiceError` offline → offline, anything else → failed.
 * Pass `messages` (for example `useMessages()`) to translate the copy.
 */
export function classifyQueryError(
  error: unknown,
  messages: QueryMessages = english
): QueryErrorInfo {
  const failedTitle = () => messages(`${M}.failed-title`, "Couldn't load this");
  if (isError(error, PermissionDeniedError, 'PermissionDeniedError')) {
    return {
      kind: 'denied',
      title: messages(`${M}.denied-title`, "You don't have access"),
      message: messages(
        `${M}.denied-message`,
        "This persona's role can't view this ({capability}). Roles here are simulated: switch persona in DevTools to try another one.",
        { capability: error.capability }
      ),
      retryable: false,
      capability: error.capability,
    };
  }
  if (isError(error, SimulatedServiceError, 'SimulatedServiceError')) {
    if (error.code === 'offline') {
      return {
        kind: 'offline',
        title: messages(`${M}.offline-title`, "You're offline"),
        message: messages(
          `${M}.offline-message`,
          'The simulated network is offline. Turn it back on in DevTools, then try again.'
        ),
        retryable: true,
      };
    }
    return { kind: 'failed', title: failedTitle(), message: error.message, retryable: true };
  }
  return {
    kind: 'failed',
    title: failedTitle(),
    message:
      error instanceof Error && error.message
        ? error.message
        : messages(`${M}.failed-message`, 'Something went wrong while loading.'),
    retryable: true,
  };
}
