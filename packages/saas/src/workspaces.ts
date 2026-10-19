import {
  type Membership,
  type Organization,
  OWNER_ROLE,
  type Principal,
  type PrototypeRuntime,
  parseInput,
  ValidationError,
} from '@protoyard/core';
import { z } from 'zod';
import { assertInOrg } from './org-access.ts';

/**
 * Simulated multi-workspace services (ADR-018).
 *
 * Create / rename / leave / switch organizations through the runtime
 * identity helper (one transaction over `py_organizations` +
 * `py_memberships`), then `session.switchOrganization`. Transfer ownership
 * reuses `runtime.members.transferOwnership`.
 *
 * Record rule: the last owner of an organization cannot leave (transfer
 * first). Rename and leave check the capability against the actor's role in
 * the TARGET organization (`assertInOrg`), not the active one. Simulation
 * only — not security.
 */

/** Capabilities asserted by workspace mutations (grant via the prototype policy). */
export const WORKSPACE_CAPABILITIES = {
  create: 'workspaces:create',
  rename: 'workspaces:rename',
  leave: 'workspaces:leave',
} as const;

export const CreateWorkspaceSchema = z.object({
  name: z.string().trim().min(2, 'Name your workspace').max(80),
  /** Free-form type label: company, household, school… */
  type: z.string().trim().min(1).max(40).default('company'),
});
export type CreateWorkspaceInput = z.input<typeof CreateWorkspaceSchema>;

export const RenameWorkspaceSchema = z.object({
  name: z.string().trim().min(2, 'Name your workspace').max(80),
});
export type RenameWorkspaceInput = z.input<typeof RenameWorkspaceSchema>;

export interface WorkspaceMember {
  organization: Organization;
  membership: Membership;
}

/** Subset of `runtime.identity` the workspaces service needs. */
export interface WorkspaceIdentityOps {
  putOrganization(input: Partial<Organization> & Pick<Organization, 'name'>): Promise<Organization>;
  putMembership(
    input: Partial<Membership> & Pick<Membership, 'personaId' | 'organizationId' | 'role'>
  ): Promise<Membership>;
  getOrganization(id: string): Promise<Organization | undefined>;
  listMemberships(filter?: { personaId?: string; organizationId?: string }): Promise<Membership[]>;
  removeMembership(id: string): Promise<void>;
}

export interface WorkspaceIdentity {
  write<T>(
    fn: (ops: WorkspaceIdentityOps) => T | Promise<T>,
    options?: { tables?: readonly string[] }
  ): Promise<T>;
}

export type WorkspacesRuntime = PrototypeRuntime & {
  identity: WorkspaceIdentity;
};

export interface WorkspacesService {
  /** Organizations the signed-in persona belongs to, oldest membership first. */
  list(): WorkspaceMember[];
  /**
   * Create an organization, join as `owner`, and switch the session to it.
   * Persists through reload via identity tables + control-store org id.
   */
  create(input: CreateWorkspaceInput): Promise<WorkspaceMember>;
  /** Switch the active organization (must already be a member). */
  switchTo(organizationId: string): Promise<void>;
  rename(organizationId: string, input: RenameWorkspaceInput): Promise<Organization>;
  /**
   * Leave a workspace. The last owner is denied — transfer ownership first.
   * When leaving the active org, switches to another membership if any remain.
   */
  leave(organizationId?: string): Promise<void>;
  /** Hand ownership to another member (delegates to `runtime.members`). */
  transferOwnership(membershipId: string, options?: { formerOwnerRole?: string }): Promise<void>;
}

const LAST_OWNER = 'An organization needs at least one owner. Transfer ownership first.';

function requirePrincipal(runtime: WorkspacesRuntime): Principal {
  const principal = runtime.session.principal();
  if (!principal) {
    throw new ValidationError({ form: 'Sign in before managing workspaces.' });
  }
  return principal;
}

function membershipFor(
  runtime: WorkspacesRuntime,
  personaId: string,
  organizationId: string
): Membership | undefined {
  return runtime.session
    .memberships()
    .find((m) => m.personaId === personaId && m.organizationId === organizationId);
}

/**
 * Bind workspace services to a prototype runtime that exposes `identity`
 * (the real `createPrototypeRuntime` result).
 *
 * ```ts
 * const workspaces = createWorkspaces(runtime);
 * const { organization } = await workspaces.create({ name: 'Acme Labs' });
 * await workspaces.switchTo(organization.id);
 * ```
 */
