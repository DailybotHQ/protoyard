import { PermissionDeniedError, type PrototypeRuntime, type Row } from '@protoyard/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createBlueprintDefinition,
  helpdeskBlueprint,
} from '../../../tests/fixtures/blueprint-prototype.ts';
import { createHarness } from '../../../tests/support/runtime.ts';
import {
  createEntityServices,
  type EntityServices,
  ImportCsvError,
  parseBlueprint,
} from '../src/index.ts';

let harness = createHarness(createBlueprintDefinition());
beforeEach(() => {
  harness = createHarness(createBlueprintDefinition());
});
afterEach(() => harness.closeAll());

interface Table {
  toArray(): Promise<Row[]>;
  count(): Promise<number>;
  where(index: string): { equals(value: string): { count(): Promise<number> } };
}
const table = (runtime: PrototypeRuntime, name: string) =>
  (runtime.db as { table(name: string): Table }).table(name);
const rows = (runtime: PrototypeRuntime, name: string) => table(runtime, name).toArray();

async function boot(
  scenario = 'owner'
): Promise<{ runtime: PrototypeRuntime; services: EntityServices }> {
  const runtime = await harness.boot(scenario);
  return { runtime, services: createEntityServices(runtime, helpdeskBlueprint) };
}

async function world(runtime: PrototypeRuntime) {
  const names = ['customers', 'tickets', 'invoices', 'notes', 'auditEntries'];
  return JSON.stringify(
    await Promise.all(
      names.map(async (n) => {
        try {
          return await rows(runtime, n);
        } catch {
          return [];
        }
      })
    )
  );
}

/** Help desk with audit on ticket so import batches leave audit rows. */
const auditedBlueprint = parseBlueprint({
  formatVersion: 1,
  name: 'Help desk with audit',
  entities: helpdeskBlueprint.entities.map((entity) =>
    entity.name === 'ticket'
      ? {
          ...entity,
          features: { ...entity.features, audit: true, csv: true },
        }
      : entity
  ),
  roles: helpdeskBlueprint.roles,
});

