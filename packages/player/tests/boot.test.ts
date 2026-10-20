import { blueprintIdentity, parseBlueprint } from '@protoyard/blueprint';
import { createPrototypeRuntime } from '@protoyard/runtime';
import { configure, screen } from '@testing-library/svelte';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import { type BootedPlayer, bootPlayer } from '../src/boot.ts';
import demo from '../src/fixtures/demo.blueprint.json';

// The app shell loads as its own chunk; give it time on a busy machine.
configure({ asyncUtilTimeout: 10_000 });

const root = document.documentElement;
let booted: BootedPlayer | undefined;

afterEach(async () => {
  await booted?.destroy();
  booted = undefined;
  document.body.replaceChildren();
  performance.clearMarks();
});

/** Boots on a fresh in-memory IndexedDB, as a first visit would. */
async function boot(blueprint = parseBlueprint(demo), search = '') {
  const target = document.body.appendChild(document.createElement('div'));
  const indexedDB = new IDBFactory();
  booted = await bootPlayer({
    blueprint,
    target,
    search,
    createRuntime: (definition, options) =>
      createPrototypeRuntime(definition, {
        ...options,
        indexedDB,
        IDBKeyRange,
        sleep: async () => {},
      }),
  });
  return booted;
}

describe('bootPlayer', () => {
  it('runs the bundled fixture blueprint and reaches protoyard:ready', async () => {
    const blueprint = parseBlueprint(demo);
    const player = await boot(blueprint);
    expect(player.error).toBeNull();
    expect(player.runtime).not.toBeNull();
    expect(root.dataset.protoyardReady).toBe('1');
    expect(performance.getEntriesByName('protoyard:ready')).toHaveLength(1);
    expect(performance.getEntriesByName('protoyard:world-ready')).toHaveLength(1);

    // The runtime definition comes from the blueprint, not the player's own manifest.
    const manifest = player.runtime!.manifest;
    expect(manifest.name).toBe(blueprint.name);
    expect(player.runtime!.scenarios.active()?.scenario.id).toBe('active');

    // The app shell renders the blueprint: its home dashboard and navigation.
    expect(await screen.findByRole('heading', { level: 1 })).toBeTruthy();
    for (const entity of blueprint.entities) {
      expect(document.querySelector(`a[href="#/${entity.plural}"]`), entity.name).not.toBeNull();
    }
    // Honest labelling from the runtime build options.
    expect(document.querySelector('[data-py-demo-badge]')).not.toBeNull();
  });

  it('stores each blueprint under its own content namespace', async () => {
    const blueprint = parseBlueprint(demo);
    const player = await boot(blueprint);
    const { namespace } = await blueprintIdentity(blueprint);
    expect(player.namespace).toBe(namespace);
    expect(player.namespace).toMatch(/^bp-[a-z2-7]{26}$/);
    expect(player.runtime!.manifest.storage.namespace).toBe(namespace);
    expect(player.runtime!.manifest.storage.namespace).not.toBe('player');
    await player.destroy();
    booted = undefined;

    const edited = parseBlueprint({ ...demo, name: `${blueprint.name} (edited)` });
    const other = await boot(edited);
    expect(other.namespace).not.toBe(namespace);
    expect(other.runtime!.manifest.name).toBe(edited.name);
  });

  it('seeds a world with rows for the blueprint entities', async () => {
    const blueprint = parseBlueprint(demo);
    const player = await boot(blueprint);
    const db = player.runtime!.db as { table(name: string): { count(): Promise<number> } };
    const first = blueprint.entities[0]!;
    const table =
      first.table ?? first.plural.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    expect(await db.table(table).count()).toBeGreaterThan(0);
  });
});
