import type { DatabaseVersion } from '@protoyard/core';
import { openPrototypeDatabase } from '@protoyard/database';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  appendMigration,
  type BlueprintInput,
  defaultForField,
  deriveStores,
  diffBlueprints,
  MigrationError,
  parseBlueprint,
  toDatabaseVersion,
} from '../src/index.ts';

const backend = () => ({
  indexedDB: new IDBFactory() as unknown as globalThis.IDBFactory,
  IDBKeyRange: IDBKeyRange as unknown as typeof globalThis.IDBKeyRange,
});

function baseNotes(): BlueprintInput {
  return {
    formatVersion: 1,
    name: 'Notes',
    entities: [
      {
        name: 'note',
        plural: 'notes',
        fields: [
          { name: 'title', kind: 'text', required: true },
          { name: 'body', kind: 'longText', default: '' },
        ],
        titleField: 'title',
      },
    ],
    roles: [{ name: 'owner', permissions: { '*': ['*'] } }],
  };
}

function source(versions: DatabaseVersion[], namespace = 'blueprint-mig') {
  return {
    manifest: { storage: { namespace, schemaVersion: versions.at(-1)?.version ?? 1 } },
    database: { versions },
  };
}

describe('diffBlueprints', () => {
  it('returns null when stores and fields are unchanged', () => {
    const bp = parseBlueprint(baseNotes());
    expect(diffBlueprints(bp, bp)).toBeNull();
  });

  it('adds a field with a default backfill and keeps existing rows', async () => {
    const prev = parseBlueprint(baseNotes());
    const next = parseBlueprint({
      ...baseNotes(),
      entities: [
        {
          name: 'note',
          plural: 'notes',
          fields: [
            { name: 'title', kind: 'text', required: true },
            { name: 'body', kind: 'longText', default: '' },
            { name: 'pinned', kind: 'boolean', default: false },
            {
              name: 'priority',
              kind: 'enum',
              values: ['low', 'normal', 'high'],
              default: 'normal',
            },
          ],
          titleField: 'title',
          indexes: ['pinned'],
        },
      ],
    });

    const migration = diffBlueprints(prev, next, { fromVersion: 1 });
    expect(migration).not.toBeNull();
    expect(migration?.version).toBe(2);
    expect(migration?.stores.notes).toBe(deriveStores(next).notes);
    expect(migration?.ops).toEqual(
      expect.arrayContaining([
        { op: 'backfill', table: 'notes', field: 'pinned', value: false },
        { op: 'backfill', table: 'notes', field: 'priority', value: 'normal' },
      ])
    );

    const v1: DatabaseVersion = { version: 1, stores: deriveStores(prev) };
    const v2 = toDatabaseVersion(migration!);
    const store = backend();

    const db1 = await openPrototypeDatabase(source([v1], 'notes-add-field'), store);
    await db1.table('notes').bulkAdd([
      {
        id: 'n1',
        title: 'Ship it',
        body: 'Almost',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'n2',
        title: 'Later',
        body: '',
        createdAt: '2026-01-02T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    ]);
    db1.close();

    const db2 = await openPrototypeDatabase(
      source(appendMigration([v1], migration), 'notes-add-field'),
      store
    );
    const rows = (await db2.table('notes').orderBy('id').toArray()) as Array<
      Record<string, unknown>
    >;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: 'n1',
      title: 'Ship it',
      body: 'Almost',
      pinned: false,
      priority: 'normal',
    });
    expect(rows[1]).toMatchObject({ id: 'n2', pinned: false, priority: 'normal' });
    expect(rows.every((r) => r.pinned === false && r.priority === 'normal')).toBe(true);
    db2.close();

    // Stable re-diff
    expect(JSON.stringify(diffBlueprints(prev, next)?.ops)).toBe(
      JSON.stringify(diffBlueprints(prev, next)?.ops)
    );
    void v2;
  });

  it('adds a new entity table without touching existing ones', async () => {
    const prev = parseBlueprint(baseNotes());
    const next = parseBlueprint({
      ...baseNotes(),
      entities: [
        ...(baseNotes().entities ?? []),
        {
          name: 'tag',
          plural: 'tags',
          fields: [{ name: 'label', kind: 'text', required: true }],
          titleField: 'label',
        },
      ],
    });
    const migration = diffBlueprints(prev, next);
    expect(migration?.stores).toEqual({ tags: deriveStores(next).tags });
    expect(migration?.ops).toEqual([]);

    const v1: DatabaseVersion = { version: 1, stores: deriveStores(prev) };
    const store = backend();
    const db1 = await openPrototypeDatabase(source([v1], 'notes-add-entity'), store);
    await db1.table('notes').add({
      id: 'n1',
      title: 'Keep me',
      body: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    db1.close();

    const db2 = await openPrototypeDatabase(
      source(appendMigration([v1], migration), 'notes-add-entity'),
      store
    );
    expect(await db2.table('notes').count()).toBe(1);
    expect(db2.hasTable('tags')).toBe(true);
    expect(await db2.table('tags').count()).toBe(0);
    db2.close();
  });

  it('refuses table and field drops without allowDrop', () => {
    const prev = parseBlueprint(baseNotes());
    const withoutNotes = parseBlueprint({
      formatVersion: 1,
      name: 'Empty-ish',
      entities: [
        {
          name: 'label',
          plural: 'labels',
          fields: [{ name: 'name', kind: 'text', required: true }],
          titleField: 'name',
        },
      ],
      roles: [{ name: 'owner', permissions: { '*': ['*'] } }],
    });
    expect(() => diffBlueprints(prev, withoutNotes)).toThrow(MigrationError);
    expect(() => diffBlueprints(prev, withoutNotes)).toThrow(/allowDrop/);

    const droppedBody = parseBlueprint({
      ...baseNotes(),
      entities: [
        {
          name: 'note',
          plural: 'notes',
          fields: [{ name: 'title', kind: 'text', required: true }],
          titleField: 'title',
        },
      ],
    });
    expect(() => diffBlueprints(prev, droppedBody)).toThrow(/field "body"/);

    const allowed = diffBlueprints(prev, withoutNotes, { allowDrop: true });
    expect(allowed?.stores.notes).toBeNull();
    expect(allowed?.stores.labels).toBe(deriveStores(withoutNotes).labels);
  });

  it('renames a field via renamedFrom and preserves values', async () => {
    const prev = parseBlueprint(baseNotes());
    const next = parseBlueprint({
      ...baseNotes(),
      entities: [
        {
          name: 'note',
          plural: 'notes',
          fields: [
            { name: 'headline', kind: 'text', required: true },
            { name: 'body', kind: 'longText', default: '' },
          ],
          titleField: 'headline',
        },
      ],
    });
    const migration = diffBlueprints(prev, next, {
      renamedFrom: { fields: { 'notes.headline': 'title' } },
    });
    expect(migration?.ops).toContainEqual({
      op: 'renameField',
      table: 'notes',
      from: 'title',
      to: 'headline',
    });

    const v1: DatabaseVersion = { version: 1, stores: deriveStores(prev) };
    const store = backend();
    const db1 = await openPrototypeDatabase(source([v1], 'notes-rename'), store);
    await db1.table('notes').add({
      id: 'n1',
      title: 'Old title',
      body: 'x',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    db1.close();

    const db2 = await openPrototypeDatabase(
      source(appendMigration([v1], migration), 'notes-rename'),
      store
    );
    const row = (await db2.table('notes').get('n1')) as Record<string, unknown>;
    expect(row.headline).toBe('Old title');
    expect(row.title).toBeUndefined();
    db2.close();
  });

  it('enables softDelete with a deletedAt backfill', () => {
    const prev = parseBlueprint(baseNotes());
    const nextInput = baseNotes();
    const entity = nextInput.entities?.[0] as Record<string, unknown>;
    entity.features = { softDelete: true };
    const next = parseBlueprint(nextInput);
    const migration = diffBlueprints(prev, next);
    expect(migration?.ops).toContainEqual({
      op: 'backfill',
      table: 'notes',
      field: 'deletedAt',
      value: null,
    });
    expect(migration?.stores.notes).toContain('deletedAt');
  });
});

describe('defaultForField', () => {
  it('prefers declared defaults and kind fallbacks', () => {
    const withBool = parseBlueprint({
      ...baseNotes(),
      entities: [
        {
          name: 'note',
          plural: 'notes',
          fields: [
            { name: 'title', kind: 'text', required: true },
            { name: 'flag', kind: 'boolean', default: true },
            { name: 'labels', kind: 'tags' },
            { name: 'level', kind: 'enum', values: ['a'], default: 'a' },
          ],
          titleField: 'title',
        },
      ],
    });
    const fields = Object.fromEntries(withBool.entities[0]!.fields.map((f) => [f.name, f]));
    expect(defaultForField(fields.flag!)).toBe(true);
    expect(defaultForField(fields.labels!)).toEqual([]);
    expect(defaultForField(fields.level!)).toBe('a');
  });
});
