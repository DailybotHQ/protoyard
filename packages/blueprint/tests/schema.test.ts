import { describe, expect, it } from 'vitest';
import committedJsonSchema from '../schema/blueprint.schema.json' with { type: 'json' };
import { safeParseComputedExpression } from '../src/computed/index.ts';
import {
  type BlueprintInput,
  blueprintJsonSchema,
  FIELD_KINDS,
  parseBlueprint,
  safeParseBlueprint,
} from '../src/index.ts';
import { validateWorkflowDefinition } from '../src/workflows/index.ts';

/** A small fictional help desk that uses every field kind at least once. */
function fixture(): BlueprintInput {
  return {
    formatVersion: 1,
    name: 'Help desk',
    entities: [
      {
        name: 'customer',
        plural: 'customers',
        fields: [
          { name: 'name', kind: 'text', required: true, fake: 'company.name' },
          { name: 'email', kind: 'email' },
          { name: 'website', kind: 'url' },
          { name: 'phone', kind: 'phone' },
          { name: 'seats', kind: 'integer', min: 1, max: 10_000 },
          { name: 'office', kind: 'geo', region: 'metro-grid' },
          { name: 'healthScore', kind: 'number', min: 0, max: 1 },
          { name: 'vip', kind: 'boolean', default: false },
          { name: 'metadata', kind: 'json' },
          { name: 'photo', kind: 'avatar' },
        ],
        titleField: 'name',
        searchable: ['name', 'email'],
      },
      {
        name: 'support-ticket',
        plural: 'support-tickets',
        fields: [
          { name: 'subject', kind: 'text', required: true, maxLength: 120 },
          { name: 'body', kind: 'longText' },
          {
            name: 'status',
            kind: 'enum',
            values: ['open', 'pending', 'solved'],
            default: 'open',
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
          { name: 'refund', kind: 'money', currency: 'EUR', min: 0, default: 0 },
          { name: 'dueOn', kind: 'date' },
          { name: 'firstReplyAt', kind: 'datetime' },
          { name: 'labels', kind: 'tags' },
          {
            name: 'attachments',
            kind: 'file',
            accept: ['image/*', 'application/pdf'],
            multiple: true,
          },
        ],
        titleField: 'subject',
        searchable: ['subject', 'body'],
        ownerField: 'assignee',
        indexes: ['status', 'dueOn'],
        defaultSort: { field: 'dueOn', direction: 'desc' },
        features: { softDelete: true, audit: true, notifications: true, files: true, csv: true },
      },
    ],
    roles: [
      { name: 'owner', permissions: { '*': ['*'] } },
      {
        name: 'agent',
        permissions: {
          customer: ['read', 'create', 'update'],
          'support-ticket': ['read', 'create', 'update:own', 'delete:own', 'export'],
        },
      },
      { name: 'viewer', permissions: { '*': ['read'] } },
    ],
    screens: [
      { type: 'list', entity: 'support-ticket', columns: ['subject', 'status', 'assignee'] },
      { type: 'board', entity: 'support-ticket', groupBy: 'status' },
      { type: 'detail', entity: 'support-ticket' },
      { type: 'form', entity: 'customer', path: '/customers/new' },
      {
        type: 'dashboard',
        title: 'Overview',
        metrics: [
          { label: 'Tickets', entity: 'support-ticket', aggregate: 'count' },
          { label: 'Refunds', entity: 'support-ticket', aggregate: 'sum', field: 'refund' },
        ],
      },
    ],
  };
}

type Mutable = Record<string, unknown> & {
  entities: Array<Record<string, unknown> & { fields: Array<Record<string, unknown>> }>;
  roles: Array<Record<string, unknown>>;
  screens: Array<Record<string, unknown>>;
};

/** Applies a mutation to a fresh fixture and returns its issues as `path: message`. */
function issuesAfter(mutate: (bp: Mutable) => void): string[] {
  const bp = fixture() as unknown as Mutable;
  mutate(bp);
  const result = safeParseBlueprint(bp);
  if (result.success) return [];
  return result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
}

const ticket = (bp: Mutable) => bp.entities[1] as Mutable['entities'][number];

describe('BlueprintSchema', () => {
  it('parses the fixture and applies defaults', () => {
    const bp = parseBlueprint(fixture());
    const [customer, tickets] = bp.entities;
    expect(customer?.features).toEqual({
      softDelete: false,
      audit: false,
      notifications: false,
      files: false,
      csv: false,
    });
    expect(customer?.fields[0]).toMatchObject({ required: true, sensitive: false, maxLength: 200 });
    const refund = tickets?.fields.find((f) => f.name === 'refund');
    expect(refund).toMatchObject({ kind: 'money', currency: 'EUR' });
    const related = tickets?.fields.find((f) => f.name === 'related');
    expect(related).toMatchObject({ cardinality: 'many', onDelete: 'restrict' });
    const customerRelation = tickets?.fields.find((f) => f.name === 'customer');
    expect(customerRelation).toMatchObject({
      kind: 'relation',
      to: 'customer',
      required: true,
      cardinality: 'one',
      onDelete: 'cascade',
    });
    expect(related).toMatchObject({ required: false, cardinality: 'many' });
    expect(bp.screens).toHaveLength(5);
  });

  it('covers every field kind in the fixture', () => {
    const used = new Set(fixture().entities.flatMap((e) => e.fields.map((f) => f.kind)));
    expect([...used].sort()).toEqual([...FIELD_KINDS].sort());
  });

  const REFUSALS: [string, (bp: Mutable) => void, string][] = [
    [
      'unknown relation target',
      (bp: Mutable) => {
        ticket(bp).fields[3] = { name: 'customer', kind: 'relation', to: 'client' };
      },
      'entities.1.fields.3.to: relation "support-ticket.customer" targets unknown entity "client"',
    ],
    [
      'enum default outside values',
      (bp: Mutable) => {
        (ticket(bp).fields[2] as Record<string, unknown>).default = 'closed';
      },
      'entities.1.fields.2.default: default "closed" is not one of open, pending, solved',
    ],
    [
      'reserved py_ table',
      (bp: Mutable) => {
        ticket(bp).table = 'py_tickets';
      },
      'entities.1.table: table "py_tickets" uses the reserved "py_" prefix',
    ],
    [
      'money as a float',
      (bp: Mutable) => {
        (ticket(bp).fields[6] as Record<string, unknown>).default = 12.5;
      },
      'entities.1.fields.6.default: money is integer cents, never a float',
    ],
    [
      'platform-managed field name',
      (bp: Mutable) => {
        ticket(bp).fields.push({ name: 'createdAt', kind: 'datetime' });
      },
      'entities.1.fields.11.name: "createdAt" is managed by the platform and cannot be declared',
    ],
    [
      'unknown property (strict)',
      (bp: Mutable) => {
        ticket(bp).color = 'red';
      },
      'entities.1: Unrecognized key: "color"',
    ],
    [
      ':own action without ownerField',
      (bp: Mutable) => {
        (bp.roles[1] as { permissions: Record<string, string[]> }).permissions.customer = [
          'delete:own',
        ];
      },
      'roles.1.permissions.customer: "delete:own" needs an ownerField on entity "customer"',
    ],
    [
      'board groupBy is not an enum',
      (bp: Mutable) => {
        (bp.screens[1] as Record<string, unknown>).groupBy = 'subject';
      },
      'screens.1.groupBy: groupBy "subject" must be an enum field of "support-ticket"',
    ],
  ];

  it('rejects invalid blueprints with path-specific messages', () => {
    for (const [label, mutate, expected] of REFUSALS) {
      expect(issuesAfter(mutate), label).toContain(expected);
    }
  });

  it('requires at least one entity and one role', () => {
    const issues = issuesAfter((bp) => {
      bp.entities = [];
      bp.roles = [];
      bp.screens = [];
    });
    expect(issues).toEqual([
      'entities: a blueprint needs at least one entity',
      'roles: a blueprint needs at least one role',
    ]);
  });
});

describe('blueprint JSON Schema', () => {
  it('is up to date with the zod schema', async () => {
    // Regenerate with the command in packages/blueprint/README.md.
    expect(committedJsonSchema).toEqual(await blueprintJsonSchema());
  });
});

/** Data in a blueprint is inert: no markup, no executable strings, no secrets in notifications. */
describe('inert blueprint data', () => {
  it('refuses notification markup, unknown or sensitive placeholders, and bails early on hostile titles', () => {
    const base = fixture();
    const notify = (title: string, mutate?: (bp: Mutable) => void) =>
      issuesAfter((bp) => {
        mutate?.(bp);
        bp.notifications = [{ on: 'create', entity: 'support-ticket', notify: 'assignee', title }];
      }).join('\n');
    expect(base.entities[1]?.features?.notifications).toBe(true);
    expect(notify('New {subject}')).toBe('');
    expect(notify('<b>{subject}</b>')).toMatch(/plain text, not HTML/);
    expect(notify('New {missing}')).toMatch(/unknown title placeholder/);
    expect(
      notify('New {subject}', (bp) => {
        (ticket(bp).fields[0] as Record<string, unknown>).sensitive = true;
      })
    ).toMatch(/sensitive field/);
    const started = performance.now();
    expect(notify(`<${'<a'.repeat(20_000)}`)).not.toBe('');
    expect(performance.now() - started).toBeLessThan(100);
  });

  it('treats code-like values as data and refuses executable workflow and computed properties', () => {
    const blueprint = parseBlueprint(fixture());
    const workflow = {
      entity: 'support-ticket',
      field: 'status',
      initialState: 'open',
      states: [
        { id: 'open', label: 'Open' },
        { id: 'pending', label: 'Pending' },
        { id: 'solved', label: 'Solved' },
      ],
      transitions: [{ from: 'open', to: 'pending' }],
    };
    expect(validateWorkflowDefinition(workflow, blueprint)).toMatchObject({ valid: true });
    const executable = validateWorkflowDefinition(
      { ...workflow, transitions: [{ from: 'open', to: 'pending', run: 'return true' }] } as never,
      blueprint
    );
    expect(executable.valid).toBe(false);
    expect(safeParseComputedExpression({ op: 'literal', value: '(() => globalThis)()' })).toEqual({
      success: true,
      data: { op: 'literal', value: '(() => globalThis)()' },
    });
    const injected = safeParseComputedExpression({
      op: 'call',
      source: 'globalThis.process.exit()',
    });
    expect(injected.success).toBe(false);
    if (!injected.success) {
      expect(injected.diagnostics[0]?.hint).toContain('executable strings are not expressions');
    }
    let deep: unknown = { op: 'literal', value: 1 };
    for (let index = 0; index < 40; index += 1) {
      deep = { op: 'add', left: deep, right: { op: 'literal', value: 1 } };
    }
    const bounded = safeParseComputedExpression(deep);
    expect(bounded.success).toBe(false);
    if (!bounded.success) expect(bounded.diagnostics[0]?.code).toBe('expression-too-deep');
  });
});
