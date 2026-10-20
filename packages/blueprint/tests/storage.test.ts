import { parseScenario } from '@protoyard/core';
import { openPrototypeDatabase } from '@protoyard/database';
import { createGenerateContext, generateTeam, validateWorld } from '@protoyard/scenarios';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  type BlueprintInput,
  deriveIntegrity,
  deriveStores,
  entityStoreString,
  entityTable,
  FEATURE_TABLES,
  parseBlueprint,
  storeIndexForField,
} from '../src/index.ts';

const REF = '2026-06-01T09:00:00.000Z';

/** Help-desk fixture with relations, persona, tags, soft-delete and feature tables. */
function fixture(): BlueprintInput {
  return {
    formatVersion: 1,
    name: 'Help desk',
    entities: [
      {
        name: 'customer',
        plural: 'customers',
        fields: [
          { name: 'name', kind: 'text', required: true },
          { name: 'industry', kind: 'enum', values: ['saas', 'agency'] },
          { name: 'tags', kind: 'tags' },
        ],
        titleField: 'name',
        indexes: ['industry'],
      },
      {
        name: 'support-ticket',
        plural: 'support-tickets',
        fields: [
          { name: 'subject', kind: 'text', required: true },
          {
            name: 'status',
            kind: 'enum',
            values: ['open', 'pending', 'solved'],
            required: true,
          },
          {
            name: 'customer',
            kind: 'relation',
            to: 'customer',
            required: true,
            onDelete: 'cascade',
          },
          { name: 'related', kind: 'relation', to: 'support-ticket', cardinality: 'many' },
          { name: 'assignee', kind: 'persona' },
          { name: 'dueOn', kind: 'date' },
          { name: 'labels', kind: 'tags' },
          {
            name: 'attachments',
            kind: 'file',
            accept: ['image/*'],
            multiple: true,
          },
        ],
        titleField: 'subject',
        ownerField: 'assignee',
        indexes: ['status'],
        defaultSort: { field: 'dueOn', direction: 'desc' },
        features: { softDelete: true, audit: true, notifications: true, files: true, csv: true },
      },
    ],
    roles: [{ name: 'owner', permissions: { '*': ['*'] } }],
  };
}

const backend = () => ({
  indexedDB: new IDBFactory() as unknown as globalThis.IDBFactory,
  IDBKeyRange: IDBKeyRange as unknown as typeof globalThis.IDBKeyRange,
});

describe('storeIndexForField', () => {
  it('maps relation, persona, tags and file fields to Dexie index tokens', () => {
    const bp = parseBlueprint(fixture());
    const ticket = bp.entities[1]!;
    const byName = Object.fromEntries(ticket.fields.map((f) => [f.name, f]));
    expect(storeIndexForField(byName.customer!)).toBe('customerId');
    expect(storeIndexForField(byName.related!)).toBe('*relatedIds');
    expect(storeIndexForField(byName.assignee!)).toBe('assigneeId');
    expect(storeIndexForField(byName.labels!)).toBe('*labels');
    expect(storeIndexForField(byName.attachments!)).toBe('*attachmentsIds');
    expect(storeIndexForField(byName.subject!)).toBeUndefined();
  });

  it('stores each relation on its declaring entity and keeps one/many shape stable', () => {
    const stores = deriveStores(parseBlueprint(fixture()));
    expect(stores.supportTickets).toContain('customerId');
    expect(stores.supportTickets).toContain('*relatedIds');
    expect(stores.customers).not.toContain('supportTicket');
  });
});

