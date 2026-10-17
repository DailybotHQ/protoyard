import { registry, registryError } from 'virtual:protoyard-registry';
import type { CompactEntry, Registry, RegistryEntry } from './types';

export { registry, registryError };

export function entries(): RegistryEntry[] {
  return registry?.entries ?? [];
}

export function prototypes(): RegistryEntry[] {
  return entries().filter((e) => e.kind === 'prototype');
}

export function templates(): RegistryEntry[] {
  return entries().filter((e) => e.kind === 'template');
}

export function compact(entry: RegistryEntry): CompactEntry {
  return {
    k: entry.kind,
    s: entry.slug,
    n: entry.name,
    d: entry.description,
    c: entry.category,
    t: entry.tags,
    p: entry.platform,
    st: entry.status,
    tp: entry.template,
    i: entry.icon,
    sc: entry.scenarioCount,
    m: entry.modifiedAt,
  };
}

/** JSON safe to inline in a <script type="application/json"> tag. */
export function inlineJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function facetValues(
  list: readonly RegistryEntry[],
  pick: (e: RegistryEntry) => string | string[]
) {
  const counts = new Map<string, number>();
  for (const entry of list) {
    const values = pick(entry);
    for (const value of Array.isArray(values) ? values : [values]) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export type { Registry, RegistryEntry };
