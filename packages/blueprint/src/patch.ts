import { z } from 'zod';
import type { DeckBlueprint, DocBlueprint, PageBlueprint } from './kinds/envelope.ts';
import {
  type BlueprintMigration,
  type DiffBlueprintsOptions,
  diffBlueprints,
  MigrationError,
} from './migrations.ts';
import { type Blueprint, safeParseBlueprint } from './schema.ts';
import { loadUntrustedDocument } from './untrusted.ts';

/**
 * RFC 6902 JSON Patch for blueprints (`protoyard quick iterate`), with no
 * dependency. A patch is untrusted input: it is shape-checked with zod, its
 * pointers may never name `__proto__`, `constructor` or `prototype`, it runs
 * on a copy so a failing operation changes nothing, the result must parse as
 * a blueprint, and the data migration it implies is returned, so callers know
 * whether the current world survives. A change that loses data (a dropped
 * entity or field, an incompatible field change) needs `allowDrop`.
 */

export const JSON_PATCH_MAX_OPS = 1000;
/** Maximum JSON nodes traversed while copying a document or patch value. */
export const JSON_PATCH_MAX_NODES = 100_000;
export const JSON_POINTER_MAX_LENGTH = 1024;
/** Pointer tokens and value keys that could reach an object prototype. */
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

const Pointer = z.string().max(JSON_POINTER_MAX_LENGTH);
// RFC 6902 §4: members an operation does not define are ignored, so these are
// not strict. `value` is checked for presence separately (it may be null).
export const JsonPatchOperationSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('add'), path: Pointer, value: z.unknown() }),
  z.object({ op: z.literal('remove'), path: Pointer }),
  z.object({ op: z.literal('replace'), path: Pointer, value: z.unknown() }),
  z.object({ op: z.literal('move'), from: Pointer, path: Pointer }),
  z.object({ op: z.literal('copy'), from: Pointer, path: Pointer }),
  z.object({ op: z.literal('test'), path: Pointer, value: z.unknown() }),
]);
export const JsonPatchSchema = z.array(JsonPatchOperationSchema).max(JSON_PATCH_MAX_OPS);
export type JsonPatchOperation = z.output<typeof JsonPatchOperationSchema>;

export type BlueprintPatchErrorCode =
  | 'invalid-patch'
  | 'unsafe-pointer'
  | 'path-not-found'
  | 'test-failed'
  | 'invalid-result'
  | 'drop-requires-allow';

export class BlueprintPatchError extends Error {
  readonly code: BlueprintPatchErrorCode;
  /** Index of the failing operation, when one operation is to blame. */
  readonly index: number | null;
  /** Blueprint validation issues for `invalid-result`. */
  readonly issues: readonly { path: (string | number)[]; message: string }[];
  constructor(
    code: BlueprintPatchErrorCode,
    message: string,
    options: { index?: number | null; issues?: BlueprintPatchError['issues'] } = {}
  ) {
    super(message);
    this.name = 'BlueprintPatchError';
    this.code = code;
    this.index = options.index ?? null;
    this.issues = options.issues ?? [];
  }
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Container = Json[] | { [key: string]: Json };
type JsonBudget = { used: number };

/** RFC 6901: `""` is the whole document; otherwise `/`-separated, `~1` → `/`, `~0` → `~`. */
export function parseJsonPointer(pointer: string): string[] {
  if (pointer === '') return [];
  if (!pointer.startsWith('/')) throw new Error(`"${pointer}" must be empty or start with "/"`);
  return pointer
    .slice(1)
    .split('/')
    .map((token) => {
      if (/~[^01]|~$/.test(token)) throw new Error(`"${pointer}" has an invalid ~ escape`);
      const key = token.replace(/~1/g, '/').replace(/~0/g, '~');
      if (FORBIDDEN_KEYS.has(key)) throw new Error(`"${pointer}" names "${key}"`);
      return key;
    });
}

function isContainer(value: unknown): value is Container {
  return typeof value === 'object' && value !== null;
}

/** Array index token: `0` or digits without a leading zero; `-` (append) only when allowed. */
function arrayIndex(array: Json[], token: string, forAdd: boolean): number | null {
  if (token === '-') return forAdd ? array.length : null;
  if (!/^(?:0|[1-9]\d*)$/.test(token)) return null;
  const index = Number(token);
  return index < (forAdd ? array.length + 1 : array.length) ? index : null;
}

function hasMember(container: Container, token: string): boolean {
  return Array.isArray(container)
    ? arrayIndex(container, token, false) !== null
    : Object.hasOwn(container, token);
}

function memberAt(container: Container, token: string): Json {
  return Array.isArray(container)
    ? (container[arrayIndex(container, token, false) as number] as Json)
    : (container[token] as Json);
}

/** Walks to the parent of `tokens`; throws `path-not-found` when it is missing. */
function parentOf(root: Json, tokens: readonly string[], fail: (why: string) => never): Container {
  let node: Json = root;
  for (const token of tokens.slice(0, -1)) {
    if (!isContainer(node) || !hasMember(node, token))
      fail('a parent along the path does not exist');
    node = memberAt(node as Container, token);
  }
  if (!isContainer(node)) fail('its parent is not an object or array');
  return node as Container;
}

function getAt(root: Json, tokens: readonly string[], fail: (why: string) => never): Json {
  if (tokens.length === 0) return root;
  const parent = parentOf(root, tokens, fail);
  const last = tokens[tokens.length - 1] as string;
  if (!hasMember(parent, last)) fail('the target does not exist');
  return memberAt(parent, last);
}

/** Returns the new root (an `add` at `""` replaces the whole document). */
function addAt(
  root: Json,
  tokens: readonly string[],
  value: Json,
  fail: (why: string) => never
): Json {
  if (tokens.length === 0) return value;
  const parent = parentOf(root, tokens, fail);
  const last = tokens[tokens.length - 1] as string;
  if (Array.isArray(parent)) {
    const index = arrayIndex(parent, last, true);
    if (index === null) fail('the array index is out of range');
    parent.splice(index as number, 0, value);
  } else {
    parent[last] = value;
  }
  return root;
}

function removeAt(root: Json, tokens: readonly string[], fail: (why: string) => never): Json {
  if (tokens.length === 0) fail('the whole document cannot be removed');
  const parent = parentOf(root, tokens, fail);
  const last = tokens[tokens.length - 1] as string;
  if (!hasMember(parent, last)) fail('the target does not exist');
  const removed = memberAt(parent, last);
  if (Array.isArray(parent)) parent.splice(arrayIndex(parent, last, false) as number, 1);
  else delete parent[last];
  return removed;
}

/** JSON equality: same type, arrays in order, objects by key set regardless of order. */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((item, i) => jsonEqual(item, b[i]));
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && jsonEqual(left[key], right[key]))
  );
}

