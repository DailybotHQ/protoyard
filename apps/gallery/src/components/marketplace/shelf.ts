import { entries, thumbnailUrl } from '@/lib/registry';
import type { RegistryEntry } from '@/lib/types';
import { type MarketEntry, type MarketSource, toMarketEntry } from './model';

/** A shelved item with its full registry entry (detail pages need every field). */
export interface ShelfItem {
  entry: MarketEntry;
  source: RegistryEntry;
}

/**
 * Every registry entry with a catalog block: prototypes, templates and
 * blueprints (`protoyard index` v3 indexes `blueprints/*.json`). Read at
 * build time only.
 */
export function shelf(): ShelfItem[] {
  const items: ShelfItem[] = [];
  for (const source of entries()) {
    const entry = toMarketEntry(source as unknown as MarketSource, thumbnailUrl(source));
    if (entry) items.push({ entry, source });
  }
  return items;
}

/**
 * The files of a prototype's spec kit (docs/SPECS.md). Mirrors SPEC_FILES in
 * packages/cli/src/lib/spec-render.ts; the gallery reads no prototype files.
 */
export const SPEC_KIT = [
  'AGENTS.md',
  'docs/SPEC.md',
  'docs/DATA_MODEL.md',
  'docs/FLOWS.md',
  'docs/SCREENS.md',
  'docs/PERMISSIONS.md',
] as const;
