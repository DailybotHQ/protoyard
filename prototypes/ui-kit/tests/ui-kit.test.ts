import { PermissionDeniedError } from '@protoyard/core';
import { createPrototypeRuntime } from '@protoyard/runtime';
import {
  createGenerateContextAsync,
  PRESETS,
  resolveScenarios,
  validateWorld,
} from '@protoyard/scenarios';
import { afterEach, describe, expect, it } from 'vitest';
import { CATALOG, CATALOG_IDS } from '../src/catalog/entries.ts';
import type { UiKitDatabase } from '../src/database/schema.ts';
import { createFavoriteServices } from '../src/domain/favorites.ts';
import { definition } from '../src/prototype.ts';
import { generateUiKitWorld } from '../src/scenarios/generators.ts';

describe('catalog', () => {
  it('has unique kebab-case ids covering every group', () => {
    expect(new Set(CATALOG_IDS).size).toBe(CATALOG_IDS.length);
    for (const id of CATALOG_IDS) expect(id).toMatch(/^[a-z0-9-]+$/);
    expect(new Set(CATALOG.map((e) => e.group)).size).toBe(12);
  });
});

describe('ui-kit generator', () => {
  it('is deterministic, references real catalog entries and passes integrity', async () => {
    for (const scenario of resolveScenarios(definition.scenarios, PRESETS)) {
      const a = generateUiKitWorld(await createGenerateContextAsync(scenario));
      const b = generateUiKitWorld(await createGenerateContextAsync(scenario));
      expect(a).toEqual(b);
      expect(a.personas.some((p) => p.id === scenario.actor.id)).toBe(true);
      for (const fav of a.tables.favorites ?? []) expect(CATALOG_IDS).toContain(fav.entryId);
      expect(
        validateWorld(a, { ...definition.integrity, referenceTime: scenario.referenceTime })
      ).toEqual([]);
    }
  });
});

describe('favorites service', () => {
  let destroy: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await destroy?.();
    destroy = undefined;
  });

  async function boot(scenario: string) {
    const runtime = await createPrototypeRuntime(definition, {
      link: { scenario },
      sleep: async () => {},
    });
    destroy = () => runtime.destroy();
    await runtime.scenarios.ensureSeeded();
    return runtime as unknown as import('@protoyard/core').PrototypeRuntime<UiKitDatabase>;
  }

  it('toggles per persona and keeps other personas untouched', async () => {
    const runtime = await boot('empty');
    const favorites = createFavoriteServices(runtime);
    expect(await favorites.toggle('button')).toBe(true);
    expect(await favorites.toggle('kanban')).toBe(true);
    expect(await favorites.toggle('button')).toBe(false);
    const rows = await runtime.db.favorites.toArray();
    expect(rows.map((r) => [r.personaId, r.entryId])).toEqual([['user_0001', 'kanban']]);
    await expect(favorites.toggle('../etc')).rejects.toThrow(/Unknown catalog entry/);
    expect(await favorites.clear()).toBe(1);
  });

  it('blocks the viewer at service level', async () => {
    const runtime = await boot('dark-viewer');
    expect(runtime.session.principal()?.role).toBe('viewer');
    expect(runtime.theme.appearance().mode.value).toBe('dark');
    await expect(createFavoriteServices(runtime).toggle('button')).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
  });
});
