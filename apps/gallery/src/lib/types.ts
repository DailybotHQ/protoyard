/**
 * Mirror of the registry format written by `protoyard index`
 * (packages/cli/src/lib/registry.ts). The gallery depends only on this data
 * shape, never on CLI or prototype code.
 */

export type ProjectKind = 'prototype' | 'template';
export type Platform = 'desktop' | 'mobile' | 'responsive';

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
}

export interface Registry {
  format: 'protoyard.registry';
  version: 1;
  generatedAt: string;
  entries: RegistryEntry[];
  invalid: { path: string; errors: string[] }[];
  stats: { total: number; prototypes: number; templates: number; invalid: number };
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
}
