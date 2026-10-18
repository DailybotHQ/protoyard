import {
  InviteMemberInputSchema,
  isExampleEmail,
  MEMBER_CAPABILITIES,
  type MembersController,
  type Membership,
  OWNER_ROLE,
  PermissionDeniedError,
  type Persona,
} from '@protoyard/core';
import { type IdentityController, type IdentityOps, IdentityValidationError } from './identity.ts';
import type { Kernel } from './kernel.ts';

/**
 * `runtime.members`: team management built on `runtime.identity`. Each
 * mutation asserts a `members:*` capability against the current principal,
 * validates, runs through the simulated environment and writes in one
 * transaction (identity.write), which then re-resolves the principal.
 */

function invalid(issues: Record<string, string>): IdentityValidationError {
  return new IdentityValidationError('member', issues);
}

function emailFromName(name: string): string {
  const local = name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
  return `${local || 'member'}@example.com`;
}

/** Owners left in `organizationId` once `membershipId` stops being an owner. */
function ownersAfter(
  ops: IdentityOps,
  organizationId: string,
  membershipId: string
): Promise<number> {
  return ops
    .listMemberships({ organizationId })
    .then(
      (members) => members.filter((m) => m.role === OWNER_ROLE && m.id !== membershipId).length
    );
}

const LAST_OWNER = 'An organization needs at least one owner. Transfer ownership first.';

export function createMembersController(
  k: Kernel,
  identity: IdentityController
): MembersController {
  const roles = () => Object.keys(k.policy.definition.roles);
  const assertRole = (role: string) => {
    if (!roles().includes(role)) {
      throw invalid({ role: `Unknown role "${role}". Roles: ${roles().join(', ')}` });
    }
  };
  const assert = (capability: string, resource: unknown) =>
    k.policy.assert(k.principal, capability, resource);

  async function load(membershipId: string): Promise<Membership> {
    const membership = (await k.db.table('py_memberships').get(membershipId)) as
      | Membership
      | undefined;
    if (!membership) throw new Error(`Membership "${membershipId}" was not found.`);
    return membership;
  }

  /**
   * Re-reads inside the transaction so a concurrent change cannot slip in.
   * A Dexie promise chain, not an extra async layer, so the transaction zone holds.
   */
  function current(ops: IdentityOps, membershipId: string): Promise<Membership> {
    return ops.getMembership(membershipId).then((membership) => {
      if (!membership) throw new Error(`Membership "${membershipId}" was not found.`);
      return membership;
    });
  }

  return {
    list(organizationId) {
      const orgId = organizationId ?? k.principal?.organization?.id;
      if (!orgId) return [];
      const byId = new Map(k.personas.map((p) => [p.id, p]));
      return k.memberships
        .filter((m) => m.organizationId === orgId && byId.has(m.personaId))
        .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.id.localeCompare(b.id))
        .map((membership) => ({ membership, persona: byId.get(membership.personaId) as Persona }));
    },

    async invite(input) {
      const organizationId = input.organizationId ?? k.principal?.organization?.id;
      assert(MEMBER_CAPABILITIES.invite, { organizationId, role: input.role });
      if (input.role === OWNER_ROLE) assert(MEMBER_CAPABILITIES.transfer, { organizationId });
      const parsed = InviteMemberInputSchema.safeParse(input);
      if (!parsed.success) {
        const issues: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          issues[issue.path.map(String).join('.') || 'member'] ??= issue.message;
        }
        throw invalid(issues);
      }
      const data = parsed.data;
      assertRole(data.role);
      if (!organizationId) throw invalid({ organizationId: 'No active organization to invite to' });
      const email = data.email ?? emailFromName(data.name);
      if (!isExampleEmail(email))
        throw invalid({ email: 'Use a fictional address at example.com' });

      return k.env.run('members.invite', () =>
        identity.write(async (ops) => {
          if (!(await ops.getOrganization(organizationId))) {
            throw invalid({ organizationId: `Unknown organization "${organizationId}"` });
          }
          const existing = ((await k.db.table('py_personas').toArray()) as Persona[]).find(
            (p) => p.email?.toLowerCase() === email
          );
          if (existing) {
            const already = await ops.listMemberships({ personaId: existing.id, organizationId });
            if (already.length) throw invalid({ email: `${email} is already a member` });
          }
          const persona =
            existing ??
            (await ops.putPersona({
              name: data.name,
              email,
              ...(data.title ? { title: data.title } : {}),
              onboardingComplete: false,
              summary: `${data.title ?? 'Invited member'}, invited`,
            }));
          const membership = await ops.putMembership({
            personaId: persona.id,
            organizationId,
            role: data.role,
          });
          return { persona, membership };
        })
      );
    },

    async changeRole(membershipId, role) {
      const target = await load(membershipId);
      assert(MEMBER_CAPABILITIES.update, { membership: target, role });
      if (role === OWNER_ROLE || target.role === OWNER_ROLE) {
        assert(MEMBER_CAPABILITIES.transfer, { membership: target, role });
      }
      assertRole(role);
      return k.env.run('members.changeRole', () =>
        identity.write(async (ops) => {
          const membership = await current(ops, membershipId);
          if (
            membership.role === OWNER_ROLE &&
            role !== OWNER_ROLE &&
            (await ownersAfter(ops, membership.organizationId, membership.id)) === 0
          ) {
            throw invalid({ role: LAST_OWNER });
          }
          return ops.putMembership({ ...membership, role });
        })
      );
    },

    async remove(membershipId) {
      const target = await load(membershipId);
      assert(MEMBER_CAPABILITIES.remove, { membership: target });
      if (target.role === OWNER_ROLE) assert(MEMBER_CAPABILITIES.transfer, { membership: target });
      await k.env.run('members.remove', () =>
        identity.write(async (ops) => {
          const membership = await current(ops, membershipId);
          if (
            membership.role === OWNER_ROLE &&
            (await ownersAfter(ops, membership.organizationId, membership.id)) === 0
          ) {
            throw invalid({ membership: LAST_OWNER });
          }
          await ops.removeMembership(membership.id);
        })
      );
    },

    async transferOwnership(membershipId, options = {}) {
      const target = await load(membershipId);
      assert(MEMBER_CAPABILITIES.transfer, { membership: target });
      const principal = k.principal;
      const own = principal?.membership;
      // Only an owner of that organization can hand it over.
      if (
        !principal ||
        !own ||
        principal.role !== OWNER_ROLE ||
        own.organizationId !== target.organizationId
      ) {
        throw new PermissionDeniedError(MEMBER_CAPABILITIES.transfer, principal?.role ?? null);
      }
      if (own.id === target.id) throw invalid({ membership: 'You already own this organization' });
      const formerOwnerRole = options.formerOwnerRole ?? 'admin';
      assertRole(formerOwnerRole);
      await k.env.run('members.transferOwnership', () =>
        identity.write(async (ops) => {
          const next = await current(ops, target.id);
          const previous = await current(ops, own.id);
          await ops.putMembership({ ...next, role: OWNER_ROLE });
          await ops.putMembership({ ...previous, role: formerOwnerRole });
        })
      );
    },
  };
}
