import { MEMBER_CAPABILITIES, PermissionDeniedError, type PrototypeRuntime } from '@protoyard/core';
import { dumpTables, type PrototypeDatabase } from '@protoyard/database';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import { IdentityValidationError, type ProtoyardRuntime } from '../src/index.ts';
import { createTasksDefinition } from './fixtures/tasks-prototype.ts';

type Runtime = PrototypeRuntime<PrototypeDatabase>;

const harnesses: ReturnType<typeof createHarness>[] = [];

async function boot() {
  const harness = createHarness<PrototypeDatabase>(createTasksDefinition());
  harnesses.push(harness);
  const runtime = await harness.boot();
  // Scenario actor user_0001 is the organization's only owner.
  expect(runtime.session.principal()?.role).toBe('owner');
  return { harness, runtime };
}

const ownerMembership = (runtime: Runtime) => runtime.session.principal()?.membership?.id as string;
const memberWithRole = (runtime: Runtime, role: string) =>
  runtime.members.list().find((m) => m.membership.role === role);

afterEach(() => {
  for (const harness of harnesses.splice(0)) harness.closeAll();
});

describe('members services', () => {
  it('invites a fictional persona that persists and appears in the persona switcher', async () => {
    const { harness, runtime } = await boot();
    const before = runtime.members.list().length;
    const member = await runtime.members.invite({ name: 'Ada Example', role: 'member' });

    expect(member.persona).toMatchObject({
      name: 'Ada Example',
      email: 'ada.example@example.com',
      onboardingComplete: false,
      joinedAt: runtime.clock.now().toISOString(),
    });
    expect(member.persona.id).toMatch(/^user_/);
    expect(member.membership).toMatchObject({
      personaId: member.persona.id,
      organizationId: runtime.session.principal()?.organization?.id,
      role: 'member',
    });
    expect(runtime.members.list()).toHaveLength(before + 1);

    const reloaded = await harness.reload(runtime);
    expect(reloaded.session.personas().map((p) => p.id)).toContain(member.persona.id);
    expect(reloaded.members.list().map((m) => m.persona.id)).toContain(member.persona.id);
    await reloaded.session.switchActor(member.persona.id);
    expect(reloaded.session.principal()?.role).toBe('member');
  });

  it('validates invitations: example emails, known roles, no duplicate members', async () => {
    const { runtime } = await boot();
    const db = runtime.db;
    const snapshot = await dumpTables(db);

    await expect(
      runtime.members.invite({ name: 'Real Person', email: 'someone@gmail.com', role: 'member' })
    ).rejects.toMatchObject({ issues: { email: expect.stringMatching(/example\.com/) } });
    await expect(runtime.members.invite({ name: 'Nobody', role: 'wizard' })).rejects.toMatchObject({
      issues: { role: expect.stringMatching(/Unknown role/) },
    });
    await expect(runtime.members.invite({ name: '  ', role: 'member' })).rejects.toBeInstanceOf(
      IdentityValidationError
    );
    const existing = runtime.members.list()[1];
    await expect(
      runtime.members.invite({
        name: 'Again',
        email: existing?.persona.email as string,
        role: 'member',
      })
    ).rejects.toMatchObject({ issues: { email: expect.stringMatching(/already a member/) } });
    expect(await dumpTables(db)).toEqual(snapshot);

    await runtime.members.invite({ name: 'Lab Guest', email: 'guest@lab.example', role: 'viewer' });
    expect(runtime.members.list().some((m) => m.persona.email === 'guest@lab.example')).toBe(true);
  });

  it('changes roles and keeps at least one owner', async () => {
    const { runtime } = await boot();
    const invited = await runtime.members.invite({ name: 'Promo Example', role: 'viewer' });
    const changed = await runtime.members.changeRole(invited.membership.id, 'admin');
    expect(changed.role).toBe('admin');
    expect(
      runtime.members.list().find((m) => m.membership.id === changed.id)?.membership.role
    ).toBe('admin');

    await expect(
      runtime.members.changeRole(ownerMembership(runtime), 'admin')
    ).rejects.toMatchObject({ issues: { role: expect.stringMatching(/at least one owner/) } });
    await expect(runtime.members.changeRole(invited.membership.id, 'wizard')).rejects.toThrow(
      /Unknown role/
    );
    await expect(runtime.members.changeRole('missing', 'admin')).rejects.toThrow(/not found/);
  });

  it('cannot remove yourself as the last owner, but can remove other members', async () => {
    const { runtime } = await boot();
    await expect(runtime.members.remove(ownerMembership(runtime))).rejects.toMatchObject({
      issues: { membership: expect.stringMatching(/at least one owner/) },
    });
    const viewer = await runtime.members.invite({ name: 'Short Stay', role: 'viewer' });
    await runtime.members.remove(viewer.membership.id);
    expect(runtime.members.list().some((m) => m.membership.id === viewer.membership.id)).toBe(
      false
    );
    // The persona and anything it authored stay.
    expect(runtime.session.personas().some((p) => p.id === viewer.persona.id)).toBe(true);
  });

  it('transfers ownership atomically, after which the old owner may leave', async () => {
    const { runtime } = await boot();
    const owner = ownerMembership(runtime);
    const heir = await runtime.members.invite({ name: 'Heir Example', role: 'member' });
    await runtime.members.transferOwnership(heir.membership.id);

    expect(runtime.session.principal()?.role).toBe('admin');
    expect(memberWithRole(runtime, 'owner')?.membership.id).toBe(heir.membership.id);
    // No longer an owner: the actor cannot transfer again.
    await expect(runtime.members.transferOwnership(owner)).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
    await runtime.members.remove(owner);
    expect(
      runtime.members.list(heir.membership.organizationId).map((m) => m.membership.id)
    ).not.toContain(owner);
  });

  it('falls back cleanly when the active actor loses their membership', async () => {
    const { harness, runtime } = await boot();
    const owner = ownerMembership(runtime);
    const heir = await runtime.members.invite({ name: 'Next Owner', role: 'member' });
    await runtime.members.transferOwnership(heir.membership.id);
    const actorId = runtime.session.principal()?.persona.id;
    await runtime.members.remove(owner);

    const principal = runtime.session.principal();
    expect(principal?.persona.id).toBe(actorId);
    expect(principal?.membership).toBeNull();
    expect(principal?.organization).toBeNull();
    expect(principal?.role).toBeNull();
    expect(runtime.session.can(MEMBER_CAPABILITIES.invite)).toBe(false);
    expect(runtime.members.list()).toEqual([]);

    const reloaded = await harness.reload(runtime);
    expect(reloaded.session.principal()?.persona.id).toBe(actorId);
    expect(reloaded.session.principal()?.membership).toBeNull();
    await reloaded.session.switchActor(heir.persona.id);
    expect(reloaded.session.principal()?.role).toBe('owner');
  });

  it('asserts members:* capabilities and runs through the simulated environment', async () => {
    const { runtime } = await boot();
    const target = memberWithRole(runtime, 'member') ?? runtime.members.list()[1];
    await runtime.overrides.set({ role: 'member' });
    await expect(
      runtime.members.invite({ name: 'Blocked', role: 'member' })
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(
      runtime.members.changeRole(target?.membership.id as string, 'viewer')
    ).rejects.toThrow(/Simulated policy/);
    await runtime.overrides.clear(['role']);

    await runtime.overrides.set({ environment: { network: 'offline' } });
    await expect(runtime.members.invite({ name: 'Offline', role: 'member' })).rejects.toMatchObject(
      {
        code: 'offline',
      }
    );
    await runtime.overrides.clear();
    expect(runtime.members.list().some((m) => m.persona.name === 'Offline')).toBe(false);

    await runtime.session.signOut();
    await expect(runtime.members.invite({ name: 'Anyone', role: 'member' })).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
  });

  it('cannot invite into or mutate a different organization', async () => {
    const { runtime } = await boot();
    const target = await (runtime as unknown as ProtoyardRuntime).identity.write(async (ops) => {
      const organization = await ops.putOrganization({ name: 'Other Organization' });
      const persona = await ops.putPersona({ name: 'Other Member' });
      const membership = await ops.putMembership({
        personaId: persona.id,
        organizationId: organization.id,
        role: 'viewer',
      });
      return { organization, membership };
    });

    await expect(
      runtime.members.invite({
        name: 'Cross Organization Invite',
        role: 'viewer',
        organizationId: target.organization.id,
      })
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(runtime.members.changeRole(target.membership.id, 'member')).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
    await expect(runtime.members.remove(target.membership.id)).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
  });
});
