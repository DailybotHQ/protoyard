import {
  createEntityServices,
  createNotificationService,
  deriveStores,
  parseBlueprint,
} from '@protoyard/blueprint';
import type { PrototypeRuntime, Row } from '@protoyard/core';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createBlueprintDefinition,
  helpdeskBlueprint,
} from '../../../tests/fixtures/blueprint-prototype.ts';
import { createHarness } from '../../../tests/support/runtime.ts';
import TeamUiHarness from './fixtures/TeamUiHarness.svelte';

const blueprint = parseBlueprint({
  ...helpdeskBlueprint,
  entities: helpdeskBlueprint.entities.map((entity) =>
    entity.name === 'ticket'
      ? { ...entity, features: { ...entity.features, notifications: true } }
      : entity
  ),
  notifications: [
    { on: 'create', entity: 'ticket', notify: 'assignee', title: 'New {subject}' },
    {
      on: 'assign',
      entity: 'ticket',
      field: 'assignee',
      notify: 'assignee',
      title: 'Assigned {subject}',
    },
  ],
});

function createDefinition(namespace: string) {
  const definition = createBlueprintDefinition(namespace);
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

let harness = createHarness(createDefinition('crud-team-ui'));
beforeEach(() => {
  harness = createHarness(
    createDefinition(`crud-team-ui-${Math.random().toString(36).slice(2, 8)}`)
  );
});
afterEach(() => {
  cleanup();
  harness.closeAll();
});

interface RowsTable {
  toArray(): Promise<Row[]>;
}

const table = (runtime: PrototypeRuntime, name: string) =>
  (runtime.db as { table(name: string): RowsTable }).table(name);

describe('NotificationsBell', () => {
  it('updates the unread badge via liveQuery when tickets notify assignees', async () => {
    const runtime = await harness.boot('owner');
    const actorId = runtime.session.principal()?.persona.id as string;
    const personas = await table(runtime, 'py_personas').toArray();
    const assigneeId = personas.find((persona) => persona.id !== actorId)?.id as string;
    const services = createEntityServices(runtime, blueprint);

    const customers = await table(runtime, 'customers').toArray();
    const customerId = String(customers[0]?.id ?? '');
    expect(customerId).toBeTruthy();
    await services.ticket!.create({
      subject: 'VPN access',
      customerId,
      assigneeId,
    });

    const notifications = createNotificationService(runtime);
    render(TeamUiHarness, { runtime, mode: 'bell', notifications });
    // The bell is already mounted when the principal changes; usePrincipal
    // must update its persona scope reactively.
    await runtime.session.switchActor(assigneeId);
    expect(await notifications.unreadCount()).toBeGreaterThanOrEqual(1);

    await waitFor(() =>
      expect(screen.getByTestId('notifications-unread-badge').textContent?.trim()).toMatch(/^[1-9]/)
    );

    await fireEvent.click(screen.getByTestId('notifications-bell-trigger'));
    await waitFor(() => expect(screen.getByTestId('notifications-list')).toBeTruthy());
    const item = await screen.findByTestId('notification-item');
    expect(item.getAttribute('data-unread')).toBe('true');
    await fireEvent.click(item);
    await waitFor(async () => {
      expect(await notifications.unreadCount()).toBe(0);
    });
    await waitFor(() => expect(screen.queryByTestId('notifications-unread-badge')).toBeNull());
  });
});

describe('MembersScreen', () => {
  it('invites a member and adds a row', async () => {
    const runtime = await harness.boot('owner');
    const before = runtime.members.list().length;
    render(TeamUiHarness, { runtime, mode: 'members' });

    await waitFor(() => expect(screen.getByTestId('members-table')).toBeTruthy());
    expect(screen.getAllByTestId('member-row').length).toBe(before);

    await fireEvent.input(screen.getByTestId('invite-name'), {
      target: { value: 'Blair Example' },
    });
    await fireEvent.input(screen.getByTestId('invite-email'), {
      target: { value: 'blair@example.com' },
    });
    await fireEvent.click(screen.getByTestId('invite-submit'));

    await waitFor(() => {
      expect(runtime.members.list().length).toBe(before + 1);
      expect(screen.getByText('Blair Example')).toBeTruthy();
    });
    expect(runtime.members.list().some((m) => m.persona.email === 'blair@example.com')).toBe(true);
  });

  it('shows each member face next to the name, initials when there is none', async () => {
    const runtime = await harness.boot('owner');
    const members = runtime.members.list();
    expect(members.some((m) => m.persona.avatar)).toBe(true);
    render(TeamUiHarness, { runtime, mode: 'members' });
    await waitFor(() => expect(screen.getAllByTestId('member-row').length).toBe(members.length));
    for (const member of members) {
      const row = document.querySelector(
        `[data-membership-id="${member.membership.id}"]`
      ) as HTMLElement;
      const face = row.querySelector('img');
      if (member.persona.avatar) {
        expect(face?.getAttribute('src')).toBe(`./avatars/64/${member.persona.avatar}.webp`);
        expect(face?.getAttribute('alt')).toBe('');
      } else {
        expect(face).toBeNull();
        expect(row.querySelector('[data-avatar="initials"]')).not.toBeNull();
      }
    }
  });

  it('hides invite controls for viewers', async () => {
    const runtime = await harness.boot('viewer');
    render(TeamUiHarness, { runtime, mode: 'members' });

    await waitFor(() => expect(screen.getByTestId('members-screen')).toBeTruthy());
    expect(screen.queryByTestId('members-invite-form')).toBeNull();
    expect(screen.getByTestId('members-invite-denied')).toBeTruthy();
    expect(screen.queryByTestId('member-remove')).toBeNull();
    // Roles show as read-only text, not selects.
    expect(screen.getAllByTestId('member-role-readonly').length).toBeGreaterThan(0);
  });
});
