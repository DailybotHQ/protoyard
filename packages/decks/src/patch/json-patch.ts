/**
 * The RFC 6902 subset Deck Studio emits and applies: `test`, `add`,
 * `replace` and `remove` on objects and arrays. Pointers follow RFC 6901
 * (`~0`, `~1`); prototype keys are refused. Applying works on a copy and
 * throws `DeckPatchError` naming the failing operation, so a patch never
 * half-applies.
 */

export type DeckPatchOperation =
  | { op: 'test'; path: string; value: unknown }
  | { op: 'add'; path: string; value: unknown }
  | { op: 'replace'; path: string; value: unknown }
  | { op: 'remove'; path: string };

/** The same op cap as blueprint patches (`JSON_PATCH_MAX_OPS`). */
export const DECK_PATCH_MAX_OPS = 1_000;

export class DeckPatchError extends Error {
  readonly index: number;
  constructor(message: string, index: number) {
    super(message);
    this.name = 'DeckPatchError';
    this.index = index;
  }
}

const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);

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

type Container = Record<string, unknown> | unknown[];

function resolveParent(
  root: unknown,
  tokens: string[],
  index: number
): { parent: Container; key: string } {
  let node: unknown = root;
  for (const token of tokens.slice(0, -1)) {
    if (UNSAFE.has(token)) throw new DeckPatchError(`Unsafe pointer segment "${token}"`, index);
    if (Array.isArray(node)) {
      if (!/^(0|[1-9]\d*)$/.test(token) || Number(token) >= node.length) {
        throw new DeckPatchError(`No array index ${token}`, index);
      }
      node = node[Number(token)];
    } else if (node !== null && typeof node === 'object' && Object.hasOwn(node, token)) {
      node = (node as Record<string, unknown>)[token];
    } else {
      throw new DeckPatchError(`Path not found at "${token}"`, index);
    }
  }
  if (node === null || typeof node !== 'object')
    throw new DeckPatchError('Path parent is not a container', index);
  const key = tokens.at(-1) as string;
  if (UNSAFE.has(key)) throw new DeckPatchError(`Unsafe pointer segment "${key}"`, index);
  return { parent: node as Container, key };
}

/** Applies a patch to a deep copy of `document` and returns the copy. */
export function applyDeckPatch<T>(document: T, operations: readonly DeckPatchOperation[]): T {
  if (operations.length > DECK_PATCH_MAX_OPS) {
    throw new DeckPatchError(
      `A patch holds at most ${DECK_PATCH_MAX_OPS} operations`,
      DECK_PATCH_MAX_OPS
    );
  }
  const root = structuredClone(document) as unknown;
  operations.forEach((operation, index) => {
    const tokens = parsePointer(operation.path);
    if (tokens.length === 0)
      throw new DeckPatchError('Patching the document root is not supported', index);
    const { parent, key } = resolveParent(root, tokens, index);
    const isArray = Array.isArray(parent);
    const at = isArray ? (key === '-' ? parent.length : Number(key)) : -1;
    if (isArray && (!/^(0|[1-9]\d*|-)$/.test(key) || at > parent.length)) {
      throw new DeckPatchError(`Bad array index "${key}"`, index);
    }
    const exists = isArray ? at < parent.length : Object.hasOwn(parent, key);
    switch (operation.op) {
      case 'test': {
        const current = isArray ? parent[at] : (parent as Record<string, unknown>)[key];
        if (!exists || !jsonEquals(current, operation.value)) {
          throw new DeckPatchError(`Test failed at ${operation.path}`, index);
        }
        return;
      }
      case 'add':
        if (isArray) parent.splice(at, 0, structuredClone(operation.value));
        else (parent as Record<string, unknown>)[key] = structuredClone(operation.value);
        return;
      case 'replace':
        if (!exists) throw new DeckPatchError(`Nothing to replace at ${operation.path}`, index);
        if (isArray) parent[at] = structuredClone(operation.value);
        else (parent as Record<string, unknown>)[key] = structuredClone(operation.value);
        return;
      case 'remove':
        if (!exists) throw new DeckPatchError(`Nothing to remove at ${operation.path}`, index);
        if (isArray) parent.splice(at, 1);
        else delete (parent as Record<string, unknown>)[key];
        return;
    }
  });
  return root as T;
}
