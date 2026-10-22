import { FLOW_LIMITS } from './limits.ts';

/** Keys that could reach an object prototype if a consumer ever merged them. */
export const FORBIDDEN_KEYS: ReadonlySet<string> = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

export interface DataProblem {
  path: string;
  message: string;
}

const pointer = (path: readonly (string | number)[]) =>
  path.length === 0
    ? '$'
    : `$${path.map((p) => (typeof p === 'number' ? `[${p}]` : `.${p}`)).join('')}`;

const isPlainObject = (value: object) => {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/**
 * Walks untrusted input without recursion and reports the first problem: a
 * value JSON cannot hold (function, symbol, bigint, class instance, non-finite
 * number), a forbidden key, a string over the cap, or a structure too deep or
 * too large. A flow that passes holds plain data only, so nothing in it can
 * ever be called.
 */
export function inspectPlainData(input: unknown): DataProblem | null {
  const stack: { value: unknown; path: (string | number)[]; depth: number }[] = [
    { value: input, path: [], depth: 0 },
  ];
  let nodes = 0;
  while (stack.length > 0) {
    const { value, path, depth } = stack.pop() as (typeof stack)[number];
    nodes += 1;
    if (nodes > FLOW_LIMITS.maxDataNodes) {
      return { path: pointer(path), message: `More than ${FLOW_LIMITS.maxDataNodes} values` };
    }
    if (depth > FLOW_LIMITS.maxDataDepth) {
      return { path: pointer(path), message: `Nested deeper than ${FLOW_LIMITS.maxDataDepth}` };
    }
    if (value === null || typeof value === 'boolean') continue;
    if (typeof value === 'string') {
      if (value.length > FLOW_LIMITS.maxStringLength) {
        return { path: pointer(path), message: `Text longer than ${FLOW_LIMITS.maxStringLength}` };
      }
      continue;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return { path: pointer(path), message: 'Not a finite number' };
      continue;
    }
    if (typeof value !== 'object') {
      return { path: pointer(path), message: `A ${typeof value} is not plain data` };
    }
    if (Array.isArray(value)) {
      for (const [i, item] of value.entries()) {
        stack.push({ value: item, path: [...path, i], depth: depth + 1 });
      }
      continue;
    }
    if (!isPlainObject(value)) return { path: pointer(path), message: 'Not a plain object' };
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key === 'symbol')
        return { path: pointer(path), message: 'Symbol keys are not data' };
      if (FORBIDDEN_KEYS.has(key))
        return { path: pointer([...path, key]), message: `Key "${key}" is not allowed` };
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor && !('value' in descriptor)) {
        return { path: pointer([...path, key]), message: 'Accessors are not data' };
      }
      stack.push({ value: descriptor?.value, path: [...path, key], depth: depth + 1 });
    }
  }
  return null;
}
