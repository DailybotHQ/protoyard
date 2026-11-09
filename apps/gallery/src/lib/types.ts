/**
 * Gallery registry shape: the format written by `protoyard index`
 * (packages/cli/src/lib/registry.ts), with optional build-time review counts.
 * The gallery depends only on metadata, never on prototype code.
 */

export type ProjectKind = 'prototype' | 'template';
export type Platform = 'desktop' | 'mobile' | 'responsive';

export interface ReviewCounts {
  open: number;
  resolved: number;
  pulledAt: string;
}

export interface RegistryEntry {
  kind: ProjectKind;
  id: string;
  slug: string;
  name: string;
  description: string;
  version: string;
  category: string;
  tags: string[];
  platform: Platform;
  status: 'draft' | 'active' | 'ready' | 'archived';
  template: string | null;
  icon: string | null;
  thumbnail: string | null;
  scenarios: string[];
  scenarioCount: number;
  defaultScenario: string | null;
  defaultTheme: string;
  defaultMode: 'light' | 'dark' | 'system';
  viewport: 'desktop' | 'tablet' | 'iphone' | 'android' | 'custom';
  namespace: string;
  schemaVersion: number;
  path: string;
  modifiedAt: string;
  createdAt: string | null;
  updatedAt: string | null;
  /**
   * Marketplace catalog block when present. `shell` is resolved (`auto` → phone
   * or none from platform) for gallery framing defaults.
   */
  catalog?: {
    shell?: string;
    category?: string;
    productType?: string | null;
    platforms?: string[];
    features?: string[];
    highlights?: string[];
    difficulty?: string | null;
  } | null;
  /**
   * Set by `protoyard showcase`: the prototype's static build ships inside
   * this site, so previews work without a local control server.
   */
  embedded?: { url: string; scenarioLinks: boolean } | null;
  /** Build-time counts from a validated pulled comments file, when available. */
  reviewCounts?: ReviewCounts;
  /** The manifest's design-system binding (null or absent when it has none). */
  designSystem?: DesignSystemBinding | null;
}

export interface DesignSystemBinding {
  id: string;
  version: string;
  locked: boolean;
}

/** A prototype bound to a design system, as the registry lists it. */
export interface BoundPrototype {
  slug: string;
  name: string;
  /** The version the prototype pins. */
  version: string;
  locked: boolean;
}

/** A design system from the registry's top-level `designSystems` array (ADR-047). */
export interface DesignSystemEntry {
  id: string;
  name: string;
  version: string;
  status: 'draft' | 'approved';
  approvedBy: string | null;
  approvedAt: string | null;
  approvedVersion: string | null;
  contentHash: string;
  /** Approved at this version and unchanged since: `ds use --lock` accepts it. */
  lockable: boolean;
  layout: 'folder' | 'flat';
  path: string;
  componentCount: number;
  boundPrototypes: BoundPrototype[];
}

export interface Registry {
  format: 'protoyard.registry';
  version: 1;
  generatedAt: string;
  entries: RegistryEntry[];
  invalid: { path: string; errors: string[] }[];
  /** Absent in a registry written before design systems were indexed. */
  designSystems?: DesignSystemEntry[];
  designSystemIssues?: { path: string; errors: string[] }[];
  stats: {
    total: number;
    prototypes: number;
    templates: number;
    invalid: number;
    designSystems?: number;
  };
}

/** What the browse island needs per card — kept small for 1,000+ entries. */
export interface CompactEntry {
  k: ProjectKind;
  s: string;
  n: string;
  d: string;
  c: string;
  t: string[];
  p: Platform;
  st: RegistryEntry['status'];
  tp: string | null;
  i: string | null;
  sc: number;
  m: string;
  /** Thumbnail URL (base-relative), when the manifest declares one. */
  th: string | null;
  /** Base-relative URL of a bundled build (showcase sites), else null. */
  e: string | null;
  /** Open/resolved review thread counts; absent when no pulled file exists. */
  rv?: ReviewCounts;
  /** The id of the design system it is bound to; absent when none. */
  ds?: string;
}
