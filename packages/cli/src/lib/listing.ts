import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { Registry, RegistryEntry } from './registry.ts';

/*
 * Workspace listing: an optional `protoyard.workspace.json` at the root can
 * limit what listings show (the gallery, the marketplace, `protoyard list`,
 * the showcase and the review index) to some catalog categories, for example
 * a team copy that shows only its own product's prototypes. The registry on
 * disk keeps every entry; builds, validation and `--slug` commands are never
 * filtered. With no file, or no `listing.include.category`, everything is
 * listed, as before. `PROTOYARD_LISTING=all` (and `list --all`) ignore the
 * file for maintenance.
 *
 * The gallery has a plain-JS copy of this rule in
 * apps/gallery/src/integrations/registry-plugin.mjs (`listingRule`), so the
 * gallery build does not depend on the CLI; tests hold both to the same cases.
 */

export const LISTING_CONFIG_FILE = 'protoyard.workspace.json';
/** Set to `all` to list every entry even when the workspace file filters. */
export const LISTING_ENV = 'PROTOYARD_LISTING';

export const LISTING_KINDS = ['prototype', 'template', 'blueprint'] as const;
type ListingKind = (typeof LISTING_KINDS)[number];

/** Which entries a listing shows; `kinds` null means the rule applies to every kind. */
export interface ListingRule {
  categories: string[];
  kinds: ListingKind[] | null;
}

export interface ListingConfigResult {
  rule: ListingRule | null;
  /** `none`: no file or no rule; `file`: the rule applies; `all`: overridden. */
  source: 'none' | 'file' | 'all';
  /** Set when the file exists but cannot be used (it is then ignored). */
  problem?: string;
}

/** A manifest category, matched exactly (`protoyard.json` allows 1-40 characters). */
const CategorySchema = z.string().trim().min(1).max(40);

/** Only `listing` is read; other keys in the workspace file are left to their owners. */
const WorkspaceListingSchema = z.object({
  listing: z
    .strictObject({
      include: z.strictObject({ category: z.array(CategorySchema).max(50).optional() }).optional(),
      appliesTo: z.array(z.enum(LISTING_KINDS)).min(1).max(LISTING_KINDS.length).optional(),
    })
    .optional(),
});

/**
 * Reads the workspace listing rule. A missing file or a file without
 * categories lists everything; an unreadable or invalid file is reported in
 * `problem` and also lists everything, so a typo never hides the catalog.
 */
export function readListingConfig(
  root: string,
  env: Readonly<Record<string, string | undefined>> = process.env
): ListingConfigResult {
  if (env[LISTING_ENV]?.trim() === 'all') return { rule: null, source: 'all' };
  const path = join(root, LISTING_CONFIG_FILE);
  if (!existsSync(path)) return { rule: null, source: 'none' };
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    return {
      rule: null,
      source: 'none',
      problem: `${LISTING_CONFIG_FILE} is not valid JSON (${(error as Error).message}); listing everything.`,
    };
  }
  const parsed = WorkspaceListingSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? ` at ${issue.path.join('.')}` : '';
    return {
      rule: null,
      source: 'none',
      problem: `${LISTING_CONFIG_FILE} has an invalid listing${where}: ${issue?.message ?? 'unknown problem'}; listing everything.`,
    };
  }
  const categories = [...new Set(parsed.data.listing?.include?.category ?? [])];
  if (categories.length === 0) return { rule: null, source: 'none' };
  const appliesTo = parsed.data.listing?.appliesTo;
  return {
    rule: {
      categories,
      kinds: appliesTo ? LISTING_KINDS.filter((k) => appliesTo.includes(k)) : null,
    },
    source: 'file',
  };
}

/** True when a listing with this rule shows the entry. */
export function matchesListing(
  entry: Pick<RegistryEntry, 'category' | 'kind'>,
  rule: ListingRule | null
): boolean {
  if (!rule) return true;
  if (rule.kinds && !(rule.kinds as readonly string[]).includes(entry.kind)) return true;
  return rule.categories.includes(entry.category);
}

/**
 * The registry a listing shows: entries the rule hides are dropped and the
 * stats recounted. The input is not changed, and `invalid` is kept as is.
 */
export function applyListing(
  registry: Registry,
  rule: ListingRule | null
): { registry: Registry; hidden: number } {
  if (!rule) return { registry, hidden: 0 };
  const entries = registry.entries.filter((entry) => matchesListing(entry, rule));
  return {
    registry: {
      ...registry,
      entries,
      stats: {
        ...registry.stats,
        total: entries.length,
        prototypes: entries.filter((e) => e.kind === 'prototype').length,
        templates: entries.filter((e) => e.kind === 'template').length,
        blueprints: entries.filter((e) => e.kind === 'blueprint').length,
      },
    },
    hidden: registry.entries.length - entries.length,
  };
}

/** A one-line note for listings that hid entries, or null. */
export function listingNote(hidden: number, config: ListingConfigResult): string | null {
  if (!config.rule || hidden === 0) return null;
  const categories = config.rule.categories.join(', ');
  return `${hidden} hidden by ${LISTING_CONFIG_FILE} (categories: ${categories}); ${LISTING_ENV}=all or list --all shows every entry.`;
}