export function createWorkspaces(runtime: WorkspacesRuntime): WorkspacesService {
  if (!runtime.identity || typeof runtime.identity.write !== 'function') {
    throw new Error(
      'createWorkspaces(runtime) needs runtime.identity from createPrototypeRuntime().'
    );
  }

  function list(): WorkspaceMember[] {
    const principal = requirePrincipal(runtime);
    const orgs = new Map(runtime.session.organizations().map((o) => [o.id, o]));
    return runtime.session
      .memberships()
      .filter((m) => m.personaId === principal.persona.id)
      .slice()
      .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.id.localeCompare(b.id))
      .flatMap((membership) => {
        const organization = orgs.get(membership.organizationId);
        return organization ? [{ organization, membership }] : [];
      });
  }

  async function create(input: CreateWorkspaceInput): Promise<WorkspaceMember> {
    const principal = requirePrincipal(runtime);
    runtime.session.assert(WORKSPACE_CAPABILITIES.create);
    const data = parseInput(CreateWorkspaceSchema, input);

    const created = await runtime.environment.run('workspaces.create', () =>
      runtime.identity.write(async (ops) => {
        const organization = await ops.putOrganization({
          name: data.name,
          type: data.type,
          size: 1,
        });
        const membership = await ops.putMembership({
          personaId: principal.persona.id,
          organizationId: organization.id,
          role: OWNER_ROLE,
        });
        return { organization, membership };
      })
    );

    await runtime.session.switchOrganization(created.organization.id);
    return created;
  }

  async function switchTo(organizationId: string): Promise<void> {
    const principal = requirePrincipal(runtime);
    if (!membershipFor(runtime, principal.persona.id, organizationId)) {
      throw new ValidationError({
        organizationId: 'You are not a member of that workspace.',
      });
    }
    // Switching is local control-state only (no environment.run): it must work offline.
    await runtime.session.switchOrganization(organizationId);
  }

  async function rename(
    organizationId: string,
    input: RenameWorkspaceInput
  ): Promise<Organization> {
    const principal = requirePrincipal(runtime);
    if (!membershipFor(runtime, principal.persona.id, organizationId)) {
      throw new ValidationError({
        organizationId: 'You are not a member of that workspace.',
      });
    }
    // The role that counts is the actor's role in the workspace being renamed.
    assertInOrg(runtime, WORKSPACE_CAPABILITIES.rename, organizationId);
    const data = parseInput(RenameWorkspaceSchema, input);

    return runtime.environment.run('workspaces.rename', () =>
      runtime.identity.write(async (ops) => {
        const current = await ops.getOrganization(organizationId);
        if (!current) {
          throw new ValidationError({
            organizationId: `Unknown workspace "${organizationId}".`,
          });
        }
        return ops.putOrganization({ ...current, name: data.name });
      })
    );
  }

  async function leave(organizationId?: string): Promise<void> {
    const principal = requirePrincipal(runtime);
    const orgId = organizationId ?? principal.organization?.id;
    if (!orgId) {
      throw new ValidationError({ organizationId: 'No active workspace to leave.' });
    }
    const mine = membershipFor(runtime, principal.persona.id, orgId);
    if (!mine) {
      throw new ValidationError({
        organizationId: 'You are not a member of that workspace.',
      });
    }
    assertInOrg(runtime, WORKSPACE_CAPABILITIES.leave, orgId);

    await runtime.environment.run('workspaces.leave', () =>
      runtime.identity.write(async (ops) => {
        const members = await ops.listMemberships({ organizationId: orgId });
        const membership = members.find((m) => m.id === mine.id);
        if (!membership) {
          throw new ValidationError({
            organizationId: 'You are not a member of that workspace.',
          });
        }
        if (membership.role === OWNER_ROLE) {
          const otherOwners = members.filter(
            (m) => m.role === OWNER_ROLE && m.id !== membership.id
          );
          if (otherOwners.length === 0) {
            throw new ValidationError({ membership: LAST_OWNER });
          }
        }
        await ops.removeMembership(membership.id);
      })
    );

    // identity.write already refreshed memberships; move the active org if needed.
    const remaining = runtime.session
      .memberships()
      .filter((m) => m.personaId === principal.persona.id);
    const activeId = runtime.session.principal()?.organization?.id;
    if (activeId === orgId || activeId == null) {
      const next = remaining[0];
      if (next) await runtime.session.switchOrganization(next.organizationId);
    }
  }

  async function transferOwnership(
    membershipId: string,
    options: { formerOwnerRole?: string } = {}
  ): Promise<void> {
    await runtime.members.transferOwnership(membershipId, options);
  }

  return { list, create, switchTo, rename, leave, transferOwnership };
}
