import type { IntegrityRules, ScenarioLinkParams, Theme } from '@protoyard/core';

export type MatchMedia = (
  query: string
) => Pick<MediaQueryList, 'matches' | 'addEventListener' | 'removeEventListener'>;

export interface RuntimeOptions {
  /**
   * Every theme the prototype may use. The renderer passes the built-in
   * presets plus `definition.themes`; definition themes missing here are added.
   */
  themes?: readonly Theme[];
  /**
   * Loads a theme that is not in `themes` (a library theme, ADR-023). Called
   * for an override, a persona preference, a scenario appearance, a snapshot
   * or a `?theme=` link that names an unknown id. The result is validated with
   * `ThemeSchema`, must carry the requested id, and is registered once. Return
   * `undefined` (or throw) for ids it cannot provide: the appearance then
   * falls back visibly to the manifest default.
   */
  resolveTheme?: (id: string) => Promise<Theme | undefined>;
  /** Parsed `?scenario=…&actor=…&seed=…` link, applied by `ensureSeeded()`. */
  link?: ScenarioLinkParams;
  /** IndexedDB implementation (tests inject fake-indexeddb). */
  indexedDB?: IDBFactory;
  IDBKeyRange?: typeof IDBKeyRange;
  /** Fall back to in-memory storage when IndexedDB is unavailable (default true). */
  allowMemoryFallback?: boolean;
  /** `window.matchMedia` by default; drives `system` mode and reduced motion. */
  matchMedia?: MatchMedia;
  /** Delay used by `environment.run()` (tests pass an instant sleep). */
  sleep?: (ms: number) => Promise<void>;
  /** Wall clock for metadata (loadedAt, snapshot createdAt). Never used for seeded data. */
  now?: () => number;
  /**
   * Referential-integrity rules checked on every scenario load. Defaults to
   * `definition.integrity` when present.
   */
  integrity?: IntegrityRules;
  /** Rows per bulkAdd when writing a world (default DEFAULT_WRITE_CHUNK). */
  writeChunkSize?: number;
  /** What to do when a generator breaks integrity: `throw` (default), `warn`, `off`. */
  validation?: 'throw' | 'warn' | 'off';
  /** Receives background failures (persisting the clock, listener errors). */
  onError?: (error: unknown) => void;
}
