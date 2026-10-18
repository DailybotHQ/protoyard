import {
  createRuntimeId,
  type Membership,
  MembershipSchema,
  type Organization,
  OrganizationSchema,
  type Persona,
  PersonaSchema,
} from '@protoyard/core';
import type { Kernel } from './kernel.ts';

/**
 * Runtime-created identities (sign-up, accepted invitations, new
 * workspaces). Rows are validated with the core schemas and written to the
 * reserved `py_personas` / `py_organizations` / `py_memberships` tables in
 * one transaction; afterwards the session re-reads identities and
 * re-resolves the principal. Snapshots capture these tables like any other.
 *
 * This is a low-level primitive: it does NOT check permissions (sign-up runs
 * signed out). Services call `session.assert` first when a policy applies and
 * wrap the call in `environment.run`. Simulated identities are UX
 * simulation, not authentication.
 */

/** Thrown before anything is written; `issues` maps field → message (form-friendly). */
export class IdentityValidationError extends Error {
  readonly code = 'invalid-identity' as const;
  readonly issues: Record<string, string>;

  constructor(entity: string, issues: Record<string, string>) {
    super(`Invalid ${entity}: ${Object.values(issues).join('; ') || 'unknown error'}.`);
    this.name = 'IdentityValidationError';
    this.issues = issues;
  }
}

type WithOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/** `id` defaults to a runtime id, `joinedAt` to the simulated clock; schema defaults apply. */
export type PersonaInput = WithOptional<
  Persona,
  'id' | 'joinedAt' | 'locale' | 'timezone' | 'onboardingComplete' | 'preferences'
>;
/** `id` defaults to a runtime id, `createdAt` to the simulated clock; schema defaults apply. */
export type OrganizationInput = WithOptional<
  Organization,
  'id' | 'createdAt' | 'type' | 'plan' | 'billingStatus' | 'size' | 'featureFlags'
>;
/** `id` defaults to a runtime id, `joinedAt` to the simulated clock; schema defaults apply. */
export type MembershipInput = WithOptional<Membership, 'id' | 'joinedAt' | 'capabilities'>;

/** Operations available inside `identity.write(…)`, all in the same transaction. */
export interface IdentityOps {
  /** Validates with `PersonaSchema` (defaults filled) and inserts or replaces. */
  putPersona(input: PersonaInput): Promise<Persona>;
  /** Validates with `OrganizationSchema` (defaults filled) and inserts or replaces. */
  putOrganization(input: OrganizationInput): Promise<Organization>;
  /**
   * Validates with `MembershipSchema`; the persona and organization must
   * exist and a persona belongs to an organization at most once.
   */
  putMembership(input: MembershipInput): Promise<Membership>;
  getPersona(id: string): Promise<Persona | undefined>;
  getOrganization(id: string): Promise<Organization | undefined>;
  getMembership(id: string): Promise<Membership | undefined>;
  /** Memberships matching every given field. */
  listMemberships(filter?: { personaId?: string; organizationId?: string }): Promise<Membership[]>;
  removeMembership(id: string): Promise<void>;
}

export interface IdentityWriteOptions {
  /** Domain tables written in the same transaction (e.g. a `workspaces` row). */
  tables?: readonly string[];
}

export interface IdentityController {
  /**
   * Runs `fn` in one read-write transaction over the identity tables (plus
   * `options.tables`), then refreshes the session so `personas()`,
   * `memberships()` and `principal()` include the change. If `fn` throws,
   * nothing is written.
   */
  write<T>(fn: (ops: IdentityOps) => T | Promise<T>, options?: IdentityWriteOptions): Promise<T>;
}

export const IDENTITY_TABLES = ['py_personas', 'py_organizations', 'py_memberships'] as const;

interface Schema<T> {
  safeParse(
    input: unknown
  ):
    | { success: true; data: T }
    | { success: false; error: { issues: readonly { path: PropertyKey[]; message: string }[] } };
}

function parse<T>(entity: string, schema: Schema<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issues: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.map(String).join('.') || entity;
    issues[key] ??= issue.message;
  }
  throw new IdentityValidationError(entity, issues);
}

export function createIdentityController(k: Kernel): IdentityController {
  const now = () => k.clock.now().toISOString();
  const personas = () => k.db.table('py_personas');
  const organizations = () => k.db.table('py_organizations');
  const memberships = () => k.db.table('py_memberships');

  const ops: IdentityOps = {
    async putPersona(input) {
      const persona = parse('persona', PersonaSchema, {
        ...input,
        id: input.id ?? createRuntimeId('user'),
        joinedAt: input.joinedAt ?? now(),
      });
      await personas().put(persona);
      return persona;
    },

    async putOrganization(input) {
      const organization = parse('organization', OrganizationSchema, {
        ...input,
        id: input.id ?? createRuntimeId('org'),
        createdAt: input.createdAt ?? now(),
      });
      await organizations().put(organization);
      return organization;
    },

    async putMembership(input) {
      const membership = parse('membership', MembershipSchema, {
        ...input,
        id: input.id ?? createRuntimeId('mem'),
        joinedAt: input.joinedAt ?? now(),
      });
      const issues: Record<string, string> = {};
      if (!(await personas().get(membership.personaId))) {
        issues.personaId = `Unknown persona "${membership.personaId}"`;
      }
      if (!(await organizations().get(membership.organizationId))) {
        issues.organizationId = `Unknown organization "${membership.organizationId}"`;
      } else {
        const existing = (await memberships()
          .where('personaId')
          .equals(membership.personaId)
          .toArray()) as Membership[];
        if (
          existing.some(
            (m) => m.organizationId === membership.organizationId && m.id !== membership.id
          )
        ) {
          issues.organizationId = 'This persona already belongs to that organization';
        }
      }
      if (Object.keys(issues).length) throw new IdentityValidationError('membership', issues);
      await memberships().put(membership);
      return membership;
    },

    // Plain Dexie promises (no extra async layer) keep the transaction zone intact.
    getPersona: (id) => personas().get(id) as Promise<Persona | undefined>,
    getOrganization: (id) => organizations().get(id) as Promise<Organization | undefined>,
    getMembership: (id) => memberships().get(id) as Promise<Membership | undefined>,

    listMemberships(filter = {}) {
      const query =
        filter.personaId !== undefined
          ? memberships().where('personaId').equals(filter.personaId)
          : filter.organizationId !== undefined
            ? memberships().where('organizationId').equals(filter.organizationId)
            : memberships().toCollection();
      return query
        .toArray()
        .then((rows) =>
          (rows as Membership[])
            .filter(
              (m) =>
                (filter.personaId === undefined || m.personaId === filter.personaId) &&
                (filter.organizationId === undefined || m.organizationId === filter.organizationId)
            )
            .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.id.localeCompare(b.id))
        );
    },

    removeMembership: (id) => memberships().delete(id),
  };

  return {
    async write(fn, options = {}) {
      const tables = [...new Set<string>([...IDENTITY_TABLES, ...(options.tables ?? [])])];
      for (const name of tables) {
        if (!k.db.hasTable(name)) throw new Error(`Unknown table "${name}".`);
      }
      // An async scope lets Dexie keep the transaction zone across the caller's
      // own async helpers and awaited plain values (PrematureCommitError otherwise).
      const result = await k.db.transaction('rw', tables, async () => fn(ops));
      await k.reloadIdentity();
      k.refreshDerived();
      return result;
    },
  };
}
