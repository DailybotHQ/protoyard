// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { appPathFor, showcaseRegistry } from '../src/commands/showcase.ts';
import type { Registry, RegistryEntry } from '../src/lib/registry.ts';

const entry = (kind: RegistryEntry['kind'], slug: string) => ({ kind, slug }) as RegistryEntry;

describe('showcase', () => {
  it('places apps under their gallery detail pages', () => {
    expect(appPathFor(entry('prototype', 'crm-demo'))).toBe('p/crm-demo/app/');
    expect(appPathFor(entry('template', 'blank'))).toBe('t/blank/app/');
  });

  it('marks only successfully built entries as embedded', () => {
    const registry = {
      entries: [
        entry('prototype', 'crm-demo'),
        entry('prototype', 'broken'),
        entry('template', 'blank'),
      ],
    } as Registry;
    const result = showcaseRegistry(registry, [
      { kind: 'prototype', slug: 'crm-demo', appPath: 'p/crm-demo/app/', ok: true, durationMs: 1 },
      { kind: 'prototype', slug: 'broken', appPath: 'p/broken/app/', ok: false, durationMs: 1 },
    ]);
    const embedded = result.entries.map(
      (e) => (e as RegistryEntry & { embedded?: unknown }).embedded ?? null
    );
    expect(embedded).toEqual([{ url: 'p/crm-demo/app/', scenarioLinks: true }, null, null]);
    // The source registry object is not mutated.
    expect(
      (registry.entries[0] as RegistryEntry & { embedded?: unknown }).embedded
    ).toBeUndefined();
  });
});