describe('entity CSV export', () => {
  it('exports visible rows as CSV text for an owner', async () => {
    const { services } = await boot();
    const exportCsv = services.customer!.exportCsv;
    const csv = await exportCsv();
    expect(csv).toMatch(/^Name,Email,Account manager/i);
    expect(csv).toContain('Customer 1');
    expect(csv).toContain('customer1@example.com');
    // Filter by id keeps a single row.
    const [first] = await services.customer!.list();
    const one = await services.customer!.exportCsv({ ids: [first!.id] });
    const dataLines = one.trim().split(/\r?\n/).slice(1).filter(Boolean);
    expect(dataLines).toHaveLength(1);
    expect(dataLines[0]).toContain(String(first!.name));
  });

  it('denies a viewer export and import', async () => {
    const { runtime, services } = await boot('viewer');
    const before = await world(runtime);
    await expect(services.customer!.exportCsv()).rejects.toMatchObject({
      capability: 'customer:export',
    });
    await expect(
      services.customer!.importCsv('Name,Email\nAcme Example,ops@example.com\n', {
        mode: 'commit',
      })
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(await world(runtime)).toBe(before);
  });
});

describe('entity CSV import', () => {
  it('preview validates without writing; commit is all-or-nothing unless skipInvalid', async () => {
    const { runtime, services } = await boot();
    const before = await world(runtime);
    const customer = (await services.customer!.list())[0]!;

    const bad = [
      'Subject,Status,Customer,Assignee,Labels',
      'OK ticket,open,customer_0001,,',
      'ab,open,customer_0001,,',
      'Ghost customer,open,No Such Co,,',
    ].join('\r\n');

    const preview = await services.ticket!.importCsv(bad, { mode: 'preview' });
    expect(preview.mode).toBe('preview');
    expect(preview.created).toEqual([]);
    expect(preview.rowCount).toBe(3);
    expect(preview.valid.length).toBe(1);
    expect(preview.errors.length).toBeGreaterThan(0);
    expect(await world(runtime)).toBe(before);

    await expect(services.ticket!.importCsv(bad, { mode: 'commit' })).rejects.toBeInstanceOf(
      ImportCsvError
    );
    expect(await world(runtime)).toBe(before);

    const skipped = await services.ticket!.importCsv(bad, {
      mode: 'commit',
      skipInvalid: true,
    });
    expect(skipped.mode).toBe('commit');
    expect(skipped.created).toHaveLength(1);
    expect(skipped.created[0]).toMatchObject({
      subject: 'OK ticket',
      customerId: customer.id,
      status: 'open',
    });
    expect(await services.ticket!.get(skipped.created[0]!.id)).toMatchObject({
      subject: 'OK ticket',
    });
  });

  it('resolves relation columns by title and writes nothing when offline', async () => {
    const { runtime, services } = await boot();
    const customer = await services.customer!.create({ name: 'Northwind CSV Co' });
    const byTitle = [
      'Subject,Status,Customer,Assignee,Labels',
      'Title resolved,open,Northwind CSV Co,,vip',
    ].join('\r\n');
    const result = await services.ticket!.importCsv(byTitle, { mode: 'commit' });
    expect(result.created).toHaveLength(1);
    expect(result.created[0]).toMatchObject({
      subject: 'Title resolved',
      customerId: customer.id,
      labels: ['vip'],
    });

    const after = await world(runtime);
    await runtime.overrides.set({ environment: { network: 'offline' } });
    await expect(
      services.ticket!.importCsv(
        'Subject,Status,Customer,Assignee,Labels\nOffline row,open,Northwind CSV Co,,\n',
        { mode: 'commit' }
      )
    ).rejects.toMatchObject({ code: 'offline' });
    expect(await world(runtime)).toBe(after);
  });

  it('writes one audit row per imported record when features.audit is on', async () => {
    const { definePrototype, parseManifest } = await import('@protoyard/core');
    const { deriveIntegrity, derivePolicy, deriveStores } = await import('../src/index.ts');
    const { blueprintScenarios, REFERENCE_TIME } = await import(
      '../../../tests/fixtures/blueprint-prototype.ts'
    );
    const { generateTeam } = await import('@protoyard/scenarios');
    const auditedDef = definePrototype({
      manifest: parseManifest({
        id: 'example.blueprint-csv-audit',
        slug: 'blueprint-csv-audit',
        name: 'Blueprint CSV audit',
        version: '0.1.0',
        defaultScenario: 'owner',
        storage: { namespace: 'blueprint-csv-audit', schemaVersion: 1 },
        scenarios: blueprintScenarios.map((s) => s.id as string),
      }),
      database: { versions: [{ version: 1, stores: deriveStores(auditedBlueprint) }] },
      scenarios: blueprintScenarios,
      policy: derivePolicy(auditedBlueprint),
      integrity: deriveIntegrity(auditedBlueprint),
      generatorVersion: 1,
      generate(ctx) {
        const team = generateTeam(ctx);
        const at = REFERENCE_TIME;
        const stamp = { createdAt: at, updatedAt: at };
        const customers: Row[] = [
          {
            id: ctx.ids.next('customer'),
            name: 'Audit Customer',
            email: 'audit@example.com',
            accountManagerId: team.personas[0]!.id,
            ...stamp,
          },
        ];
        return {
          organizations: team.organizations,
          personas: team.personas,
          memberships: team.memberships,
          tables: { customers, tickets: [], invoices: [], notes: [] },
        };
      },
    });
    const local = createHarness(auditedDef);
    try {
      const runtime = await local.boot('owner');
      const services = createEntityServices(runtime, auditedBlueprint);
      const customer = (await services.customer!.list())[0]!;
      const csv = [
        'Subject,Status,Customer,Assignee,Labels',
        `Audit one,open,${customer.id},,`,
        `Audit two,pending,${customer.id},,`,
      ].join('\r\n');
      const result = await services.ticket!.importCsv(csv, { mode: 'commit' });
      expect(result.created).toHaveLength(2);
      expect(result.auditIds).toHaveLength(2);
      const audits = await rows(runtime, 'auditEntries');
      expect(audits).toHaveLength(2);
      expect(audits.every((a) => a.action === 'import' && a.entity === 'ticket')).toBe(true);
      expect(audits.map((a) => a.recordId).sort()).toEqual(result.created.map((r) => r.id).sort());
    } finally {
      await local.closeAll();
    }
  });
});
