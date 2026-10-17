import type { Duration, SimulationClock } from './clock.ts';
import type { EnvironmentState, SimulationEnvironment } from './environment.ts';
import type { ColorMode, PrototypeManifest, ViewportPreset } from './manifest.ts';
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

export interface LoadScenarioOptions {
  seed?: number;
  /** Save a safety snapshot of the current world before replacing it. */
  snapshotFirst?: boolean;
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
  reset(options?: Pick<LoadScenarioOptions, 'snapshotFirst'>): Promise<void>;
  /** Commits deterministic timeline events up to now + duration. Idempotent. */
  advance(duration: Duration): Promise<{ applied: number; skipped: number }>;
  subscribe(listener: (info: ActiveScenarioInfo | null) => void): Unsubscribe;
}

export interface SessionController {
  principal(): Principal | null;
  personas(): readonly Persona[];
  organizations(): readonly Organization[];
  memberships(): readonly Membership[];
  /** B. Non-destructive: records stay, visibility/permissions adapt. */
  switchActor(personaId: string): Promise<void>;
  switchOrganization(organizationId: string): Promise<void>;
  can(capability: string, resource?: unknown): boolean;
  /** Throws PermissionDeniedError. Services call this, not only the UI. */
  assert(capability: string, resource?: unknown): void;
  /** Re-reads personas/orgs from the DB (after load/restore). */
  refresh(): Promise<void>;
  subscribe(listener: (principal: Principal | null) => void): Unsubscribe;
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
  viewport: Effective<ViewportPreset>;
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
    viewport?: ViewportPreset;
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
  /** Wipes ONLY this prototype's data + control databases. */
  destroy(): Promise<void>;
  close(): void;
}
