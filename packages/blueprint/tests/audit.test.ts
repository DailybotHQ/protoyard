import {
  PermissionDeniedError,
  type PrototypeDefinition,
  type PrototypeRuntime,
  type Row,
  ValidationError,
} from '@protoyard/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createBlueprintDefinition,
  helpdeskBlueprint,
} from '../../../tests/fixtures/blueprint-prototype.ts';
import { createHarness } from '../../../tests/support/runtime.ts';
import {
  AUDIT_REDACTED,
  auditDiff,
  type Blueprint,
  createAuditService,
  createEntityServices,
  deriveStores,
  FEATURE_TABLES,
  parseBlueprint,
} from '../src/index.ts';

/** Help desk with audit on tickets and a sensitive note field on customers. */
const auditedBlueprint: Blueprint = parseBlueprint({
  formatVersion: 1,
  name: 'Audited help desk',
  entities: helpdeskBlueprint.entities.map((entity) => {
    if (entity.name === 'ticket') {
      return {
        ...entity,
        features: { ...entity.features, audit: true },
      };
    }
    if (entity.name === 'customer') {
      return {
        ...entity,
        fields: [...entity.fields, { name: 'ssn', kind: 'text', sensitive: true, maxLength: 20 }],
        features: { ...entity.features, audit: true },
      };
    }
    return entity;
  }),
  roles: helpdeskBlueprint.roles,
});

function definition(): PrototypeDefinition {
  const base = createBlueprintDefinition('blueprint-audit');
  return {
    ...base,
    database: { versions: [{ version: 1, stores: deriveStores(auditedBlueprint) }] },
    // Keep generator/policy from base; tables still match entity names.
  };
}

let harness = createHarness(definition());
beforeEach(() => {
  harness = createHarness(definition());
});
afterEach(() => harness.closeAll());

interface Table {
  toArray(): Promise<Row[]>;
  count(): Promise<number>;
}
const table = (runtime: PrototypeRuntime, name: string) =>
  (runtime.db as { table(name: string): Table }).table(name);
const rows = (runtime: PrototypeRuntime, name: string) => table(runtime, name).toArray();

async function boot(scenario = 'owner') {
  const runtime = await harness.boot(scenario);
  return {
    runtime,
    services: createEntityServices(runtime, auditedBlueprint),
    audit: createAuditService(runtime, auditedBlueprint),
  };
}

describe('auditDiff', () => {
  it('lists only changed fields and redacts sensitive values', () => {
    const customer = auditedBlueprint.entities.find((e) => e.name === 'customer')!;
    const before = {
      id: 'c1',
      name: 'Acme',
      email: 'a@example.com',
      ssn: '123-45-6789',
      accountManagerId: 'user_1',
    };
    const after = {
      ...before,
      name: 'Acme Corp',
      ssn: '999-99-9999',
      email: 'a@example.com',
    };
    expect(auditDiff(customer, before, after)).toEqual({
      name: { before: 'Acme', after: 'Acme Corp' },
      ssn: { before: AUDIT_REDACTED, after: AUDIT_REDACTED },
    });
  });
});

describe('entity audit log', () => {
  it('writes an audit row in the same transaction as create and update', async () => {
    const { runtime, services, audit } = await boot();
    const customer = await services.customer!.create({
      name: 'Northwind',
      ssn: '111-22-3333',
    });
    const history = await audit.listForRecord('customer', customer.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      entity: 'customer',
      recordId: customer.id,
      actorId: runtime.session.principal()?.persona.id,
      action: 'create',
      at: runtime.clock.now().toISOString(),
    });
    expect(history[0]!.changes.ssn).toEqual({ before: null, after: AUDIT_REDACTED });
    expect(history[0]!.changes.name).toEqual({ before: null, after: 'Northwind' });

    await services.customer!.update(customer.id, { name: 'Northwind LLC' });
    const afterUpdate = await audit.listForRecord('customer', customer.id);
    expect(afterUpdate).toHaveLength(2);
    expect(afterUpdate[0]!.action).toBe('update');
    expect(afterUpdate[0]!.changes).toEqual({
      name: { before: 'Northwind', after: 'Northwind LLC' },
    });

    // Stored table is the shared feature table.
    expect(await table(runtime, FEATURE_TABLES.audit).count()).toBe(2);
  });

  it('writes a delete audit row and keeps history readable', async () => {
    const { services, audit } = await boot();
    const ticket = await services.ticket!.create({
      subject: 'Printer jam',
      customerId: 'customer_0001',
    });
    await services.ticket!.remove(ticket.id);
    const history = await audit.listForRecord('ticket', ticket.id);
    expect(history.map((h) => h.action)).toEqual(['delete', 'create']);
    expect(history[0]!.action).toBe('delete');
    expect(history[0]!.changes.subject).toEqual({ before: 'Printer jam', after: null });
    expect(await services.ticket!.get(ticket.id)).toBeUndefined();
  });

  it('writes no audit row when a mutation fails validation or is not found', async () => {
    const { runtime, services } = await boot();
    const beforeCount = await table(runtime, FEATURE_TABLES.audit).count();
    const beforeWorld = JSON.stringify(await rows(runtime, 'tickets'));

    await expect(
      services.ticket!.create({ subject: 'x', customerId: 'customer_0001' })
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      services.ticket!.create({ subject: 'Missing customer', customerId: 'customer_9999' })
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      services.ticket!.update('ticket_missing', { status: 'open' })
    ).rejects.toBeTruthy();

    expect(await table(runtime, FEATURE_TABLES.audit).count()).toBe(beforeCount);
    expect(JSON.stringify(await rows(runtime, 'tickets'))).toBe(beforeWorld);
  });

  it('writes no audit row when permission is denied', async () => {
    const { runtime, services } = await boot('viewer');
    const beforeCount = await table(runtime, FEATURE_TABLES.audit).count();
    await expect(services.customer!.create({ name: 'Blocked' })).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
    expect(await table(runtime, FEATURE_TABLES.audit).count()).toBe(beforeCount);
  });

  it('does not audit entities without features.audit', async () => {
    const { runtime, services } = await boot();
    await services.note!.create({ body: 'Side note', ticketId: 'ticket_0001' });
    const audits = await rows(runtime, FEATURE_TABLES.audit);
    expect(audits.every((row) => row.entity !== 'note')).toBe(true);
  });

  it('lists recent entries newest first for readers', async () => {
    const { services, audit } = await boot();
    const a = await services.customer!.create({ name: 'A Co' });
    const b = await services.customer!.create({ name: 'B Co' });
    await services.customer!.update(a.id, { name: 'A Company' });
    const recent = await audit.listRecent(10);
    expect(recent.length).toBeGreaterThanOrEqual(3);
    expect(recent[0]).toMatchObject({ recordId: a.id, action: 'update' });
    expect(recent.map((r) => r.recordId)).toEqual(expect.arrayContaining([a.id, b.id]));
    // seq is strictly decreasing in the newest-first list when `at` is shared.
    const seqs = recent.map((r) => r.seq as number);
    expect(seqs).toEqual([...seqs].sort((x, y) => y - x));
  });
});
