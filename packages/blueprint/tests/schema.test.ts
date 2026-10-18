import { describe, expect, it } from 'vitest';
import committedJsonSchema from '../schema/blueprint.schema.json' with { type: 'json' };
import {
  type BlueprintInput,
  blueprintJsonSchema,
  entityTable,
  FIELD_KINDS,
  parseBlueprint,
  safeParseBlueprint,
} from '../src/index.ts';

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
          { name: 'healthScore', kind: 'number', min: 0, max: 1 },
          { name: 'vip', kind: 'boolean', default: false },
          { name: 'metadata', kind: 'json' },
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
    expect(bp.screens).toHaveLength(5);
  });

  it('covers every field kind in the fixture', () => {
    const used = new Set(fixture().entities.flatMap((e) => e.fields.map((f) => f.kind)));
    expect([...used].sort()).toEqual([...FIELD_KINDS].sort());
  });

  it('derives table names from the plural unless set', () => {
    expect(entityTable({ plural: 'support-tickets' })).toBe('supportTickets');
    expect(entityTable({ plural: 'customers', table: 'clients' })).toBe('clients');
  });

  it.each([
    [
      'unknown relation target',
      (bp: Mutable) => {
        ticket(bp).fields[3] = { name: 'customer', kind: 'relation', to: 'client' };
      },
      'entities.1.fields.3.to: relation "support-ticket.customer" targets unknown entity "client"',
    ],
    [
      'missing titleField',
      (bp: Mutable) => {
        ticket(bp).titleField = 'headline';
      },
      'entities.1.titleField: titleField "headline" is not a field of "support-ticket"',
    ],
    [
      'non text-like titleField',
      (bp: Mutable) => {
        ticket(bp).titleField = 'refund';
      },
      'entities.1.titleField: titleField "refund" must be a text-like field, not money',
    ],
    [
      'empty enum',
      (bp: Mutable) => {
        (ticket(bp).fields[2] as Record<string, unknown>).values = [];
        delete (ticket(bp).fields[2] as Record<string, unknown>).default;
      },
      'entities.1.fields.2.values: enum fields need at least one value',
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
      'duplicate field',
      (bp: Mutable) => {
        ticket(bp).fields.push({ name: 'subject', kind: 'text' });
      },
      'entities.1.fields.11.name: duplicate field "subject"',
    ],
    [
      'unknown field kind',
      (bp: Mutable) => {
        ticket(bp).fields.push({ name: 'color', kind: 'colour' });
      },
      `entities.1.fields.11.kind: Invalid discriminator value. Expected ${FIELD_KINDS.map((k) => `'${k}'`).join(' | ')}`,
    ],
    [
      'unknown property (strict)',
      (bp: Mutable) => {
        ticket(bp).color = 'red';
      },
      'entities.1: Unrecognized key: "color"',
    ],
    [
      'non-kebab entity name',
      (bp: Mutable) => {
        ticket(bp).name = 'SupportTicket';
      },
      'entities.1.name: entity name must be lowercase kebab-case',
    ],
    [
      'ownerField not a persona',
      (bp: Mutable) => {
        ticket(bp).ownerField = 'subject';
      },
      'entities.1.ownerField: ownerField "subject" must be a persona field of "support-ticket"',
    ],
    [
      'required relation with nullify',
      (bp: Mutable) => {
        (ticket(bp).fields[3] as Record<string, unknown>).onDelete = 'nullify';
      },
      'entities.1.fields.3.onDelete: required relation "customer" cannot use onDelete "nullify"',
    ],
    [
      'role on unknown entity',
      (bp: Mutable) => {
        (bp.roles[1] as { permissions: Record<string, string[]> }).permissions.invoice = ['read'];
      },
      'roles.1.permissions.invoice: unknown entity "invoice"',
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
      'unknown action',
      (bp: Mutable) => {
        (bp.roles[2] as { permissions: Record<string, string[]> }).permissions['*'] = ['approve'];
      },
      'roles.2.permissions.*.0: denials must name an exact capability such as "-ticket:delete"',
    ],
    [
      'board groupBy is not an enum',
      (bp: Mutable) => {
        (bp.screens[1] as Record<string, unknown>).groupBy = 'subject';
      },
      'screens.1.groupBy: groupBy "subject" must be an enum field of "support-ticket"',
    ],
    [
      'list column unknown',
      (bp: Mutable) => {
        (bp.screens[0] as { columns: string[] }).columns.push('priority');
      },
      'screens.0.columns.3: unknown field "priority"',
    ],
    [
      'dashboard sum on a text field',
      (bp: Mutable) => {
        (bp.screens[4] as { metrics: Array<Record<string, unknown>> }).metrics[1] = {
          label: 'Bad',
          entity: 'support-ticket',
          aggregate: 'sum',
          field: 'subject',
        };
      },
      'screens.4.metrics.1.field: sum needs a number, integer or money field',
    ],
    [
      'files feature without a file field',
      (bp: Mutable) => {
        (bp.entities[0] as Record<string, unknown>).features = { files: true };
      },
      'entities.0.features.files: features.files needs at least one file field on "customer"',
    ],
    [
      'duplicate entity name',
      (bp: Mutable) => {
        bp.entities.push({ ...structuredClone(bp.entities[0]), plural: 'clients' } as never);
      },
      'entities.2.name: duplicate entity name "customer"',
    ],
  ])('rejects %s with a path-specific message', (_label, mutate, expected) => {
    expect(issuesAfter(mutate)).toContain(expected);
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
  it('is up to date with the zod schema', () => {
    // Regenerate with the command in packages/blueprint/README.md.
    expect(committedJsonSchema).toEqual(blueprintJsonSchema());
  });

  it('describes the input shape with defaults optional', () => {
    const schema = blueprintJsonSchema() as {
      $schema: string;
      $id: string;
      required: string[];
      additionalProperties: boolean;
    };
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema.$id).toBe('https://github.com/DailybotHQ/protoyard/schema/blueprint/v1');
    expect(schema.required.sort()).toEqual(['entities', 'formatVersion', 'name', 'roles']);
    expect(schema.additionalProperties).toBe(false);
  });
});
