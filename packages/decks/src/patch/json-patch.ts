/**
 * The RFC 6902 patches Deck Studio emits: `test`, `add`, `replace` and
 * `remove`. Applying is `@texuli/deck`'s bounded RFC 6902 `applyDeckPatch`
 * (RFC 6901 pointers, prototype keys refused, on a copy, so a patch never
 * half-applies); this module keeps Protoyard's contract of returning the
 * patched document and throwing `DeckPatchError` naming the failing
 * operation.
 */
import {
  applyDeckPatch as applyModelPatch,
  MAX_DECK_PATCH_OPERATIONS,
} from '@texuli/deck/authoring';

export type DeckPatchOperation =
  | { op: 'test'; path: string; value: unknown }
  | { op: 'add'; path: string; value: unknown }
  | { op: 'replace'; path: string; value: unknown }
  | { op: 'remove'; path: string };

/** The same op cap as blueprint patches (`JSON_PATCH_MAX_OPS`). */
export const DECK_PATCH_MAX_OPS = MAX_DECK_PATCH_OPERATIONS;

export class DeckPatchError extends Error {
  readonly index: number;
  constructor(message: string, index: number) {
    super(message);
    this.name = 'DeckPatchError';
    this.index = index;
  }
}

/** `/a/b~1c` → `['a', 'b/c']`. */
export function parsePointer(pointer: string): string[] {
  if (pointer === '') return [];
  if (!pointer.startsWith('/')) throw new TypeError(`JSON pointer must start with "/": ${pointer}`);
  return pointer
    .slice(1)
    .split('/')
    .map((token) => token.replaceAll('~1', '/').replaceAll('~0', '~'));
}

/** `['a', 'b/c']` → `/a/b~1c`. */
export function formatPointer(tokens: readonly (string | number)[]): string {
  return tokens.map((t) => `/${String(t).replaceAll('~', '~0').replaceAll('/', '~1')}`).join('');
}

/** Structural JSON equality. */
export function jsonEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const other = b as unknown[];
    return a.length === other.length && a.every((item, i) => jsonEquals(item, other[i]));
  }
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  return (
    ka.length === kb.length &&
    ka.every(
      (key) =>
        Object.hasOwn(b as object, key) &&
        jsonEquals((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
    )
  );
}

/** Apply `operations` to a copy of `document`; throws `DeckPatchError` and leaves `document` untouched on failure. */
export function applyDeckPatch<T>(document: T, operations: readonly DeckPatchOperation[]): T {
  // Deck edits address a key or an item: Protoyard never lets a patch replace the whole document.
  const root = operations.findIndex((operation) => operation?.path === '');
  if (root >= 0 && operations.length <= DECK_PATCH_MAX_OPS) {
    throw new DeckPatchError(
      `Operation ${root}: a deck patch cannot target the document root.`,
      root
    );
  }
  const result = applyModelPatch(document, operations);
  if (!result.ok) {
    const at = result.index >= 0 ? `Operation ${result.index}: ` : '';
    throw new DeckPatchError(`${at}${result.reason}`, result.index);
  }
  return result.value as T;
}