describe('deriveStores', () => {
  it('builds deterministic Dexie store strings with stable column order', () => {
    const bp = parseBlueprint(fixture());
    const once = deriveStores(bp);
    const twice = deriveStores(parseBlueprint(fixture()));
    expect(JSON.stringify(once)).toBe(JSON.stringify(twice));

    expect(once.customers).toBe('id, *tags, industry, name, createdAt, updatedAt');
    expect(once.supportTickets).toBe(
      'id, customerId, *relatedIds, assigneeId, *labels, *attachmentsIds, status, subject, dueOn, createdAt, updatedAt, deletedAt'
    );
    expect(once[FEATURE_TABLES.audit]).toBe('id, entity, recordId, actorId, action, at');
    expect(once[FEATURE_TABLES.files]).toBe('id, ownerId, entity, recordId, createdAt');
    expect(once[FEATURE_TABLES.notifications]).toBe(
      'id, personaId, readAt, [personaId+readAt], createdAt'
    );

    // Feature tables only appear when at least one entity opts in.
    const bare = parseBlueprint({
      formatVersion: 1,
      name: 'Bare',
      entities: [
        {
          name: 'note',
          plural: 'notes',
          fields: [{ name: 'title', kind: 'text', required: true }],
          titleField: 'title',
        },
      ],
      roles: [{ name: 'owner', permissions: { '*': ['*'] } }],
    });
    expect(deriveStores(bare)).toEqual({
      notes: 'id, title, createdAt, updatedAt',
    });
  });

  it('opens the derived stores on a real PrototypeDatabase (fake-indexeddb)', async () => {
    const bp = parseBlueprint(fixture());
    const stores = deriveStores(bp);
    const db = await openPrototypeDatabase(
      {
        manifest: { storage: { namespace: 'blueprint-storage-test', schemaVersion: 1 } },
        database: { versions: [{ version: 1, stores }] },
      },
      backend()
    );

    const domain = Object.keys(stores).sort();
    for (const name of domain) {
      expect(db.hasTable(name)).toBe(true);
    }
    // Reserved platform tables still merge in.
    expect(db.hasTable('py_personas')).toBe(true);

    await db.table('customers').add({
      id: 'cust_0001',
      name: 'Acme Example',
      industry: 'saas',
      tags: ['vip'],
      createdAt: REF,
      updatedAt: REF,
    });
    await db.table('supportTickets').add({
      id: 'tkt_0001',
      subject: 'Cannot login',
      status: 'open',
      customerId: 'cust_0001',
      relatedIds: [],
      assigneeId: 'user_0001',
      labels: ['billing'],
      attachmentsIds: [],
      dueOn: '2026-05-20',
      createdAt: REF,
      updatedAt: REF,
      deletedAt: null,
    });
    await db.table(FEATURE_TABLES.audit).add({
      id: 'aud_0001',
      entity: 'support-ticket',
      recordId: 'tkt_0001',
      actorId: 'user_0001',
      action: 'create',
      at: REF,
    });

    expect(await db.table('customers').where('industry').equals('saas').count()).toBe(1);
    expect(await db.table('supportTickets').where('customerId').equals('cust_0001').count()).toBe(
      1
    );
    expect(await db.table('customers').where('tags').equals('vip').count()).toBe(1);
    expect(await db.table(FEATURE_TABLES.audit).where('actorId').equals('user_0001').count()).toBe(
      1
    );

    db.close();
  });
});

describe('deriveIntegrity', () => {
  it('maps relations and personas and catches a dangling foreign key', () => {
    const bp = parseBlueprint(fixture());
    const integrity = deriveIntegrity(bp);

    expect(integrity.relations?.customers).toBeUndefined();
    expect(integrity.relations?.supportTickets).toEqual({
      customerId: 'customers',
      relatedIds: 'supportTickets',
      assigneeId: 'py_personas',
      attachmentsIds: FEATURE_TABLES.files,
    });
    expect(integrity.relations?.[FEATURE_TABLES.audit]).toEqual({ actorId: 'py_personas' });
    expect(integrity.timestamps?.supportTickets).toEqual([
      'createdAt',
      'updatedAt',
      'dueOn',
      'deletedAt',
    ]);

    const team = generateTeam(
      createGenerateContext(
        parseScenario({ id: 'demo', name: 'Demo', seed: 42, referenceTime: REF })
      )
    );
    const actorId = team.personas[0]?.id ?? 'user_0001';
    // Timestamps must sit between org creation and the scenario reference time.
    const at = team.organization.createdAt;
    const world = {
      ...team,
      tables: {
        customers: [
          {
            id: 'cust_0001',
            name: 'Acme',
            industry: 'saas',
            tags: [],
            createdAt: at,
            updatedAt: at,
          },
        ],
        supportTickets: [
          {
            id: 'tkt_0001',
            subject: 'Broken link',
            status: 'open',
            customerId: 'cust_missing',
            relatedIds: [],
            assigneeId: actorId,
            labels: [],
            attachmentsIds: [],
            dueOn: at,
            createdAt: at,
            updatedAt: at,
          },
        ],
        [FEATURE_TABLES.files]: [],
        [FEATURE_TABLES.audit]: [],
        [FEATURE_TABLES.notifications]: [],
      },
    };

    const violations = validateWorld(world, { ...integrity, referenceTime: REF });
    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'supportTickets',
          rowId: 'tkt_0001',
          field: 'customerId',
          message: expect.stringMatching(/cust_missing/),
        }),
      ])
    );
    expect(
      validateWorld(
        {
          ...world,
          tables: {
            ...world.tables,
            supportTickets: [{ ...world.tables.supportTickets[0]!, customerId: 'cust_0001' }],
          },
        },
        { ...integrity, referenceTime: REF }
      )
    ).toEqual([]);
  });

  it('is deterministic across parses', () => {
    const a = deriveIntegrity(parseBlueprint(fixture()));
    const b = deriveIntegrity(parseBlueprint(fixture()));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('entityStoreString helpers', () => {
  it('uses the entity table name and skips feature stores when features are off', () => {
    const bp = parseBlueprint(fixture());
    expect(entityTable(bp.entities[0]!)).toBe('customers');
    expect(entityStoreString(bp.entities[0]!)).toBe(deriveStores(bp).customers);
  });
});
