import { parseScenario, type WorldSeed } from '@protoyard/core';
import { validateWorld } from '@protoyard/scenarios';
import { describe, expect, it } from 'vitest';
import { contextFor as buildContext } from '../../../tests/support/generate-context.ts';
import type { Document, Folder, Tag } from '../src/database/schema.ts';
import { definition } from '../src/prototype.ts';
import { generateDesktopWorld } from '../src/scenarios/generators.ts';

const contextFor = (id: string, seed?: number) => buildContext(definition.scenarios, id, seed);
const rows = <T>(world: WorldSeed, table: string) => (world.tables[table] ?? []) as unknown as T[];

describe('desktop app generator', () => {
  it('is deterministic for a seed and differs for another seed', () => {
    const a = generateDesktopWorld(contextFor('active'));
    expect(generateDesktopWorld(contextFor('active'))).toEqual(a);
    const c = generateDesktopWorld(contextFor('active', 77));
    expect(c.tables.documents).not.toEqual(a.tables.documents);
  });

  it('passes the integrity rules and gives the actor its scenario role in every scenario', () => {
    for (const input of definition.scenarios) {
      const ctx = contextFor(input.id);
      const world = generateDesktopWorld(ctx);
      const violations = validateWorld(world, {
        ...definition.integrity,
        referenceTime: ctx.scenario.referenceTime,
      });
      expect(violations, input.id).toEqual([]);
      const membership = world.memberships.find((m) => m.personaId === ctx.scenario.actor.id);
      expect(membership?.role, input.id).toBe(ctx.scenario.actor.role);

      const tags = new Set(rows<Tag>(world, 'tags').map((t) => t.id));
      for (const doc of rows<Document>(world, 'documents')) {
        expect(doc.updatedAt >= doc.createdAt, doc.id).toBe(true);
        for (const tagId of doc.tagIds) expect(tags.has(tagId), `${doc.id} → ${tagId}`).toBe(true);
        // Viewers never author or edit anything.
        expect(doc.authorId).not.toBe('user_0003');
        expect(doc.updatedBy).not.toBe('user_0003');
      }
    }
  });

  it('scales from a fresh install to a large library', () => {
    const empty = generateDesktopWorld(contextFor('empty'));
    // A fresh install still has an Inbox, so "New document" always has a home.
    expect(rows<Folder>(empty, 'folders').map((f) => f.name)).toEqual(['Inbox']);
    expect(rows(empty, 'documents')).toHaveLength(0);
    expect(rows(empty, 'tags')).toHaveLength(0);

    const active = generateDesktopWorld(contextFor('active'));
    expect(rows(active, 'folders')).toHaveLength(5);
    expect(rows(active, 'tags')).toHaveLength(6);
    expect(rows(active, 'documents').length).toBeGreaterThanOrEqual(15);

    const large = generateDesktopWorld(contextFor('large'));
    expect(rows(large, 'folders')).toHaveLength(24);
    expect(rows(large, 'documents').length).toBeGreaterThan(190);
  });

  it('declares every scenario in protoyard.json', () => {
    const ids = definition.scenarios.map((s) => parseScenario(s).id);
    expect(ids).toEqual(definition.manifest.scenarios);
    expect(definition.manifest.preview.shell).toBe('desktop-window');
  });
});
