import { PermissionDeniedError, SimulatedServiceError } from '@protoyard/core';
import { createPrototypeRuntime } from '@protoyard/runtime';
import {
  createGenerateContext,
  PRESETS,
  resolveScenarios,
  validateWorld,
} from '@protoyard/scenarios';
import { afterEach, describe, expect, it } from 'vitest';
import type { BlankDatabase } from '../src/database/schema.ts';
import { createNoteServices, NoteValidationError, sortNotes } from '../src/domain/notes.ts';
import { definition } from '../src/prototype.ts';
import { generateBlankWorld } from '../src/scenarios/generators.ts';

// Same resolution as the runtime: `extends` against own scenarios + presets.
const resolved = resolveScenarios(definition.scenarios, PRESETS);
const scenario = (id: string) => {
  const s = resolved.find((x) => x.id === id);
  if (!s) throw new Error(id);
  return s;
};

describe('blank generator', () => {
  it('is deterministic and referentially sound for every scenario', async () => {
    for (const s of resolved) {
      const a = generateBlankWorld(createGenerateContext(s));
      const b = generateBlankWorld(createGenerateContext(s));
      expect(a).toEqual(b);
      expect(a.personas.map((p) => p.id)).toEqual(['user_0001', 'user_0002']);
      expect(a.personas.some((p) => p.id === s.actor.id)).toBe(true);
      const violations = validateWorld(a, {
        ...definition.integrity,
        referenceTime: s.referenceTime,
      });
      expect(violations).toEqual([]);
    }
    expect(generateBlankWorld(createGenerateContext(scenario('empty'))).tables.notes).toHaveLength(
      0
    );
    expect(generateBlankWorld(createGenerateContext(scenario('active'))).tables.notes).toHaveLength(
      12
    );
  });
});

describe('note services', () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  async function boot(link = {}) {
    const runtime = await createPrototypeRuntime(definition, { link, sleep: async () => {} });
    close = () => runtime.destroy();
    await runtime.scenarios.ensureSeeded();
    return runtime as unknown as import('@protoyard/core').PrototypeRuntime<BlankDatabase>;
  }

  it('lets the owner create, edit, pin and delete — persisted in IndexedDB', async () => {
    const runtime = await boot({ scenario: 'empty' });
    const notes = createNoteServices(runtime);
    await expect(notes.create({ title: '  ', body: '' })).rejects.toBeInstanceOf(
      NoteValidationError
    );
    const note = await notes.create({ title: 'First idea', body: 'Ship it' });
    expect(note.authorId).toBe('user_0001');
    expect(note.createdAt).toBe(runtime.clock.now().toISOString());
    await notes.update(note.id, { title: 'First idea (edited)', body: 'Ship it soon' });
    await notes.togglePin({ ...note });
    // A stale copy (still pinned: false) must not flip it back.
    await notes.togglePin({ ...note });
    await notes.togglePin({ ...note });
    const stored = await runtime.db.notes.get(note.id);
    expect(stored).toMatchObject({ title: 'First idea (edited)', pinned: true });
    await notes.remove(note.id);
    expect(await runtime.db.notes.count()).toBe(0);
  });

  it('blocks the viewer at service level and honours the simulated environment', async () => {
    const runtime = await boot({ scenario: 'active' });
    const notes = createNoteServices(runtime);
    const before = await runtime.db.notes.count();
    await runtime.session.switchActor('user_0002');
    await expect(notes.create({ title: 'Nope', body: '' })).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
    await runtime.session.switchActor('user_0001');
    await runtime.overrides.set({ environment: { network: 'offline' } });
    await expect(notes.create({ title: 'Offline', body: '' })).rejects.toBeInstanceOf(
      SimulatedServiceError
    );
    expect(await runtime.db.notes.count()).toBe(before);
  });

  it('sorts pinned notes first, then by recency', () => {
    const n = (id: string, pinned: boolean, updatedAt: string) =>
      ({
        id,
        title: id,
        body: '',
        authorId: 'u',
        pinned,
        createdAt: updatedAt,
        updatedAt,
      }) as const;
    expect(
      sortNotes([
        n('a', false, '2026-01-02'),
        n('b', true, '2026-01-01'),
        n('c', false, '2026-01-03'),
      ]).map((x) => x.id)
    ).toEqual(['b', 'c', 'a']);
  });
});
