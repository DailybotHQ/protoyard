import {
  definePrototype,
  type Membership,
  type Organization,
  type Persona,
  type PolicyDefinition,
  type PrototypeDefinition,
  parseManifest,
  type Scenario,
  type ScenarioDefinition,
  type Theme,
  type WorldSeed,
} from '@protoyard/core';
import { FORM_CAPABILITIES, FORM_RESPONSES_STORE_STRING } from '@protoyard/pages';
import { brandLibraryThemeId, resolveBlueprintBrand } from '../brand.ts';
import type { ContentBlueprint } from './envelope.ts';
import type { ContentKind } from './kind.ts';

/**
 * The runtime definition of a content-kind blueprint (deck, page, doc;
 * ADR-036): what `definePrototypeFromBlueprint` is for apps, without the
 * entity derivations. Both the player and generated kind prototypes use it,
 * so a deck behaves the same at both levels.
 *
 * - **Storage:** one Dexie version with two stores: `blockStates`
 *   (interactive block state, keyed by `stateKey(documentId, blockId)`) and
 *   `formResponses` (submitted form blocks). Writes go through the services
 *   in `services.ts`, never components.
 * - **World:** one `default` scenario and three simulated personas, a
 *   presenter, an audience member and a viewer, built from fixed data (no
 *   world generator, no Faker). `generateWorld` makes the runtime skip the
 *   generation context entirely.
 * - **Policy:** presenters interact, answer and read every response;
 *   audience members interact and answer; viewers only look. Simulated, not
 *   security.
 */

/** The scenario every content kind opens in (the only one it declares). */
export const KIND_DEFAULT_SCENARIO = 'default';

/** Bump when the kind world (personas, organization) can change for the same scenario. */
export const KIND_GENERATOR_VERSION = 1;

/** The Dexie stores of a content-kind prototype. */
export const KIND_STORES = Object.freeze({
  /** Interactive block state: `key` is `stateKey(documentId, blockId)`. */
  blockStates: 'key, documentId, blockId, updatedAt',
  /**
   * Submitted form blocks — same row contract and indexes as
   * `@protoyard/pages` `FORM_RESPONSES_STORE_STRING` (lead form contract).
   */
  formResponses: FORM_RESPONSES_STORE_STRING,
});

/**
 * Capabilities the kind services assert (simulated policy, not security).
 * Form caps are the canonical `@protoyard/pages` FORM_CAPABILITIES strings so
 * createFormServices and createKindServices share one policy vocabulary.
 */
export const KIND_CAPABILITIES = Object.freeze({
  /** Vote, answer, change a calculator, open a tab… on an interactive block. */
  interact: 'blocks:interact',
  /** Submit a form block (`form:submit`). */
  respond: FORM_CAPABILITIES.submit,
  /** Read form responses (`form:read`). */
  readResponses: FORM_CAPABILITIES.read,
  /** Clear / administer responses (`form:admin`). */
  adminResponses: FORM_CAPABILITIES.admin,
});

/** The simulated roles of a content-kind prototype. */
export const KIND_ROLES = Object.freeze({
  /** Presenter: interact, submit/read forms, and administer responses. */
  presenter: [
    KIND_CAPABILITIES.interact,
    KIND_CAPABILITIES.respond,
    KIND_CAPABILITIES.readResponses,
    KIND_CAPABILITIES.adminResponses,
  ],
  /** Audience: interact and submit/read forms. */
  audience: [
    KIND_CAPABILITIES.interact,
    KIND_CAPABILITIES.respond,
    KIND_CAPABILITIES.readResponses,
  ],
  /** Viewer: submit and read forms (no interactive block mutations). */
  viewer: [KIND_CAPABILITIES.respond, KIND_CAPABILITIES.readResponses],
} satisfies Record<string, readonly string[]>);

export type KindRole = keyof typeof KIND_ROLES;

/** Fixed persona ids (valid block viewer ids). */
export const KIND_PERSONAS = Object.freeze({
  presenter: 'presenter',
  audience: 'audience',
  viewer: 'viewer',
} satisfies Record<KindRole, string>);

const ORGANIZATION_ID = 'org_kind';

export interface KindRuntimeOptions {
  /** Storage namespace (IndexedDB names): usually the content namespace (`bp-…`). */
  namespace: string;
  /** Manifest slug; defaults to the namespace. */
  slug?: string;
  /** Manifest version (default `0.1.0`). */
  version?: string;
}

/** Any parsed content-kind blueprint. */
/** One content blueprint of any kind (a union over kinds, not an intersection of bodies). */
export type AnyContentBlueprint = { [K in ContentKind]: ContentBlueprint<K> }[ContentKind];

