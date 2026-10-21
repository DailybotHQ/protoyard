import type { Blueprint } from '@protoyard/blueprint';
import type { GenerateContext, PrototypeDefinition, WorldSeed } from '@protoyard/core';
import {
  BILLING_CAPABILITY,
  DEFAULT_ONBOARDING_CAPABILITY,
  generateSaasWorld,
  mergeIntegrity,
  SAAS_GENERATOR_VERSION,
  saasIntegrity,
  saasStores,
  WORKSPACE_CAPABILITIES,
} from '@protoyard/saas';

/**
 * Adds the SaaS kit to a blueprint's runtime definition, the way
 * docs/SAAS_KITS.md describes for a hand-written prototype:
 *
 * - the kit's `saas_*` stores in one more database version (the blueprint's
 *   own versions are untouched, so existing worlds upgrade in place);
 * - kit integrity merged with the blueprint's;
 * - kit rows (accounts, invitations, inbox, billing) generated from the same
 *   team the blueprint generator produced, after it, so worlds stay
 *   deterministic;
 * - the kit's self-service capabilities for every role, and workspace,
 *   member and billing management for roles that may change the archetype's
 *   workspace entity.
 *
 * Simulated: sign-in, invitations and billing are UX, never security or a
 * real provider.
 */

const SELF_SERVICE = [
  DEFAULT_ONBOARDING_CAPABILITY,
  'profile:update',
  'settings:notifications',
  'settings:security',
  WORKSPACE_CAPABILITIES.create,
  WORKSPACE_CAPABILITIES.leave,
];
const MANAGE = [
  BILLING_CAPABILITY,
  'members:invite',
  'members:transfer',
  WORKSPACE_CAPABILITIES.rename,
];

function canManage(capabilities: readonly string[], workspaceEntity: string): boolean {
  return capabilities.some(
    (capability) =>
      capability === '*' ||
      capability === `${workspaceEntity}:*` ||
      capability === `${workspaceEntity}:update` ||
      capability === '*:update'
  );
}

export function withSaasKit(
  definition: PrototypeDefinition,
  blueprint: Blueprint
): PrototypeDefinition {
  const archetype = blueprint.archetype;
  if (archetype?.id !== 'saas-onboarding') return definition;
  const versions = definition.database.versions;
  const last = versions[versions.length - 1]?.version ?? 0;
  const version = last + 1;
  const roles = Object.fromEntries(
    Object.entries(definition.policy?.roles ?? {}).map(([role, capabilities]) => [
      role,
      [
        ...new Set([
          ...capabilities,
          ...SELF_SERVICE,
          ...(canManage(capabilities, archetype.entities.workspaces) ? MANAGE : []),
        ]),
      ],
    ])
  );
  const baseGenerate = definition.generate;
  // Kit rows need the runtime's GenerateContext (rng, faker, ids), so this
  // archetype opts out of the context-free generateWorld path: the runtime
  // then calls generate, whose base still generates in the worker.
  const { generateWorld: _contextFree, ...rest } = definition;
  return {
    ...rest,
    manifest: {
      ...definition.manifest,
      storage: { ...definition.manifest.storage, schemaVersion: version },
    },
    database: {
      ...definition.database,
      versions: [...versions, { version, stores: saasStores() }],
    },
    integrity: mergeIntegrity(definition.integrity, saasIntegrity()),
    policy: { ...definition.policy, roles },
    generatorVersion: ((definition.generatorVersion ?? 1) * 31 + SAAS_GENERATOR_VERSION) >>> 0,
    async generate(ctx: GenerateContext): Promise<WorldSeed> {
      const base = await baseGenerate(ctx);
      const organization =
        base.organizations.find((candidate) => candidate.id === ctx.scenario.organization.id) ??
        base.organizations[0];
      const actor =
        base.personas.find((candidate) => candidate.id === ctx.scenario.actor.id) ??
        base.personas[0];
      if (!organization || !actor) return base;
      const saas = generateSaasWorld(ctx, {
        team: {
          organizations: base.organizations,
          personas: base.personas,
          memberships: base.memberships,
          organization,
          actor,
        },
      });
      return {
        ...base,
        organizations: saas.organizations,
        personas: saas.personas,
        memberships: saas.memberships,
        tables: { ...base.tables, ...saas.tables },
      };
    },
  };
}

/** Plans for the simulated billing screens (integer cents per seat; no card, no charge). */
export const PLAYER_BILLING_PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    unitAmountCents: 0,
    currency: 'USD',
    interval: 'month',
    trialDays: 14,
  },
  {
    id: 'team',
    name: 'Team',
    unitAmountCents: 1200,
    currency: 'USD',
    interval: 'month',
    trialDays: 14,
  },
  {
    id: 'business',
    name: 'Business',
    unitAmountCents: 4500,
    currency: 'USD',
    interval: 'month',
    trialDays: 14,
  },
] as const;