/** Deep-copies a JSON value, refusing non-JSON values and prototype-reaching keys. */
function toJson(value: unknown, fail: (why: string) => never, budget: JsonBudget, depth = 0): Json {
  budget.used += 1;
  if (budget.used > JSON_PATCH_MAX_NODES) {
    fail(`the patch exceeds the ${JSON_PATCH_MAX_NODES.toLocaleString()}-node budget`);
  }
  if (depth > 64) fail('the value is nested too deeply');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('the value has a non-finite number');
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => toJson(item, fail, budget, depth + 1));
  if (typeof value === 'object') {
    const out: { [key: string]: Json } = {};
    for (const key of Object.keys(value)) {
      if (FORBIDDEN_KEYS.has(key)) fail(`the value has a "${key}" key`);
      const member = (value as Record<string, unknown>)[key];
      // Dropped like JSON.stringify does: parsed blueprints may carry undefined optionals.
      if (member !== undefined) out[key] = toJson(member, fail, budget, depth + 1);
    }
    return out;
  }
  return fail('the value is not JSON');
}

/**
 * Applies RFC 6902 operations in order to a copy of `document` and returns
 * the result. Any failure throws `BlueprintPatchError` and leaves the input
 * untouched (the operations are atomic as a whole).
 */
export function applyJsonPatch(document: unknown, operations: unknown): unknown {
  const parsed = JsonPatchSchema.safeParse(operations);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const index = typeof issue?.path[0] === 'number' ? issue.path[0] : null;
    throw new BlueprintPatchError(
      'invalid-patch',
      `Invalid JSON Patch${index === null ? '' : ` operation ${index}`}: ${issue?.path.slice(1).join('.') || 'patch'} ${issue?.message ?? ''}`.trim(),
      { index }
    );
  }
  const raw = Array.isArray(operations) ? operations : [];
  const budget: JsonBudget = { used: 0 };
  let root = toJson(
    document,
    (why) => {
      throw new BlueprintPatchError('invalid-patch', `The document is not JSON: ${why}.`);
    },
    budget
  );

  parsed.data.forEach((operation, index) => {
    const where = `operation ${index} (${operation.op} ${operation.path})`;
    const fail = (why: string, code: BlueprintPatchErrorCode = 'path-not-found'): never => {
      throw new BlueprintPatchError(code, `JSON Patch ${where} failed: ${why}.`, { index });
    };
    const pointer = (text: string): string[] => {
      try {
        return parseJsonPointer(text);
      } catch (error) {
        return fail((error as Error).message, 'unsafe-pointer');
      }
    };
    const value = (): Json => {
      if (!Object.hasOwn(raw[index] as object, 'value'))
        fail('it has no "value" member', 'invalid-patch');
      return toJson(
        (operation as { value: unknown }).value,
        (why) => fail(why, 'invalid-patch'),
        budget
      );
    };
    const path = pointer(operation.path);
    switch (operation.op) {
      case 'add':
        root = addAt(root, path, value(), fail);
        break;
      case 'remove':
        removeAt(root, path, fail);
        break;
      case 'replace': {
        const next = value();
        if (path.length === 0) {
          root = next;
          break;
        }
        removeAt(root, path, fail);
        root = addAt(root, path, next, fail);
        break;
      }
      case 'move': {
        const from = pointer(operation.from);
        if (from.length < path.length && from.every((token, i) => token === path[i]))
          fail('a value cannot move into one of its own children', 'invalid-patch');
        if (from.length === path.length && from.every((token, i) => token === path[i])) break;
        const moved = from.length === 0 ? root : removeAt(root, from, fail);
        root = addAt(root, path, moved, fail);
        break;
      }
      case 'copy': {
        const copied = toJson(
          getAt(root, pointer(operation.from), fail),
          (why) => fail(why, 'invalid-patch'),
          budget
        );
        root = addAt(root, path, copied, fail);
        break;
      }
      case 'test':
        if (!jsonEqual(getAt(root, path, fail), value()))
          fail('the value is different', 'test-failed');
        break;
    }
  });
  return root;
}