/** The theme id a content blueprint opens in: its library theme, its built brand theme, or null. */
export function kindDefaultThemeId(doc: AnyContentBlueprint): string | null {
  if (!doc.brand) return null;
  return (
    brandLibraryThemeId(doc.brand) ??
    resolveBlueprintBrand(doc.brand, { blueprintName: doc.name }).id
  );
}

function kindBrandTheme(doc: AnyContentBlueprint): Theme | null {
  if (!doc.brand || brandLibraryThemeId(doc.brand)) return null;
  return resolveBlueprintBrand(doc.brand, { blueprintName: doc.name });
}

export function kindScenarios(): ScenarioDefinition[] {
  return [
    {
      id: KIND_DEFAULT_SCENARIO,
      name: 'Default',
      description: 'The presenter with an audience member and a viewer to switch to.',
      seed: 136_001,
      referenceTime: '2026-06-01T09:00:00.000Z',
      density: 'empty',
      organization: { id: ORGANIZATION_ID, size: 3, ageDays: 30, subscription: 'free' },
      actor: { id: KIND_PERSONAS.presenter, role: 'presenter', onboardingComplete: true },
    },
  ];
}

export function kindPolicy(): PolicyDefinition {
  return {
    roles: Object.fromEntries(Object.entries(KIND_ROLES).map(([role, caps]) => [role, [...caps]])),
  };
}

const PEOPLE: readonly { role: KindRole; name: string; title: string; avatar: string }[] = [
  { role: 'presenter', name: 'Rowan Presenter', title: 'Presenter', avatar: 'av-012' },
  { role: 'audience', name: 'Sam Audience', title: 'Audience member', avatar: 'av-047' },
  { role: 'viewer', name: 'Vera Viewer', title: 'Viewer (read only)', avatar: 'av-103' },
];

/**
 * The kind world for a scenario: an organization and the three personas,
 * from fixed data and the scenario's reference time only, so the same
 * scenario always gives the same world.
 */
export function kindWorld(scenario: Pick<Scenario, 'referenceTime' | 'organization'>): WorldSeed {
  const joinedAt = new Date(Date.parse(scenario.referenceTime) - 30 * 86_400_000).toISOString();
  const organizationId = scenario.organization?.id ?? ORGANIZATION_ID;
  const organization: Organization = {
    id: organizationId,
    name: 'Example audience',
    type: 'audience',
    plan: 'free',
    billingStatus: 'none',
    createdAt: joinedAt,
    size: PEOPLE.length,
    featureFlags: {},
  };
  const personas: Persona[] = PEOPLE.map((person) => ({
    id: KIND_PERSONAS[person.role],
    name: person.name,
    email: `${person.role}@example.com`,
    avatar: person.avatar,
    title: person.title,
    locale: 'en-US',
    timezone: 'UTC',
    joinedAt,
    onboardingComplete: true,
    preferences: {},
    summary: `${person.title}. Simulated persona.`,
  }));
  const memberships: Membership[] = PEOPLE.map((person) => ({
    id: `m_${person.role}`,
    personaId: KIND_PERSONAS[person.role],
    organizationId,
    role: person.role,
    joinedAt,
    capabilities: [],
  }));
  return {
    organizations: [organization],
    personas,
    memberships,
    tables: { blockStates: [], formResponses: [] },
  };
}

/**
 * Builds a `definePrototype`-valid definition for a deck, page or doc. Throws
 * `BrandThemeError` for an unknown library theme or a brand that fails AA,
 * like the app path.
 */
export function defineKindRuntime(
  doc: AnyContentBlueprint,
  options: KindRuntimeOptions
): PrototypeDefinition {
  const slug = options.slug ?? options.namespace;
  const theme = kindBrandTheme(doc);
  const scenarios = kindScenarios();
  const manifest = parseManifest({
    id: `local.${slug}`,
    slug,
    kind: 'prototype',
    name: doc.name,
    description: doc.description ?? '',
    version: options.version ?? '0.1.0',
    category: doc.category ?? doc.catalog?.category ?? doc.kind,
    tags: doc.tags,
    ...(doc.icon ? { icon: doc.icon } : {}),
    defaultScenario: KIND_DEFAULT_SCENARIO,
    defaultTheme: kindDefaultThemeId(doc) ?? 'violet',
    preview: { viewport: 'desktop' },
    storage: { namespace: options.namespace, schemaVersion: 1 },
    scenarios: scenarios.map((scenario) => scenario.id),
  });
  return definePrototype({
    manifest,
    database: { versions: [{ version: 1, stores: { ...KIND_STORES } }] },
    scenarios,
    policy: kindPolicy(),
    ...(theme ? { themes: [theme] } : {}),
    generate: (ctx) => kindWorld(ctx.scenario),
    generateWorld: async (scenario) => kindWorld(scenario),
    generatorVersion: KIND_GENERATOR_VERSION,
  });
}
