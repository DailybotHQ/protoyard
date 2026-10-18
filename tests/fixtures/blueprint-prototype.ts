import {
  definePrototype,
  type PrototypeDefinition,
  parseManifest,
  type Row,
  type ScenarioInput,
} from '@protoyard/core';
import { generateTeam } from '@protoyard/scenarios';
import {
  deriveIntegrity,
  derivePolicy,
  deriveStores,
  parseBlueprint,
} from '../../packages/blueprint/src/index.ts';

/**
 * A small help desk described only by a blueprint: every table, the policy
 * and the integrity rules are derived from it. Relations exercise each
 * `onDelete` rule: deleting a customer cascades to its tickets, is blocked
 * by its invoices (restrict), and clears the ticket link on notes (nullify).
 */
export const helpdeskBlueprint = parseBlueprint({
  formatVersion: 1,
  name: 'Help desk fixture',
  entities: [
    {
      name: 'customer',
      plural: 'customers',
      fields: [
        { name: 'name', kind: 'text', required: true, minLength: 2 },
        { name: 'email', kind: 'email' },
        { name: 'accountManager', kind: 'persona' },
      ],
      titleField: 'name',
      ownerField: 'accountManager',
    },
    {
      name: 'ticket',
      plural: 'tickets',
      fields: [
        { name: 'subject', kind: 'text', required: true, minLength: 3 },
        {
          name: 'status',
          kind: 'enum',
          values: ['open', 'pending', 'solved'],
          default: 'open',
          required: true,
        },
        { name: 'customer', kind: 'relation', to: 'customer', required: true, onDelete: 'cascade' },
        { name: 'assignee', kind: 'persona' },
        { name: 'labels', kind: 'tags' },
      ],
      titleField: 'subject',
      ownerField: 'assignee',
      defaultSort: { field: 'subject', direction: 'asc' },
    },
    {
      name: 'invoice',
      plural: 'invoices',
      fields: [
        { name: 'number', kind: 'text', required: true },
        { name: 'amount', kind: 'money', min: 0, required: true },
        { name: 'customer', kind: 'relation', to: 'customer', onDelete: 'restrict' },
      ],
      titleField: 'number',
    },
    {
      name: 'note',
      plural: 'notes',
      fields: [
        { name: 'body', kind: 'text', required: true },
        { name: 'ticket', kind: 'relation', to: 'ticket', onDelete: 'nullify' },
        {
          name: 'related',
          kind: 'relation',
          to: 'ticket',
          cardinality: 'many',
          onDelete: 'nullify',
        },
      ],
      titleField: 'body',
    },
  ],
  roles: [
    { name: 'owner', permissions: { '*': ['*'] } },
    { name: 'admin', permissions: { '*': ['*'] } },
    {
      name: 'member',
      permissions: {
        customer: ['read', 'create', 'update'],
        ticket: ['read', 'create', 'update:own', 'delete:own'],
        invoice: ['read'],
        note: ['*'],
      },
    },
    { name: 'viewer', permissions: { '*': ['read'] } },
  ],
});

export const REFERENCE_TIME = '2026-06-01T09:00:00.000Z';

export const blueprintScenarios: ScenarioInput[] = [
  {
    id: 'owner',
    extends: 'workspace-owner',
    name: 'Owner',
    seed: 11,
    referenceTime: REFERENCE_TIME,
  },
  {
    id: 'member',
    extends: 'six-month-new-member',
    name: 'Member',
    seed: 12,
    referenceTime: REFERENCE_TIME,
  },
  {
    id: 'viewer',
    extends: 'read-only-viewer',
    name: 'Viewer',
    seed: 13,
    referenceTime: REFERENCE_TIME,
  },
];

export function createBlueprintDefinition(namespace = 'blueprint-fixture'): PrototypeDefinition {
  return definePrototype({
    manifest: parseManifest({
      id: `example.${namespace}`,
      slug: namespace,
      name: 'Blueprint fixture',
      version: '0.1.0',
      defaultScenario: 'owner',
      storage: { namespace, schemaVersion: 1 },
      scenarios: blueprintScenarios.map((s) => s.id as string),
    }),
    database: { versions: [{ version: 1, stores: deriveStores(helpdeskBlueprint) }] },
    scenarios: blueprintScenarios,
    policy: derivePolicy(helpdeskBlueprint),
    integrity: deriveIntegrity(helpdeskBlueprint),
    generatorVersion: 1,
    generate(ctx) {
      const team = generateTeam(ctx);
      const created = () =>
        ctx.time
          .between(new Date(team.organization.createdAt), ctx.time.now, ctx.rng.next)
          .toISOString();
      const stamp = () => {
        const at = created();
        return { createdAt: at, updatedAt: at };
      };
      const customers: Row[] = Array.from({ length: 3 }, (_, i) => ({
        id: ctx.ids.next('customer'),
        name: `Customer ${i + 1}`,
        email: `customer${i + 1}@example.com`,
        accountManagerId: ctx.rng.pick(team.personas).id,
        ...stamp(),
      }));
      const tickets: Row[] = customers.flatMap((customer, c) =>
        Array.from({ length: 2 }, (_, i) => ({
          id: ctx.ids.next('ticket'),
          subject: `Ticket ${c + 1}.${i + 1}`,
          status: ctx.rng.pick(['open', 'pending', 'solved'] as const),
          customerId: customer.id,
          assigneeId: ctx.rng.pick(team.personas).id,
          labels: [],
          ...stamp(),
        }))
      );
      const invoices: Row[] = [
        {
          id: ctx.ids.next('invoice'),
          number: 'INV-0001',
          amount: 12_500,
          customerId: (customers[0] as Row).id,
          ...stamp(),
        },
      ];
      const notes: Row[] = [
        {
          id: ctx.ids.next('note'),
          body: 'Called back, waiting on logs.',
          ticketId: (tickets[2] as Row).id,
          relatedIds: [(tickets[2] as Row).id, (tickets[4] as Row).id],
          ...stamp(),
        },
      ];
      return {
        organizations: team.organizations,
        personas: team.personas,
        memberships: team.memberships,
        tables: { customers, tickets, invoices, notes },
      };
    },
  });
}
