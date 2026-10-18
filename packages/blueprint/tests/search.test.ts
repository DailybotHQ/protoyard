import type { Principal, PrototypeRuntime, Row } from '@protoyard/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createBlueprintDefinition,
  helpdeskBlueprint,
} from '../../../tests/fixtures/blueprint-prototype.ts';
import { createHarness } from '../../../tests/support/runtime.ts';
import { derivePolicy } from '../src/policy.ts';
import { type Blueprint, parseBlueprint } from '../src/schema.ts';
import { searchEntities } from '../src/search.ts';
import { deriveIntegrity, deriveStores } from '../src/storage.ts';

const searchBlueprint: Blueprint = parseBlueprint({
  ...helpdeskBlueprint,
  entities: helpdeskBlueprint.entities.map((entity) => {
    if (entity.name === 'customer') {
      return {
        ...entity,
        searchable: ['email'],
        features: { ...entity.features, softDelete: true },
      };
    }
    if (entity.name === 'ticket') return { ...entity, searchable: ['status'] };
    return entity;
  }),
  roles: helpdeskBlueprint.roles.map((role) =>
    role.name === 'member'
      ? {
          ...role,
          permissions: {
            ...role.permissions,
            ticket: ['create', 'update:own', 'delete:own'],
          },
        }
      : role
  ),
});

function definition() {
  const base = createBlueprintDefinition('blueprint-search');
  const policy = derivePolicy(searchBlueprint);
  return {
    ...base,
    database: {
      ...base.database,
      versions: base.database.versions.map((version, index) =>
        index === 0 ? { ...version, stores: deriveStores(searchBlueprint) } : version
      ),
    },
    policy: {
      ...policy,
      rules: {
        ...policy.rules,
        'customer:read': (_principal: Principal, resource: unknown) =>
          resource === undefined || (resource as Row).id !== 'customer_forbidden',
      },
    },
    integrity: deriveIntegrity(searchBlueprint),
  };
}

let harness = createHarness(definition());
beforeEach(() => {
  harness = createHarness(definition());
});
afterEach(() => harness.closeAll());

interface SearchTable {
  bulkPut(rows: Row[]): Promise<unknown>;
}

function table(runtime: PrototypeRuntime, name: string): SearchTable {
  return (runtime.db as { table(name: string): SearchTable }).table(name);
}

async function boot(scenario = 'owner') {
  return harness.boot(scenario);
}

function customer(id: string, name: string, email: string, deletedAt: string | null = null): Row {
  return {
    id,
    name,
    email,
    accountManagerId: 'persona_owner',
    createdAt: '2026-10-17T12:00:00.000Z',
    updatedAt: '2026-10-17T12:00:00.000Z',
    deletedAt,
  };
}

function ticket(id: string, subject: string, status = 'open'): Row {
  return {
    id,
    subject,
    status,
    customerId: 'customer_0001',
    assigneeId: 'persona_owner',
    labels: [],
    createdAt: '2026-10-17T12:00:00.000Z',
    updatedAt: '2026-10-17T12:00:00.000Z',
  };
}

describe('global blueprint entity search', () => {
  it('matches case- and accent-insensitively, ranks title matches first, and caps each entity', async () => {
    const runtime = await boot();
    await table(runtime, 'customers').bulkPut([
      customer('customer_title', 'Café outage', 'unrelated@example.com'),
      customer('customer_email', 'Unrelated profile', 'cafe@example.com'),
      customer('customer_title_2', 'Cafe outage follow-up', 'other@example.com'),
    ]);
    await table(runtime, 'tickets').bulkPut([
      ticket('ticket_title', 'CAFE printer jam'),
      ticket('ticket_status', 'Printer jam', 'cafe-review'),
    ]);

    const matches = await searchEntities(runtime, searchBlueprint, '  CAFE  ');
    expect(matches.map((match) => match.recordId)).toEqual([
      'customer_title',
      'customer_title_2',
      'ticket_title',
      'customer_email',
      'ticket_status',
    ]);
    expect(matches[0]).toMatchObject({
      entityName: 'customer',
      title: 'Café outage',
      matchedFields: ['name'],
      titleMatch: true,
    });

    const capped = await searchEntities(runtime, searchBlueprint, 'cafe', {
      limitPerEntity: 1,
    });
    expect(capped.map((match) => match.recordId)).toEqual(['customer_title', 'ticket_title']);
  });

  it('excludes unreadable entities and soft-deleted rows', async () => {
    const runtime = await boot('member');
    await table(runtime, 'customers').bulkPut([
      customer('customer_visible', 'Visible account', 'cafe-visible@example.com'),
      customer('customer_forbidden', 'Forbidden account', 'cafe-forbidden@example.com'),
      customer(
        'customer_deleted',
        'Deleted cafe account',
        'cafe-deleted@example.com',
        '2026-10-17T12:00:00.000Z'
      ),
    ]);
    await table(runtime, 'tickets').bulkPut([ticket('ticket_private', 'Cafe private ticket')]);

    const matches = await searchEntities(runtime, searchBlueprint, 'cafe');
    expect(matches.map((match) => match.recordId)).toEqual(['customer_visible']);
  });

  // Seeding 16,000 rows dominates the runtime; the search budget itself is the median assertion below.
  it('reports the median search time for a dense 16,000-row world', {
    timeout: 60_000,
  }, async () => {
    const runtime = await boot();
    const denseRows = Array.from({ length: 16_000 }, (_, index) =>
      customer(
        `dense_${String(index).padStart(5, '0')}`,
        `Generated account ${index}`,
        index === 15_999 ? 'needle-token@example.com' : `person${index}@example.com`
      )
    );
    await table(runtime, 'customers').bulkPut(denseRows);

    await searchEntities(runtime, searchBlueprint, 'needle-token');
    const samples: number[] = [];
    for (let index = 0; index < 7; index += 1) {
      const startedAt = performance.now();
      const matches = await searchEntities(runtime, searchBlueprint, 'needle-token');
      samples.push(performance.now() - startedAt);
      expect(matches.map((match) => match.recordId)).toEqual(['dense_15999']);
    }
    const sorted = [...samples].sort((left, right) => left - right);
    const medianMs = sorted[Math.floor(sorted.length / 2)] ?? Number.POSITIVE_INFINITY;
    console.info(`searchEntities 16k-row median: ${medianMs.toFixed(2)} ms`);
    expect(medianMs).toBeLessThan(50);
  });
});
