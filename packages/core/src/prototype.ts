import type { Faker } from '@faker-js/faker';
import { z } from 'zod';
import type { TimeHelpers } from './clock.ts';
import type { DomainEvent } from './events.ts';
import type { PrototypeManifest } from './manifest.ts';
import type { IdFactory, Rng } from './random.ts';
import type { Scenario, ScenarioDefinition } from './scenario.ts';
import type { Membership, Organization, Persona, PolicyDefinition } from './session.ts';
import type { Theme } from './theme.ts';

/**
 * The single object a prototype exports from `src/prototype.ts`. It wires the
 * static manifest (`protoyard.json`) to the prototype's own domain: database
 * schema, scenarios, generator, permission policy and timeline.
 *
 * Nothing here is domain-specific: the platform never assumes `deals`,
 * `tasks` or `messages` exist.
 */

/** Row shape stored in a table. Every row needs a stable string `id`. */
export type Row = { id: string } & Record<string, unknown>;

/**
 * Database schema in Dexie's store syntax (`'id, companyId, stage, *tags'`).
 * Versions are cumulative and must only grow. Reserved tables prefixed with
 * `py_` are added by the platform.
 */
export interface DatabaseVersion {
  version: number;
  stores: Record<string, string | null>;
  /**
   * Optional data migration. Receives the storage transaction (a Dexie
   * `Transaction` with the default adapter). Must never delete user data
   * unless the migration explicitly says so.
   */
  upgrade?: (tx: unknown) => void | Promise<void>;
}

export interface DatabaseDefinition {
  versions: readonly DatabaseVersion[];
}

/** Seeded identities + domain rows produced by a generator. */
export interface WorldSeed {
  organizations: Organization[];
  personas: Persona[];
  memberships: Membership[];
  /** Domain tables, keyed by table name. */
  tables: Record<string, Row[]>;
  /** Historical events (stored in `py_events`, source `seed`). */
  events?: DomainEvent[];
}

/** Everything a generator needs to build a deterministic world. */
export interface GenerateContext {
  scenario: Scenario;
  /** Seeded PRNG. Never use Math.random() in generators. */
  rng: Rng;
  /** Faker seeded from the scenario seed with a fixed reference date. */
  faker: Faker;
  /** Deterministic ids: `ids.next('deal') → deal_0001`. */
  ids: IdFactory;
  /** Date helpers anchored at `scenario.referenceTime`. */
  time: TimeHelpers;
  /** Scenario density mapped to a number for "how many": empty 0 → massive ~25x. */
  scale(base: number): number;
}

/** Time advance: emit the events that happen between two instants. */
export interface TimelineContext extends GenerateContext {
  from: Date;
  to: Date;
  /** Read-only access to current rows (for referential integrity). */
  read(table: string): Promise<Row[]>;
}

export interface EventApplyContext {
  /** Insert or update rows inside the same transaction. */
  put(table: string, row: Row): Promise<void>;
  get(table: string, id: string): Promise<Row | undefined>;
  remove(table: string, id: string): Promise<void>;
}

/**
 * Referential-integrity rules checked after every generation (scenario load).
 * `relations`: table → column → referenced table (`py_personas` allowed);
 * null/undefined values are allowed. `timestamps`: ISO columns that must lie
 * between the organization's creation and the scenario reference time.
 */
export interface IntegrityRules {
  relations?: Record<string, Record<string, string>>;
  timestamps?: Record<string, readonly string[]>;
}

/**
 * Simulated sign-in behavior (UX simulation, NOT authentication). Lives on
 * the definition, not in `protoyard.json`, so manifests stay data-only.
 */
export const PrototypeAuthOptionsSchema = z
  .object({
    /**
     * Start every scenario load signed out, so the app shows its sign-in
     * screen until a service calls `session.signIn(personaId)`. Default
     * `false`: the scenario actor is signed in, as in every prototype so far.
     */
    signedOutByDefault: z.boolean().default(false),
  })
  .strict();
export type PrototypeAuthOptions = z.input<typeof PrototypeAuthOptionsSchema>;

export interface PrototypeDefinition {
  manifest: PrototypeManifest;
  /** Opt-in simulated sign-in behavior. Omit to keep a signed-in persona. */
  auth?: PrototypeAuthOptions;
  database: DatabaseDefinition;
  /** Full scenarios or `extends` extensions (resolved against presets by the runtime). */
  scenarios: readonly ScenarioDefinition[];
  generate(ctx: GenerateContext): WorldSeed | Promise<WorldSeed>;
  /**
   * Version of THIS prototype's generator. Bump it whenever the same seed can
   * produce a different world; it is recorded with every scenario load.
   */
  generatorVersion?: number;
  policy?: PolicyDefinition;
  /** Validated on every scenario load; violations fail loudly. */
  integrity?: IntegrityRules;
  /** Prototype-specific themes in addition to the built-in presets. */
  themes?: readonly Theme[];
  /** Deterministic events for `scenarios.advance()`. Omit for preview-only time. */
  timeline?: (ctx: TimelineContext) => DomainEvent[] | Promise<DomainEvent[]>;
  /** Applies a timeline event to records (inside a transaction). */
  applyEvent?: (event: DomainEvent, ctx: EventApplyContext) => void | Promise<void>;
}

export function definePrototype(definition: PrototypeDefinition): PrototypeDefinition {
  if (definition.auth !== undefined) {
    const auth = PrototypeAuthOptionsSchema.safeParse(definition.auth);
    if (!auth.success) {
      const issue = auth.error.issues[0];
      throw new Error(
        `Invalid prototype "auth" options${issue ? ` (${issue.path.join('.') || 'auth'}: ${issue.message})` : ''}.`
      );
    }
  }
  const declared = new Set(definition.manifest.scenarios);
  for (const scenario of definition.scenarios) {
    if (declared.size > 0 && !declared.has(scenario.id)) {
      throw new Error(
        `Scenario "${scenario.id}" is not listed in protoyard.json "scenarios". Run \`pnpm protoyard validate ${definition.manifest.slug}\`.`
      );
    }
  }
  const versions = definition.database.versions.map((v) => v.version);
  for (let i = 1; i < versions.length; i++) {
    if ((versions[i] as number) <= (versions[i - 1] as number)) {
      throw new Error('database.versions must be strictly increasing');
    }
  }
  const latest = versions[versions.length - 1];
  if (latest !== definition.manifest.storage.schemaVersion) {
    throw new Error(
      `protoyard.json storage.schemaVersion (${definition.manifest.storage.schemaVersion}) must equal the latest database version (${latest}).`
    );
  }
  return definition;
}

/** Reserved platform tables added to every prototype database. */
export const RESERVED_TABLES = {
  py_organizations: 'id',
  py_personas: 'id',
  py_memberships: 'id, personaId, organizationId',
  py_events: 'id, type, at, source',
} as const;

export type ReservedTable = keyof typeof RESERVED_TABLES;