export interface ApplyBlueprintPatchOptions
  extends Pick<DiffBlueprintsOptions, 'fromVersion' | 'renamedFrom'> {
  /** Accept a patch that drops entities or fields, or resets incompatible fields. */
  allowDrop?: boolean;
}

export interface BlueprintPatchResult {
  blueprint: Blueprint;
  /** The next database version, or null when the stored data shape is unchanged. */
  migration: BlueprintMigration | null;
  /** True when the migration drops tables or fields or resets values (only with allowDrop). */
  destructive: boolean;
}

/**
 * Applies a JSON Patch to a blueprint and validates the result. The returned
 * migration says how the existing world moves to the new schema; `destructive`
 * says whether that loses data, which needs `allowDrop`.
 */
export function applyBlueprintPatch(
  blueprint: Blueprint,
  operations: unknown,
  options: ApplyBlueprintPatchOptions = {}
): BlueprintPatchResult {
  const patched = applyJsonPatch(blueprint, operations);
  const result = safeParseBlueprint(patched);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.filter((part): part is string | number => typeof part !== 'symbol'),
      message: issue.message,
    }));
    const first = issues[0];
    throw new BlueprintPatchError(
      'invalid-result',
      `The patched blueprint is invalid: ${first ? `${first.path.join('.') || '(root)'}: ${first.message}` : 'unknown issue'}${issues.length > 1 ? ` (+${issues.length - 1} more)` : ''}.`,
      { issues }
    );
  }
  const next = result.data;
  const diff = { fromVersion: options.fromVersion, renamedFrom: options.renamedFrom };
  try {
    return {
      blueprint: next,
      migration: diffBlueprints(blueprint, next, { ...diff, allowDrop: false }),
      destructive: false,
    };
  } catch (error) {
    if (!(error instanceof MigrationError) || error.code !== 'drop-requires-allow') throw error;
    if (options.allowDrop !== true) {
      throw new BlueprintPatchError(
        'drop-requires-allow',
        `${error.message}. Pass allowDrop to accept losing that data.`
      );
    }
    return {
      blueprint: next,
      migration: diffBlueprints(blueprint, next, { ...diff, allowDrop: true }),
      destructive: true,
    };
  }
}

/** A deck, page or doc blueprint. */
type ContentKindBlueprint = DeckBlueprint | PageBlueprint | DocBlueprint;

export interface ContentPatchResult<B extends ContentKindBlueprint> {
  blueprint: B;
}

/**
 * Applies a JSON Patch to a deck, page or doc and validates the result as
 * untrusted input (`loadUntrustedDocument`: kind limits, text sanitizing and
 * the kind's body schema). Content kinds share one store layout, so there is
 * never a data migration: block state and form responses stay keyed by block
 * id. The patch may not change `kind`.
 */
export async function applyContentPatch<B extends ContentKindBlueprint>(
  blueprint: B,
  operations: unknown
): Promise<ContentPatchResult<B>> {
  const patched = applyJsonPatch(blueprint, operations);
  const kind = (patched as { kind?: unknown } | null)?.kind;
  if (kind !== blueprint.kind) {
    throw new BlueprintPatchError(
      'invalid-result',
      `A patch may not change the blueprint kind (${blueprint.kind} → ${String(kind)}).`,
      { issues: [{ path: ['kind'], message: 'kind is fixed for an exploration' }] }
    );
  }
  const loaded = await loadUntrustedDocument(patched);
  if (!loaded.success) {
    const issues = loaded.issues.map((issue) => ({
      path: [...issue.path],
      message: issue.message,
    }));
    const first = issues[0];
    throw new BlueprintPatchError(
      'invalid-result',
      `The patched ${blueprint.kind} is invalid: ${first ? `${first.path.join('.') || '(root)'}: ${first.message}` : 'unknown issue'}${issues.length > 1 ? ` (+${issues.length - 1} more)` : ''}.`,
      { issues }
    );
  }
  return { blueprint: loaded.blueprint as B };
}
