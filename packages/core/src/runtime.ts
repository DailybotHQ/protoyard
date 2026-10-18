import { z } from 'zod';
import type { Duration, SimulationClock } from './clock.ts';
import type { DeviceId, Orientation } from './devices.ts';
import type { EnvironmentState, SimulationEnvironment } from './environment.ts';
import type {
  ColorMode,
  PrototypeManifest,
  ResolvedShell,
  Shell,
  ViewportPreset,
} from './manifest.ts';
import type { Effective, Overrides } from './overrides.ts';
import type { PrototypeDefinition } from './prototype.ts';
import type { Scenario } from './scenario.ts';
import type { Membership, Organization, PermissionPolicy, Persona, Principal } from './session.ts';
import type { Snapshot, SnapshotSummary } from './snapshot.ts';
import type { Theme } from './theme.ts';

/**
 * Framework-agnostic runtime contract. `@protoyard/runtime` implements it;
 * `@protoyard/renderer-svelte` exposes it to components as reactive state.
 *
 * Three operations are never conflated:
 *   A. scenarios.load()  — rebuild a world from a versioned seed (destructive, scoped).
 *   B. overrides.set()   — non-destructive toggle (actor, role, env, appearance).
 *   C. snapshots.*       — capture/restore the actual world after manual edits.
 */

export type Unsubscribe = () => void;

export interface StorageStatus {
  /** `indexeddb` normally; `memory` when IndexedDB is unavailable. */
  backend: 'indexeddb' | 'memory';
  persistent: boolean;
  /** Human-readable reason when persistence is degraded. */
  warning?: string;
  /** Result of navigator.storage.persist(), when requested. */
  persisted?: boolean;
  usageBytes?: number;
  quotaBytes?: number;
}

export interface ActiveScenarioInfo {
  scenario: Scenario;
  loadedAt: string;
  /** Seed actually used (a link may override the scenario default). */
  seed: number;
  /** `@protoyard/scenarios` SDK version used for the load. */
  generatorVersion: number;
  /** The prototype's own `definition.generatorVersion`, when declared. */
  prototypeGeneratorVersion?: number;
}

/**
 * Phases of building a world. `write` reports rows written so far; the other
 * phases report 0/1 → 1/1. `done` is emitted once, after the world is live.
 */
export type LoadPhase = 'generate' | 'validate' | 'write' | 'done';

export interface LoadProgress {
  scenarioId: string;
  phase: LoadPhase;
  done: number;
  total: number;
}

export interface LoadScenarioOptions {
  seed?: number;
  /** Save a safety snapshot of the current world before replacing it. */
  snapshotFirst?: boolean;
  /** Called as the load advances (also broadcast via `scenarios.subscribeProgress`). */
  onProgress?: (progress: LoadProgress) => void;
}

export interface ScenarioController {
  list(): readonly Scenario[];
  get(id: string): Scenario | undefined;
  active(): ActiveScenarioInfo | null;
  /** First run only: seeds the default scenario if the DB is empty. Never resets edits. */
  ensureSeeded(): Promise<void>;
  /** A. Destructive, scoped to this prototype's DB. */
  load(id: string, options?: LoadScenarioOptions): Promise<void>;
  /** Reloads the active scenario from its seed. */
  reset(options?: Pick<LoadScenarioOptions, 'snapshotFirst' | 'onProgress'>): Promise<void>;
  /** Commits deterministic timeline events up to now + duration. Idempotent. */
  advance(duration: Duration): Promise<{ applied: number; skipped: number }>;
  subscribe(listener: (info: ActiveScenarioInfo | null) => void): Unsubscribe;
  /** The load in flight (any caller), or null when idle. */
  progress(): LoadProgress | null;
  /** Fires on every progress step, then once with `null` when the load settles. */
  subscribeProgress(listener: (progress: LoadProgress | null) => void): Unsubscribe;
}

/**
 * Whether someone is acting in the prototype. This is UX simulation, NOT
 * authentication: it decides whether the app shows its signed-in screens or
 * its sign-in screen, and any script on the page can change it.
 */
export type SessionAuthState = 'signed-in' | 'signed-out';

