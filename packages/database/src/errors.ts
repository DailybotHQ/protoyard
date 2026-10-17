/**
 * Storage failures surfaced to people, not stack traces. Every IndexedDB/Dexie
 * failure the runtime can hit is mapped to one of these codes so the renderer
 * can show a friendly, actionable message.
 */

export type StorageErrorCode =
  | 'unavailable'
  | 'quota-exceeded'
  | 'version-newer'
  | 'blocked'
  | 'unknown';

export const STORAGE_ERROR_MESSAGES: Record<StorageErrorCode, string> = {
  unavailable:
    'Browser storage (IndexedDB) is not available here — private browsing or a strict privacy setting may be blocking it. Changes will not persist after you close the tab.',
  'quota-exceeded':
    'Browser storage is full. Delete old snapshots or reset a prototype to free space.',
  'version-newer':
    'This browser holds data from a newer version of this prototype. Update the prototype, or reset its data from DevTools. Nothing was deleted.',
  blocked:
    'The prototype database is open in another tab with an older version. Close the other tabs of this prototype and reload.',
  unknown: 'The prototype database could not be used because of an unexpected storage error.',
};

export class StorageError extends Error {
  readonly code: StorageErrorCode;
  /** The original error, kept for DevTools diagnostics. */
  override readonly cause: unknown;

  constructor(code: StorageErrorCode, options: { message?: string; cause?: unknown } = {}) {
    super(options.message ?? STORAGE_ERROR_MESSAGES[code]);
    this.name = 'StorageError';
    this.code = code;
    this.cause = options.cause;
  }
}

export function isStorageError(error: unknown): error is StorageError {
  return error instanceof StorageError;
}

/** Names of DOM exceptions and Dexie errors (Dexie names end with `Error`). */
const CODE_BY_NAME: Record<string, StorageErrorCode> = {
  QuotaExceededError: 'quota-exceeded',
  VersionError: 'version-newer',
  MissingAPIError: 'unavailable',
  // Firefox private mode and Safari with storage disabled throw these on open.
  InvalidStateError: 'unavailable',
  SecurityError: 'unavailable',
  NotAllowedError: 'unavailable',
  UnknownError: 'unavailable',
  BlockedError: 'blocked',
  VersionChangeError: 'blocked',
};

function errorName(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'name' in error) {
    const name = (error as { name: unknown }).name;
    return typeof name === 'string' ? name : undefined;
  }
  return undefined;
}

/**
 * Maps any thrown value to a {@link StorageError}. Dexie wraps the native
 * failure in `inner` (e.g. `OpenFailedError` → `InvalidStateError`), so the
 * chain is walked until a recognised name appears.
 */
export function mapStorageError(error: unknown): StorageError {
  if (error instanceof StorageError) return error;
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth++) {
    const name = errorName(current);
    const code = name ? CODE_BY_NAME[name] : undefined;
    if (code) return new StorageError(code, { cause: error });
    if (name && /quota/i.test(name)) return new StorageError('quota-exceeded', { cause: error });
    current =
      (current as { inner?: unknown; cause?: unknown }).inner ??
      (current as { cause?: unknown }).cause;
  }
  return new StorageError('unknown', { cause: error });
}
