import {
  type Membership,
  type Organization,
  PermissionDeniedError,
  type PermissionPolicy,
  type Principal,
  resolvePrincipal,
} from '@protoyard/core';

/**
 * Organization-scoped capability checks for the SaaS kit (simulated policy,
 * not security).
 *
 * `session.assert` checks the principal's ACTIVE organization role; a
 * resource only feeds optional `rules`. A mutation that targets another
 * organization (rename workspace B while A is active, revoke B's invitation)
 * must instead be checked with the actor's role in THAT organization.
 */

/** The slice of a runtime that `assertInOrg` reads. */
export interface OrgAccessRuntime {
  session: {
    principal(): Principal | null;
    memberships(): readonly Membership[];
    organizations(): readonly Organization[];
    assert(capability: string, resource?: unknown): void;
  };
  policy: PermissionPolicy;
}

/** The signed-in persona's membership in `organizationId`, if any. */
export function membershipInOrg(
  runtime: OrgAccessRuntime,
  organizationId: string
): Membership | undefined {
  const personaId = runtime.session.principal()?.persona.id;
  if (!personaId) return undefined;
  return runtime.session
    .memberships()
    .find((m) => m.personaId === personaId && m.organizationId === organizationId);
}

/**
 * Assert `capability` for the signed-in persona in `organizationId` and return
 * that membership. Throws `PermissionDeniedError` when signed out, when the
 * persona is not a member of the organization, or when that membership's role
 * (plus its extra capabilities, honoring `-capability` denials) lacks it.
 *
 * For the active organization this is exactly `session.assert`, so DevTools
 * role overrides keep working. For any other organization the principal is
 * resolved from the target membership and checked with the same policy
 * (including `rules`). `resource` defaults to `{ organizationId }`.
 */
export function assertInOrg(
  runtime: OrgAccessRuntime,
  capability: string,
  organizationId: string,
  resource: unknown = { organizationId }
): Membership {
  const principal = runtime.session.principal();
  if (!principal) throw new PermissionDeniedError(capability, null);

  const active = principal.organization?.id === organizationId ? principal.membership : null;
  if (active && active.organizationId === organizationId) {
    runtime.session.assert(capability, resource);
    return active;
  }

  const membership = membershipInOrg(runtime, organizationId);
  if (!membership) throw new PermissionDeniedError(capability, null);
  const organization = runtime.session.organizations().find((o) => o.id === organizationId) ?? null;
  const target = resolvePrincipal(principal.persona, organization, membership, runtime.policy);
  runtime.policy.assert(target, capability, resource);
  return membership;
}