export interface SessionController {
  /**
   * The persona the UI and services act as. `null` when the world has no
   * personas, or when the session is signed out (`signOut()`, or a prototype
   * with `auth.signedOutByDefault`) and no DevTools actor override is set.
   */
  principal(): Principal | null;
  personas(): readonly Persona[];
  organizations(): readonly Organization[];
  memberships(): readonly Membership[];
  /**
   * B. Non-destructive: records stay, visibility/permissions adapt. While
   * signed out it only changes who `signIn` remembers; it never signs in.
   */
  switchActor(personaId: string): Promise<void>;
  /**
   * Simulated sign-in: acts as `personaId` (throws for an unknown persona)
   * and persists the signed-in state. A DevTools actor override is cleared.
   */
  signIn(personaId: string): Promise<void>;
  /**
   * Simulated sign-out: `principal()` becomes null until `signIn` (or a
   * scenario load / snapshot restore that is signed in). Persisted, so it
   * survives a reload. Records are untouched. A DevTools actor override is cleared.
   */
  signOut(): Promise<void>;
  /** `true` when `principal()` resolves a persona. */
  isSignedIn(): boolean;
  /** `'signed-in'` when `principal()` resolves a persona, else `'signed-out'`. */
  authState(): SessionAuthState;
  switchOrganization(organizationId: string): Promise<void>;
  can(capability: string, resource?: unknown): boolean;
  /** Throws PermissionDeniedError. Services call this, not only the UI. */
  assert(capability: string, resource?: unknown): void;
  /** Re-reads personas/orgs from the DB (after load/restore). */
  refresh(): Promise<void>;
  subscribe(listener: (principal: Principal | null) => void): Unsubscribe;
}

/** Capabilities the members services assert (simulated policy, not security). */
export const MEMBER_CAPABILITIES = {
  invite: 'members:invite',
  update: 'members:update',
  remove: 'members:remove',
  /** Changing who owns an organization (promote to / demote from `owner`, transfer). */
  transfer: 'members:transfer',
} as const;

/** The role the at-least-one-owner invariant protects. */
export const OWNER_ROLE = 'owner';

/** Reserved example domains (RFC 2606/6761): invited people are always fictional. */
export function isExampleEmail(email: string): boolean {
  const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase();
  return (
    ['example.com', 'example.org', 'example.net'].includes(domain) || domain.endsWith('.example')
  );
}

export const InviteMemberInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter a name').max(120),
    /** Must use an example domain; derived from the name when omitted. */
    email: z
      .string()
      .trim()
      .toLowerCase()
      .pipe(z.email('Enter a valid email'))
      .refine(isExampleEmail, 'Use a fictional address at example.com')
      .optional(),
    role: z.string().trim().min(1, 'Choose a role'),
    title: z.string().trim().max(120).optional(),
    /** Defaults to the principal's organization. */
    organizationId: z.string().min(1).optional(),
  })
  .strict();
export type InviteMemberInput = z.input<typeof InviteMemberInputSchema>;

export interface Member {
  membership: Membership;
  persona: Persona;
}

/**
 * Team management on simulated identities. Every mutation follows the
 * service path: `session.assert(members:*)` → validation → `environment.run`
 * → one transaction over the identity tables, then the session re-resolves
 * the principal. Invariant: an organization that has an owner never loses
 * its last one. This is UX simulation, not security.
 */
export interface MembersController {
  /** Members of an organization (default: the principal's), oldest first. */
  list(organizationId?: string): readonly Member[];
  /**
   * Creates a persona (or reuses the one with that email) and a membership.
   * Throws a validation error (`issues`) for unknown roles, non-example
   * emails or someone who is already a member.
   */
  invite(input: InviteMemberInput): Promise<Member>;
  changeRole(membershipId: string, role: string): Promise<Membership>;
  /** Removes a membership; the persona and its records stay. */
  remove(membershipId: string): Promise<void>;
  /**
   * Makes the target member the owner and gives the acting owner
   * `formerOwnerRole` (default `admin`), in one transaction.
   */
  transferOwnership(membershipId: string, options?: { formerOwnerRole?: string }): Promise<void>;
}

