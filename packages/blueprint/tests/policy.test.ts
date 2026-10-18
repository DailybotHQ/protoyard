import { createPermissionPolicy, type Persona, resolvePrincipal } from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import { type Blueprint, CAPABILITIES, derivePolicy, parseBlueprint } from '../src/index.ts';

function fixture(): Blueprint {
  return parseBlueprint({
    formatVersion: 1,
    name: 'Policy fixture',
    entities: [
      {
        name: 'ticket',
        plural: 'tickets',
        fields: [
          { name: 'subject', kind: 'text' },
          { name: 'owner', kind: 'persona' },
        ],
        titleField: 'subject',
        ownerField: 'owner',
      },
    ],
    roles: [
      { name: 'owner', permissions: { '*': ['*'] } },
      { name: 'admin', permissions: { ticket: ['read', 'create', 'update', 'delete'] } },
      { name: 'member', permissions: { ticket: ['read', 'create', 'update:own', 'delete:own'] } },
      { name: 'viewer', permissions: { '*': ['read'] } },
    ],
  });
}

function principal(
  policy: ReturnType<typeof createPermissionPolicy>,
  role: string,
  id = 'user_001'
) {
  const persona = {
    id,
    name: 'Alex Example',
    joinedAt: '2026-10-17T00:00:00.000Z',
  } as Persona;
  const membership = {
    id: 'membership_001',
    personaId: id,
    organizationId: 'org_001',
    role,
    joinedAt: '2026-10-17T00:00:00.000Z',
    capabilities: [],
  };
  return resolvePrincipal(persona, null, membership, policy);
}

describe('derivePolicy', () => {
  it('derives per-entity capabilities and checks owner/admin/member/viewer through the runtime policy', () => {
    const blueprint = fixture();
    const policy = createPermissionPolicy(derivePolicy(blueprint));
    const caps = CAPABILITIES(blueprint);
    const owner = principal(policy, 'owner', 'owner_001');
    const admin = principal(policy, 'admin', 'admin_001');
    const member = principal(policy, 'member', 'member_001');
    const viewer = principal(policy, 'viewer', 'viewer_001');
    const ticketCaps = caps.ticket;
    if (!ticketCaps) throw new Error('Fixture ticket capabilities are missing.');

    expect(ticketCaps).toEqual({
      read: 'ticket:read',
      create: 'ticket:create',
      update: 'ticket:update',
      updateOwn: 'ticket:update:own',
      delete: 'ticket:delete',
      deleteOwn: 'ticket:delete:own',
      import: 'ticket:import',
      export: 'ticket:export',
    });
    expect(caps.members.all).toBe('members:*');
    expect(policy.can(owner, ticketCaps.delete, { ownerId: 'someone_else' })).toBe(true);
    expect(policy.can(admin, ticketCaps.create)).toBe(true);
    expect(policy.can(admin, ticketCaps.delete, { ownerId: 'someone_else' })).toBe(true);
    expect(policy.can(admin, caps.members.all)).toBe(true);
    expect(policy.can(member, ticketCaps.create)).toBe(true);
    expect(policy.can(member, ticketCaps.updateOwn, { ownerId: 'member_001' })).toBe(true);
    expect(policy.can(member, ticketCaps.updateOwn, { ownerId: 'other_001' })).toBe(false);
    expect(policy.can(member, ticketCaps.deleteOwn, { ownerId: 'member_001' })).toBe(true);
    expect(policy.can(member, ticketCaps.deleteOwn, { ownerId: 'other_001' })).toBe(false);
    expect(policy.can(member, caps.members.all)).toBe(false);
    expect(policy.can(viewer, ticketCaps.read)).toBe(true);
    expect(policy.can(viewer, ticketCaps.create)).toBe(false);
    expect(policy.can(viewer, caps.members.all)).toBe(false);
  });

  it('expands entity and action wildcards and keeps explicit denials authoritative', () => {
    const blueprint = fixture();
    const adminRole = blueprint.roles.find((role) => role.name === 'admin');
    if (!adminRole) throw new Error('Fixture admin role is missing.');
    const withWildcardAndDenial = parseBlueprint({
      ...blueprint,
      roles: blueprint.roles.map((role) =>
        role.name === 'admin' ? { ...role, permissions: { ticket: ['*', '-ticket:delete'] } } : role
      ),
    });
    const policy = createPermissionPolicy(derivePolicy(withWildcardAndDenial));
    const admin = principal(policy, 'admin');
    expect(policy.can(admin, 'ticket:export')).toBe(true);
    expect(policy.can(admin, 'ticket:delete')).toBe(false);
  });
});
