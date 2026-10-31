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
import {
  DOC_EDITS_STORE_STRING,
  FORM_CAPABILITIES,
  FORM_RESPONSES_STORE_STRING,
} from '@protoyard/pages';
import type { ContentBlueprint } from './envelope.ts';
import type { ContentKind } from './kind.ts';

/**
 * The runtime definition of a content-kind blueprint (deck, page, doc;
 * ADR-036): what `definePrototypeFromBlueprint` is for apps, without the
 * entity derivations. Both the player and generated kind prototypes use it,
 * so a deck behaves the same at both levels.
 *
 * - **Storage:** three stores: `blockStates` (interactive block state, keyed
 *   by `stateKey(documentId, blockId)`), `formResponses` (submitted form
 *   blocks) and, from database version 2, `docEdits` (a doc's saved edits,
 *   `@protoyard/pages` `createDocEditServices`). Writes go through services,
 *   never components.
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
  /**
   * Saved doc edits, one row per doc and world — same row contract as
   * `@protoyard/pages` `DOC_EDITS_STORE_STRING` (PLAN_008 decision D3).
   */
  docEdits: DOC_EDITS_STORE_STRING,
});

/**
 * The database versions of a content-kind prototype. Version 1 had no
 * `docEdits`; version 2 adds it, so a browser that holds version 1 data
 * upgrades in place and keeps its block states and form responses.
 */
export const KIND_DATABASE_VERSIONS = Object.freeze([
  {
    version: 1,
    stores: { blockStates: KIND_STORES.blockStates, formResponses: KIND_STORES.formResponses },
  },
  { version: 2, stores: { ...KIND_STORES } },
]);

/** The latest kind database version (the manifest's `storage.schemaVersion`). */
export const KIND_SCHEMA_VERSION = 2;

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

/** {@link defineKindPrototype} options: the blueprint brand, already resolved. */
export interface KindPrototypeOptions extends KindRuntimeOptions {
  /** The theme the prototype opens in (`kindDefaultThemeId`); `null` for the default theme. */
  defaultThemeId: string | null;
  /** The built brand theme to register (`kindBrandTheme`); `null` for none or a library brand. */
  brandTheme: Theme | null;
}

/** Any parsed content-kind blueprint. */
/** One content blueprint of any kind (a union over kinds, not an intersection of bodies). */
export type AnyContentBlueprint = { [K in ContentKind]: ContentBlueprint<K> }[ContentKind];

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
    tables: { blockStates: [], formResponses: [], docEdits: [] },
  };
}

/**
 * Builds a `definePrototype`-valid definition for a deck, page or doc whose
 * brand is already resolved. Generated kind prototypes call it with the theme
 * `protoyard generate` resolved, so their first chunk never loads the palette
 * generator a seed brand needs; `defineKindRuntime` resolves the brand first.
 */
export function defineKindPrototype(
  doc: AnyContentBlueprint,
  options: KindPrototypeOptions
): PrototypeDefinition {
  const slug = options.slug ?? options.namespace;
  const theme = options.brandTheme;
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
    defaultTheme: options.defaultThemeId ?? 'violet',
    preview: { viewport: 'desktop' },
    storage: { namespace: options.namespace, schemaVersion: KIND_SCHEMA_VERSION },
    scenarios: scenarios.map((scenario) => scenario.id),
  });
  return definePrototype({
    manifest,
    database: {
      versions: KIND_DATABASE_VERSIONS.map((entry) => ({
        version: entry.version,
        stores: { ...entry.stores },
      })),
    },
    scenarios,
    policy: kindPolicy(),
    ...(theme ? { themes: [theme] } : {}),
    generate: (ctx) => kindWorld(ctx.scenario),
    generateWorld: async (scenario) => kindWorld(scenario),
    generatorVersion: KIND_GENERATOR_VERSION,
  });
}