export interface OverrideController {
  get(): Overrides;
  set(patch: Overrides): Promise<void>;
  clear(keys?: readonly (keyof Overrides)[]): Promise<void>;
  subscribe(listener: (overrides: Overrides) => void): Unsubscribe;
}

export interface AppearanceState {
  theme: Effective<string>;
  mode: Effective<ColorMode>;
  /** `system` resolved through prefers-color-scheme. */
  resolvedMode: 'light' | 'dark';
  reducedMotion: Effective<boolean>;
  /** Spacing multiplier: override, else the active theme's `density`. */
  density: Effective<number>;
  viewport: Effective<ViewportPreset>;
  /**
   * Presentation shell (ADR-016): override › scenario › `preview.shell`, with
   * `auto` resolved from the platform. Renderers may still go full-bleed
   * (embedded, or a window narrower than the device).
   */
  shell: Effective<ResolvedShell>;
  /** Catalog device for the shell; one that does not fit the shell falls back with source `default`. */
  device: Effective<DeviceId>;
  /** Device orientation; non-rotatable devices always report their own. */
  orientation: Effective<Orientation>;
}

export interface ThemeController {
  themes(): readonly Theme[];
  get(id: string): Theme | undefined;
  appearance(): AppearanceState;
  /** Persisted per active persona. */
  setPreference(patch: {
    themeId?: string;
    mode?: ColorMode;
    reducedMotion?: boolean;
  }): Promise<void>;
  /** Temporary design-preview override (does not touch the persona preference). */
  setOverride(patch: {
    themeId?: string;
    mode?: ColorMode;
    reducedMotion?: boolean;
    density?: number;
    viewport?: ViewportPreset;
    shell?: Shell;
    device?: DeviceId;
    orientation?: Orientation;
  }): Promise<void>;
  clearOverride(): Promise<void>;
  subscribe(listener: (state: AppearanceState) => void): Unsubscribe;
}

export interface SnapshotImportPreview {
  snapshot: SnapshotSummary;
  warnings: string[];
  rowCounts: Record<string, number>;
}

export interface SnapshotController {
  list(): Promise<SnapshotSummary[]>;
  /** C. Captures the actual current world. */
  save(input: { name: string; notes?: string }): Promise<SnapshotSummary>;
  restore(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  /** Serializes a stored snapshot (or the current world when id is omitted). */
  exportJson(id?: string): Promise<{ filename: string; json: string }>;
  /** Validates untrusted text without changing anything. */
  previewImport(text: string): Promise<SnapshotImportPreview>;
  /** Validates, stores and (optionally) restores. Current data is untouched on failure. */
  importJson(text: string, options?: { restore?: boolean }): Promise<SnapshotSummary>;
  build(): Promise<Snapshot>;
}

export interface DataInspector {
  tables(): readonly string[];
  counts(): Promise<Record<string, number>>;
  rows(
    table: string,
    options?: { limit?: number; offset?: number }
  ): Promise<Record<string, unknown>[]>;
}

export interface PrototypeRuntime<TDatabase = unknown> {
  readonly prototypeId: string;
  readonly manifest: PrototypeManifest;
  readonly definition: PrototypeDefinition;
  /** The prototype's own database (a typed Dexie instance by default). */
  readonly db: TDatabase;
  readonly scenarios: ScenarioController;
  readonly session: SessionController;
  /** Invite members, change roles, remove members, transfer ownership. */
  readonly members: MembersController;
  readonly clock: SimulationClock;
  readonly theme: ThemeController;
  readonly environment: SimulationEnvironment;
  readonly snapshots: SnapshotController;
  readonly overrides: OverrideController;
  readonly policy: PermissionPolicy;
  readonly data: DataInspector;
  storage(): StorageStatus;
  /** Effective environment (scenario + overrides). */
  environmentState(): EnvironmentState;
  /**
   * Set when this runtime runs in a disposable sandbox (`?sandbox=<name>`):
   * its databases are `<namespace>~<sandbox>`, isolated from the default world.
   */
  readonly sandbox?: string;
  /** Deletes ONLY this sandbox's two databases (throws outside a sandbox). */
  discardSandbox?(): Promise<void>;
  /** Wipes ONLY this prototype's data + control databases (the sandbox's, in a sandbox). */
  destroy(): Promise<void>;
  close(): void;
}
