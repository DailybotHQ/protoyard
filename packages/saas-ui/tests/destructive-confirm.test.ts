import {
  definePolicy,
  definePrototype,
  type PrototypeDefinition,
  parseManifest,
} from '@protoyard/core';
import type { ProtoyardRuntime } from '@protoyard/runtime';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import {
  createInvitationServices,
  type SaasInvitation,
  saasIntegrity,
  saasStores,
  saasTables,
} from '../../saas/src/index.ts';
import { generateTeam } from '../../scenarios/src/index.ts';
import AuthHarness from './fixtures/AuthHarness.svelte';

/**
 * Settings > Members: Remove member and Revoke invitation are destructive, so
 * each opens an AlertDialog naming its target, never focused on the action. The
 * action runs only on confirm.
 */

const definition: PrototypeDefinition = definePrototype({
  manifest: parseManifest({
    id: 'example.saas-ui-confirm',
    slug: 'saas-ui-confirm',
    name: 'Destructive confirmation fixture',
    version: '0.1.0',
    defaultScenario: 'active',
    defaultTheme: 'violet',
    storage: { namespace: 'saas-ui-confirm', schemaVersion: 1 },
    scenarios: ['active'],
  }),
  database: { versions: [{ version: 1, stores: saasStores() }] },
  scenarios: [
    {
      id: 'active',
      extends: 'active-month',
      name: 'Active workspace',
      seed: 733,
      referenceTime: '2026-10-17T09:00:00.000Z',
    },
  ],
  policy: definePolicy({ roles: { owner: ['*'], admin: ['*'], member: [], viewer: [] } }),
  integrity: saasIntegrity(),
  generate(ctx) {
    const team = generateTeam(ctx);
    return {
      organizations: team.organizations,
      personas: team.personas,
      memberships: team.memberships.map((membership, index) =>
        index === 0 ? { ...membership, role: 'owner' } : { ...membership, role: 'member' }
      ),
      tables: saasTables(),
    };
  },
});

type Db = ProtoyardRuntime['db'];
let harness = createHarness<Db>(definition);
afterEach(() => {
  cleanup();
  harness.closeAll();
  harness = createHarness<Db>(definition);
  location.hash = '';
});

async function openMembers() {
  const runtime = (await harness.boot('active')) as ProtoyardRuntime;
  const owner = runtime.members.list().find((member) => member.membership.role === 'owner');
  if (!owner) throw new Error('The fixture needs an owner');
  await runtime.session.signIn(owner.persona.id);
  const target = runtime.members.list().find((member) => member.membership.role !== 'owner');
  if (!target) throw new Error('The fixture needs a removable member');
  await createInvitationServices(runtime).create({
    email: 'pending-invitee@example.com',
    role: 'member',
  });
  render(AuthHarness, { props: { runtime, screen: 'settings', tab: 'members' } });
  await screen.findByText(target.persona.name);
  await screen.findByText(/pending-invitee@example.com · member/);
  return { runtime, target };
}

const memberIds = (runtime: ProtoyardRuntime) =>
  runtime.members.list().map((member) => member.membership.id);
const invitationStatus = async (runtime: ProtoyardRuntime) =>
  (
    await runtime.db
      .rows<SaasInvitation>('saas_invitations')
      .where('email')
      .equals('pending-invitee@example.com')
      .first()
  )?.status;

function removeButtonFor(name: string): HTMLButtonElement {
  const row = screen.getByText(name).closest('li');
  const button = row?.querySelector('button');
  if (!button) throw new Error(`No Remove button for ${name}`);
  return button as HTMLButtonElement;
}

/**
 * Focus moves into the dialog and never starts on the destructive action, so
 * Enter or Space cannot confirm by accident. (Bits UI focuses the dialog
 * container; Cancel comes first in tab order.)
 */
async function expectSafeInitialFocus(dialog: HTMLElement, confirmLabel: string): Promise<void> {
  await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  expect(document.activeElement).not.toBe(screen.getByRole('button', { name: confirmLabel }));
  const buttons = [...dialog.querySelectorAll('button')].map((button) =>
    button.textContent?.trim()
  );
  expect(buttons.indexOf('Cancel')).toBeLessThan(buttons.indexOf(confirmLabel));
}

