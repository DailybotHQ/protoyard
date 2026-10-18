import { type PrototypeRuntime, type Row } from '@protoyard/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createBlueprintDefinition,
  helpdeskBlueprint,
} from '../../../tests/fixtures/blueprint-prototype.ts';
import { createHarness } from '../../../tests/support/runtime.ts';
import {
  createEntityServices,
  createNotificationService,
  deriveStores,
  parseBlueprint,
} from '../src/index.ts';

const blueprint = parseBlueprint({
  ...helpdeskBlueprint,
  entities: helpdeskBlueprint.entities.map((entity) =>
    entity.name === 'ticket'
      ? { ...entity, features: { ...entity.features, notifications: true } }
      : entity
  ),
  notifications: [
    { on: 'create', entity: 'ticket', notify: 'assignee', title: 'New {subject}' },
    { on: 'update', entity: 'ticket', notify: 'assignee', title: 'Updated {subject}' },
    {
      on: 'assign',
      entity: 'ticket',
      field: 'assignee',
      notify: 'assignee',
      title: 'Assigned {subject}',
    },
  ],
});

function createDefinition() {
  const definition = createBlueprintDefinition('blueprint-notifications');
  return {
    ...definition,
    database: {
      ...definition.database,
      versions: definition.database.versions.map((version, index) =>
        index === 0 ? { ...version, stores: deriveStores(blueprint) } : version
      ),
    },
  };
}

let harness = createHarness(createDefinition());
beforeEach(() => {
  harness = createHarness(createDefinition());
});
afterEach(() => harness.closeAll());

interface RowsTable {
  toArray(): Promise<Row[]>;
}

const table = (runtime: PrototypeRuntime, name: string) =>
  (runtime.db as { table(name: string): RowsTable }).table(name);

describe('blueprint notifications', () => {
  it('notifies on create, update, and assignment, and reads are scoped to the active persona', async () => {
    const runtime = await harness.boot('owner');
    const actorId = runtime.session.principal()?.persona.id as string;
    const personas = await table(runtime, 'py_personas').toArray();
    const firstAssignee = personas.find((persona) => persona.id !== actorId)?.id as string;
    const secondAssignee = personas.find(
      (persona) => persona.id !== actorId && persona.id !== firstAssignee
    )?.id as string;
    const services = createEntityServices(runtime, blueprint);
    const ticket = await services.ticket!.create({
      subject: 'Printer setup',
      customerId: 'customer_0001',
      assigneeId: firstAssignee,
    });

    const notifications = createNotificationService(runtime);
    expect(await notifications.unreadCount()).toBe(0);

    await services.ticket!.update(ticket.id, { status: 'pending' });
    await services.ticket!.update(ticket.id, { assigneeId: secondAssignee });

    runtime.session.switchActor(firstAssignee);
    const firstNotifications = await notifications.list();
    expect(firstNotifications.map((row) => row.title).sort()).toEqual(
      ['New Printer setup', 'Updated Printer setup'].sort()
    );
    expect(firstNotifications.every((row) => row.personaId === firstAssignee)).toBe(true);
    expect(await notifications.unreadCount()).toBe(2);
    expect(await notifications.markRead(firstNotifications[0]!.id as string)).toBe(true);
    expect(await notifications.unreadCount()).toBe(1);
    expect(await notifications.markUnread(firstNotifications[0]!.id as string)).toBe(true);
    expect(await notifications.markAllRead()).toBe(2);
    expect(await notifications.unreadCount()).toBe(0);

    runtime.session.switchActor(secondAssignee);
    const assignment = await notifications.list();
    expect(assignment).toHaveLength(2);
    expect(assignment).toContainEqual(
      expect.objectContaining({
        personaId: secondAssignee,
        kind: 'ticket.assign',
        title: 'Assigned Printer setup',
      })
    );
  });

  it('never writes notification markup and validates title placeholders', () => {
    const base = { ...helpdeskBlueprint, notifications: [] };
    expect(() =>
      parseBlueprint({
        ...base,
        notifications: [
          { on: 'create', entity: 'ticket', notify: 'assignee', title: '<b>{subject}</b>' },
        ],
      })
    ).toThrow(/plain text, not HTML/);
    expect(() =>
      parseBlueprint({
        ...base,
        notifications: [
          { on: 'create', entity: 'ticket', notify: 'assignee', title: 'New {missing}' },
        ],
      })
    ).toThrow(/unknown title placeholder/);
  });

  it('does not notify the actor for a self-assigned create', async () => {
    const runtime = await harness.boot('member');
    const actorId = runtime.session.principal()?.persona.id as string;
    const services = createEntityServices(runtime, blueprint);
    await services.ticket!.create({ subject: 'My ticket', customerId: 'customer_0001' });
    runtime.session.switchActor(actorId);
    expect(await createNotificationService(runtime).list()).toEqual([]);
  });
});
