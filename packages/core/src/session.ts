import { z } from 'zod';
import { ColorModeSchema } from './manifest.ts';

/**
 * Simulated identities. This is UX simulation, NOT authentication: everything
 * lives in the browser and any script on the same origin can change it.
 */

export const DEFAULT_ROLES = ['owner', 'admin', 'member', 'viewer'] as const;
export type DefaultRole = (typeof DEFAULT_ROLES)[number];
/** Prototypes may define custom roles; defaults are only a convention. */
export type Role = DefaultRole | (string & {});

export const OrganizationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Free-form type label: "company", "household", "school"… */
  type: z.string().default('company'),
  plan: z.string().default('free'),
  billingStatus: z.enum(['active', 'trialing', 'past_due', 'expired', 'none']).default('active'),
  createdAt: z.string(),
  size: z.number().int().nonnegative().default(1),
  featureFlags: z.record(z.string(), z.boolean()).default({}),
});
export type Organization = z.infer<typeof OrganizationSchema>;

export const PersonaSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().optional(),
  avatarColor: z.string().optional(),
  title: z.string().optional(),
  locale: z.string().default('en-US'),
  timezone: z.string().default('UTC'),
  joinedAt: z.string(),
  onboardingComplete: z.boolean().default(true),
  preferences: z
    .object({
      themeId: z.string().optional(),
      mode: ColorModeSchema.optional(),
      reducedMotion: z.boolean().optional(),
    })
    .default({}),
  /** Short line shown in the persona switcher ("Sales rep, joined 30 days ago"). */
  summary: z.string().optional(),
});
export type Persona = z.infer<typeof PersonaSchema>;

export const MembershipSchema = z.object({
  id: z.string().min(1),
  personaId: z.string().min(1),
  organizationId: z.string().min(1),
  role: z.string().min(1),
  joinedAt: z.string(),
  /** Extra capabilities on top of the role (or removals with a `-` prefix). */
  capabilities: z.array(z.string()).default([]),
});
export type Membership = z.infer<typeof MembershipSchema>;

/** The resolved principal the UI and services act as. */
export interface Principal {
  persona: Persona;
  organization: Organization | null;
  membership: Membership | null;
  role: Role | null;
  capabilities: ReadonlySet<string>;
}

/**
 * Capability-based policy. A prototype declares which capabilities each role
 * grants; `*` grants everything. Services call `assert` so a forbidden action
 * fails even when the UI is bypassed.
 */
export interface PolicyDefinition {
  roles: Record<string, readonly string[]>;
  /** Optional record-level rule, e.g. "reps can edit only their own deals". */
  rules?: Record<string, (principal: Principal, resource: unknown) => boolean>;
}

export class PermissionDeniedError extends Error {
  readonly code = 'permission-denied' as const;
  constructor(
    readonly capability: string,
    readonly role: Role | null
  ) {
    super(
      `Permission denied: role "${role ?? 'none'}" lacks "${capability}". (Simulated policy — not real security.)`
    );
    this.name = 'PermissionDeniedError';
  }
}

export interface PermissionPolicy {
  readonly definition: PolicyDefinition;
  capabilitiesFor(role: Role | null, extra?: readonly string[]): Set<string>;
  can(principal: Principal | null, capability: string, resource?: unknown): boolean;
  assert(principal: Principal | null, capability: string, resource?: unknown): void;
}

/** Sensible defaults; prototypes usually override with domain capabilities. */
export const DEFAULT_POLICY: PolicyDefinition = {
  roles: {
    owner: ['*'],
    admin: ['*', '-billing:manage'],
    member: ['records:read', 'records:create', 'records:update', 'records:delete:own'],
    viewer: ['records:read'],
  },
};

export function definePolicy(definition: PolicyDefinition): PolicyDefinition {
  return definition;
}

export function createPermissionPolicy(
  definition: PolicyDefinition = DEFAULT_POLICY
): PermissionPolicy {
  const capabilitiesFor = (role: Role | null, extra: readonly string[] = []) => {
    // Denials are kept as `-capability` entries and always win in `has`.
    return new Set<string>([...(role ? (definition.roles[role] ?? []) : []), ...extra]);
  };

  const has = (caps: ReadonlySet<string>, capability: string) => {
    if (caps.has(`-${capability}`)) return false;
    return caps.has('*') || caps.has(capability);
  };

  const can: PermissionPolicy['can'] = (principal, capability, resource) => {
    if (!principal) return false;
    if (!has(principal.capabilities, capability)) return false;
    const rule = definition.rules?.[capability];
    return rule ? rule(principal, resource) : true;
  };

  return {
    definition,
    capabilitiesFor,
    can,
    assert(principal, capability, resource) {
      if (!can(principal, capability, resource)) {
        throw new PermissionDeniedError(capability, principal?.role ?? null);
      }
    },
  };
}

export function resolvePrincipal(
  persona: Persona,
  organization: Organization | null,
  membership: Membership | null,
  policy: PermissionPolicy,
  roleOverride?: Role | null
): Principal {
  const role = roleOverride ?? membership?.role ?? null;
  return {
    persona,
    organization,
    membership,
    role,
    capabilities: policy.capabilitiesFor(role, membership?.capabilities ?? []),
  };
}