describe('members: destructive actions confirm first', () => {
  it('Remove opens a dialog naming the member, never focused on the action, and removes nothing yet', async () => {
    const { runtime, target } = await openMembers();
    const before = memberIds(runtime);
    const remove = removeButtonFor(target.persona.name);
    await waitFor(() => expect(remove.disabled).toBe(false));
    await fireEvent.click(remove);

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain(`Remove ${target.persona.name}?`);
    await expectSafeInitialFocus(dialog, 'Remove member');
    expect(memberIds(runtime)).toEqual(before);
  });

  it('Cancel closes the remove dialog and keeps the member', async () => {
    const { runtime, target } = await openMembers();
    const before = memberIds(runtime);
    await fireEvent.click(removeButtonFor(target.persona.name));
    await screen.findByRole('alertdialog');
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(memberIds(runtime)).toEqual(before);
    expect(screen.getByText(target.persona.name)).toBeTruthy();
  });

  it('Confirm removes the member', async () => {
    const { runtime, target } = await openMembers();
    await fireEvent.click(removeButtonFor(target.persona.name));
    await screen.findByRole('alertdialog');
    await fireEvent.click(screen.getByRole('button', { name: 'Remove member' }));
    await waitFor(() => expect(memberIds(runtime)).not.toContain(target.membership.id));
    await waitFor(() => expect(screen.queryByText(target.persona.name)).toBeNull());
  });

  it('Revoke opens a dialog naming the invitee; Cancel keeps it pending, Confirm revokes', async () => {
    const { runtime } = await openMembers();
    const revoke = screen.getByRole('button', { name: 'Revoke' }) as HTMLButtonElement;
    await waitFor(() => expect(revoke.disabled).toBe(false));
    await fireEvent.click(revoke);
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('pending-invitee@example.com');
    await expectSafeInitialFocus(dialog, 'Revoke invitation');
    expect(await invitationStatus(runtime)).toBe('pending');

    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(await invitationStatus(runtime)).toBe('pending');

    await fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    await screen.findByRole('alertdialog');
    await fireEvent.click(screen.getByRole('button', { name: 'Revoke invitation' }));
    await waitFor(async () => expect(await invitationStatus(runtime)).toBe('revoked'));
    await waitFor(() =>
      expect(screen.queryByText(/pending-invitee@example.com · member/)).toBeNull()
    );
  });
});

describe('members and profile: people show their faces', () => {
  it('renders each member avatar as a decorative photo, initials for an invitee without one', async () => {
    const { runtime, target } = await openMembers();
    const row = screen.getByText(target.persona.name).closest('li');
    const face = row?.querySelector('img');
    expect(target.persona.avatar).toMatch(/^av-\d{3}$/);
    expect(face?.getAttribute('src')).toBe(`./avatars/64/${target.persona.avatar}.webp`);
    expect(face?.getAttribute('srcset')).toContain(
      `./avatars/128/${target.persona.avatar}.webp 2x`
    );
    expect(face?.getAttribute('alt')).toBe('');
    expect(face?.getAttribute('loading')).toBe('lazy');
    const invite = screen.getByText(/pending-invitee@example.com · member/).closest('li');
    expect(invite?.querySelector('img')).toBeNull();
    expect(invite?.querySelector('[data-avatar="initials"]')).not.toBeNull();
    expect(runtime.members.list().length).toBeGreaterThan(1);
  });

  it('shows the signed-in persona face on the profile tab, named by its alt', async () => {
    const runtime = (await harness.boot('active')) as ProtoyardRuntime;
    const owner = runtime.members.list().find((member) => member.membership.role === 'owner');
    if (!owner) throw new Error('The fixture needs an owner');
    await runtime.session.signIn(owner.persona.id);
    render(AuthHarness, { props: { runtime, screen: 'settings', tab: 'profile' } });
    const avatar = await screen.findByTestId('settings-profile-avatar');
    const face = avatar.querySelector('img');
    expect(face?.getAttribute('src')).toBe(`./avatars/64/${owner.persona.avatar}.webp`);
    expect(face?.getAttribute('alt')).toBe(owner.persona.name);
    expect(face?.getAttribute('width')).toBe('48');
  });
});
