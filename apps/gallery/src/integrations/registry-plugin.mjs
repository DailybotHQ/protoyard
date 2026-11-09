// @ts-check
import {
  createReadStream,
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectBlueprintKind, isBlueprintKind } from '@protoyard/blueprint';
import { CatalogSchema } from '@protoyard/core';
import { ReviewCommentSchema } from '@protoyard/core/review';

const VIRTUAL_ID = 'virtual:protoyard-registry';
const RESOLVED_ID = `\0${VIRTUAL_ID}`;
const THUMBNAIL_DIR = 'thumbnails';
const THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;
const BLUEPRINT_MAX_BYTES = 256 * 1024;
const REVIEW_COMMENTS_MAX_BYTES = 5 * 1024 * 1024;
/**
 * Raster formats only: an SVG opened directly from the gallery origin can run
 * script, so it is never published as a thumbnail.
 * @type {Record<string, string>}
 */
const IMAGE_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
};

/**
 * @typedef {{ kind: string; slug: string; path: string; thumbnail: string | null }} EntryLike
 * @typedef {{ source: string; file: string; url: string }} Thumbnail
 */

const LISTING_CONFIG_FILE = 'protoyard.workspace.json';
const LISTING_KINDS = ['prototype', 'template', 'blueprint'];

/**
 * The workspace listing rule, the same as `readListingConfig` in
 * packages/cli/src/lib/listing.ts (kept here so the gallery build does not
 * depend on the CLI; both are tested on the same cases). An optional
 * `protoyard.workspace.json` with `listing.include.category` limits the
 * gallery and marketplace to those manifest categories, optionally only for
 * the kinds in `listing.appliesTo`. No file or no categories lists everything;
 * an invalid file is reported and lists everything; `PROTOYARD_LISTING=all`
 * ignores the file. The registry file itself is never changed.
 * @param {string} workspaceRoot
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ rule: { categories: string[]; kinds: string[] | null } | null; source: 'none' | 'file' | 'all'; problem?: string }}
 */
export function listingRule(workspaceRoot, env = process.env) {
  if (env.PROTOYARD_LISTING?.trim() === 'all') return { rule: null, source: 'all' };
  const path = join(workspaceRoot, LISTING_CONFIG_FILE);
  if (!existsSync(path)) return { rule: null, source: 'none' };
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    return {
      rule: null,
      source: 'none',
      problem: `${LISTING_CONFIG_FILE} is not valid JSON (${/** @type {Error} */ (error).message}); listing everything.`,
    };
  }
  const invalid = (/** @type {string} */ where) => ({
    rule: null,
    source: /** @type {const} */ ('none'),
    problem: `${LISTING_CONFIG_FILE} has an invalid listing at ${where}; listing everything.`,
  });
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return invalid('the root');
  const listing = raw.listing;
  if (listing === undefined) return { rule: null, source: 'none' };
  if (!listing || typeof listing !== 'object' || Array.isArray(listing)) return invalid('listing');
  if (Object.keys(listing).some((key) => key !== 'include' && key !== 'appliesTo')) {
    return invalid('listing');
  }
  const include = listing.include;
  if (include !== undefined) {
    if (!include || typeof include !== 'object' || Array.isArray(include)) {
      return invalid('listing.include');
    }
    if (Object.keys(include).some((key) => key !== 'category')) return invalid('listing.include');
  }
  const category = include?.category;
  if (
    category !== undefined &&
    (!Array.isArray(category) ||
      category.length > 50 ||
      category.some(
        (value) => typeof value !== 'string' || value.trim() === '' || value.trim().length > 40
      ))
  ) {
    return invalid('listing.include.category');
  }
  const appliesTo = listing.appliesTo;
  if (
    appliesTo !== undefined &&
    (!Array.isArray(appliesTo) ||
      appliesTo.length === 0 ||
      appliesTo.length > LISTING_KINDS.length ||
      appliesTo.some((kind) => !LISTING_KINDS.includes(kind)))
  ) {
    return invalid('listing.appliesTo');
  }
  const categories = [
    ...new Set((category ?? []).map((/** @type {string} */ value) => value.trim())),
  ];
  if (categories.length === 0) return { rule: null, source: 'none' };
  return {
    rule: {
      categories,
      kinds: appliesTo ? LISTING_KINDS.filter((kind) => appliesTo.includes(kind)) : null,
    },
    source: 'file',
  };
}

/**
 * True when a listing with this rule shows the entry.
 * @param {Record<string, unknown>} entry
 * @param {{ categories: string[]; kinds: string[] | null } | null} rule
 */
export function matchesListing(entry, rule) {
  if (!rule) return true;
  if (rule.kinds && !rule.kinds.includes(/** @type {string} */ (entry.kind))) return true;
  return rule.categories.includes(/** @type {string} */ (entry.category));
}

/**
 * @param {string} registryPath
 * @param {Record<string, string | undefined>} [env]
 */
export function readRegistry(registryPath, env = process.env) {
  if (!existsSync(registryPath)) return { registry: null, error: null };
  try {
    const parsed = JSON.parse(readFileSync(registryPath, 'utf8'));
    if (parsed && parsed.format === 'protoyard.registry' && Array.isArray(parsed.entries)) {
      // Slugs become page routes and file names: drop entries that could
      // escape (e.g. slug "../../x") instead of trusting the file.
      const workspaceRoot = dirname(dirname(registryPath));
      const entries = [];
      const issues = [];
      for (const [index, raw] of parsed.entries.entries()) {
        const result = validateRegistryEntry(workspaceRoot, raw);
        if (result.entry) entries.push(result.entry);
        else issues.push({ path: getDiagnosticPath(raw, index), errors: [result.error] });
      }
      const invalid = [...(Array.isArray(parsed.invalid) ? parsed.invalid : []), ...issues];
      // Design systems are a top-level array (ADR-047), validated on their own:
      // a bad one is dropped and reported, never mixed into `invalid`.
      const designSystems = validateDesignSystems(parsed.designSystems);
      const stats = parsed.stats && typeof parsed.stats === 'object' ? parsed.stats : {};
      // The workspace listing hides entries from every page; the file keeps them.
      const listing = listingRule(workspaceRoot, env);
      const listed = entries.filter((entry) => matchesListing(entry, listing.rule));
      return {
        listing: {
          source: listing.source,
          hidden: entries.length - listed.length,
          ...(listing.problem ? { problem: listing.problem } : {}),
        },
        registry: {
          ...parsed,
          entries: attachReviewCounts(workspaceRoot, listed),
          invalid,
          designSystems: designSystems.designSystems,
          designSystemIssues: [...validIssues(parsed.designSystemIssues), ...designSystems.issues],
          stats: {
            ...stats,
            total: listed.length,
            prototypes: listed.filter((entry) => entry.kind === 'prototype').length,
            templates: listed.filter((entry) => entry.kind === 'template').length,
            blueprints: listed.filter((entry) => entry.kind === 'blueprint').length,
            invalid: invalid.length,
            designSystems: designSystems.designSystems.length,
          },
        },
        error: null,
      };
    }
    return { registry: null, error: 'The registry file has an unexpected format.' };
  } catch (e) {
    return {
      registry: null,
      error: `The registry file is not valid JSON (${/** @type {Error} */ (e).message}).`,
    };
  }
}

/**
 * Read only a valid, pulled review export. Missing or malformed files add no
 * summary; counts are derived from thread roots, never guessed from replies.
 * @param {string} workspaceRoot
 * @param {string} slug
 * @returns {{ open: number; resolved: number; pulledAt: string } | null}
 */
export function readReviewCounts(workspaceRoot, slug) {
  if (!SLUG_PATTERN.test(slug)) return null;
  const file = resolve(workspaceRoot, 'artifacts', 'review-comments', 'comments', `${slug}.json`);
  let value;
  try {
    if (lstatSync(file).isSymbolicLink()) return null;
    const stat = statSync(file);
    if (!stat.isFile() || stat.size > REVIEW_COMMENTS_MAX_BYTES) return null;
    value = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
  if (
    value?.format !== 'protoyard-review-comments' ||
    value.version !== 1 ||
    value.slug !== slug ||
    typeof value.namespace !== 'string' ||
    typeof value.pulledAt !== 'string' ||
    !Number.isFinite(Date.parse(value.pulledAt)) ||
    !Array.isArray(value.comments)
  ) {
    return null;
  }
  const ids = new Set();
  const comments = [];
  for (const raw of value.comments) {
    const parsed = ReviewCommentSchema.safeParse(raw);
    if (!parsed.success || parsed.data.slug !== slug || ids.has(parsed.data.id)) return null;
    ids.add(parsed.data.id);
    comments.push(parsed.data);
  }
  const roots = comments.filter((comment) => comment.id === comment.threadId);
  return {
    open: roots.filter((comment) => !comment.resolvedAt).length,
    resolved: roots.filter((comment) => Boolean(comment.resolvedAt)).length,
    pulledAt: value.pulledAt,
  };
}

/** @param {string} workspaceRoot @param {Record<string, unknown>[]} entries */
export function attachReviewCounts(workspaceRoot, entries) {
  return entries.map((entry) => {
    if (entry.kind !== 'prototype' || typeof entry.slug !== 'string') return entry;
    const reviewCounts = readReviewCounts(workspaceRoot, entry.slug);
    return reviewCounts ? { ...entry, reviewCounts } : entry;
  });
}

/** Mirrors core SLUG_PATTERN; a registry file is untrusted input (PROTOYARD_REGISTRY). */
const SLUG_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
/** Kinds the gallery loads (blueprints feed the marketplace). */
const KINDS = new Set(['prototype', 'template', 'blueprint']);
/** Kinds whose folder may publish a thumbnail (a blueprint's path is a JSON file, not a folder). */
const THUMBNAIL_KINDS = new Set(['prototype', 'template']);

/** A design-system id: lowercase kebab-case, at most 64 characters (mirrors the CLI). */
const DESIGN_SYSTEM_ID = /^[a-z][a-z0-9-]{0,63}$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const SHA256 = /^[0-9a-f]{64}$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const MAX_DESIGN_SYSTEMS = 500;
const MAX_BOUND = 2000;

/** Short display text: a string of 1–max characters without control characters. */
function isText(/** @type {unknown} */ value, max = 120) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= max &&
    // biome-ignore lint/suspicious/noControlCharactersInRegex: the pattern exists to refuse them.
    !/[\u0000-\u001f\u007f\u2028\u2029]/.test(value)
  );
}

/**
 * The manifest binding of a registry entry, or null when it is missing or
 * malformed.
 * @param {unknown} raw
 * @returns {{ id: string; version: string; locked: boolean } | null}
 */
export function validBinding(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = /** @type {Record<string, unknown>} */ (raw);
  if (typeof value.id !== 'string' || !DESIGN_SYSTEM_ID.test(value.id)) return null;
  if (typeof value.version !== 'string' || !SEMVER.test(value.version)) return null;
  return { id: value.id, version: value.version, locked: value.locked === true };
}

/** @param {unknown} raw @returns {{ path: string; errors: string[] }[]} */
function validIssues(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (issue) =>
        issue &&
        typeof issue === 'object' &&
        isText(issue.path, 512) &&
        Array.isArray(issue.errors) &&
        issue.errors.every((/** @type {unknown} */ error) => typeof error === 'string')
    )
    .slice(0, MAX_DESIGN_SYSTEMS)
    .map((issue) => ({ path: issue.path, errors: issue.errors.slice(0, 10) }));
}

/**
 * One design system from the registry, checked as untrusted input. Returns
 * a clean copy (only known fields) or an error.
 * @param {unknown} raw
 */
function validateDesignSystem(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { designSystem: null, error: 'Design system must be an object.' };
  }
  const ds = /** @type {Record<string, unknown>} */ (raw);
  if (typeof ds.id !== 'string' || !DESIGN_SYSTEM_ID.test(ds.id)) {
    return { designSystem: null, error: 'Design system has an unsafe or invalid id.' };
  }
  const layout = ds.layout;
  const path = layout === 'folder' ? `design-systems/${ds.id}` : `design-systems/${ds.id}.json`;
  if ((layout !== 'folder' && layout !== 'flat') || ds.path !== path) {
    return { designSystem: null, error: 'Design system has an unexpected layout or path.' };
  }
  const nullableText = (/** @type {unknown} */ value) => value === null || isText(value);
  if (
    !isText(ds.name) ||
    typeof ds.version !== 'string' ||
    !SEMVER.test(ds.version) ||
    (ds.status !== 'draft' && ds.status !== 'approved') ||
    !nullableText(ds.approvedBy) ||
    !(
      ds.approvedAt === null ||
      (typeof ds.approvedAt === 'string' && ISO_DATETIME.test(ds.approvedAt))
    ) ||
    !(
      ds.approvedVersion === null ||
      (typeof ds.approvedVersion === 'string' && SEMVER.test(ds.approvedVersion))
    ) ||
    typeof ds.contentHash !== 'string' ||
    !SHA256.test(ds.contentHash) ||
    typeof ds.lockable !== 'boolean' ||
    !Number.isInteger(ds.componentCount) ||
    /** @type {number} */ (ds.componentCount) < 0 ||
    /** @type {number} */ (ds.componentCount) > 500 ||
    !Array.isArray(ds.boundPrototypes) ||
    ds.boundPrototypes.length > MAX_BOUND
  ) {
    return { designSystem: null, error: 'Design system has invalid metadata.' };
  }
  const bound = [];
  for (const item of ds.boundPrototypes) {
    if (
      !item ||
      typeof item !== 'object' ||
      typeof item.slug !== 'string' ||
      !SLUG_PATTERN.test(item.slug) ||
      !isText(item.name) ||
      typeof item.version !== 'string' ||
      !SEMVER.test(item.version) ||
      typeof item.locked !== 'boolean'
    ) {
      return { designSystem: null, error: 'Design system lists an invalid bound prototype.' };
    }
    bound.push({ slug: item.slug, name: item.name, version: item.version, locked: item.locked });
  }
  return {
    designSystem: {
      id: ds.id,
      name: ds.name,
      version: ds.version,
      status: ds.status,
      approvedBy: ds.approvedBy,
      approvedAt: ds.approvedAt,
      approvedVersion: ds.approvedVersion,
      contentHash: ds.contentHash,
      lockable: ds.lockable,
      layout,
      path,
      componentCount: ds.componentCount,
      boundPrototypes: bound,
    },
    error: null,
  };
}

/**
 * The registry's `designSystems` array, validated. A registry from an older
 * CLI has none: an empty list, no issue.
 * @param {unknown} raw
 */
export function validateDesignSystems(raw) {
  /** @type {Record<string, unknown>[]} */
  const designSystems = [];
  /** @type {{ path: string; errors: string[] }[]} */
  const issues = [];
  if (raw === undefined) return { designSystems, issues };
  if (!Array.isArray(raw)) {
    return {
      designSystems,
      issues: [
        { path: 'designSystems', errors: ['The registry designSystems field is not a list.'] },
      ],
    };
  }
  const seen = new Set();
  for (const [index, item] of raw.slice(0, MAX_DESIGN_SYSTEMS).entries()) {
    const result = validateDesignSystem(item);
    if (result.designSystem && seen.has(result.designSystem.id)) {
      issues.push({ path: `designSystems[${index}]`, errors: ['Duplicate design-system id.'] });
    } else if (result.designSystem) {
      seen.add(result.designSystem.id);
      designSystems.push(result.designSystem);
    } else {
      issues.push({ path: `designSystems[${index}]`, errors: [result.error ?? 'Invalid.'] });
    }
  }
  return { designSystems, issues };
}

/** @param {unknown} raw @param {number} index */
function getDiagnosticPath(raw, index) {
  const entry =
    raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : null;
  return entry && typeof entry.path === 'string' ? entry.path : `entries[${index}]`;
}

/** @param {string} workspaceRoot @param {unknown} raw */
function validateRegistryEntry(workspaceRoot, raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { entry: null, error: 'Registry entry must be an object.' };
  }
  const entry = /** @type {Record<string, unknown>} */ (raw);
  if (typeof entry.slug !== 'string' || !SLUG_PATTERN.test(entry.slug)) {
    return { entry: null, error: 'Registry entry has an unsafe or invalid slug.' };
  }
  if (typeof entry.kind !== 'string' || !KINDS.has(entry.kind)) {
    return { entry: null, error: 'Registry entry has an unsupported source kind.' };
  }
  if (
    typeof entry.path !== 'string' ||
    isAbsolute(entry.path) ||
    entry.path.split(/[\\/]/).includes('..')
  ) {
    return { entry: null, error: 'Registry entry has an unsafe source path.' };
  }

  if (entry.kind === 'blueprint') {
    const result = readCatalogBlueprint(workspaceRoot, entry);
    if (!result.ok) return { entry: null, error: result.error };
    return { entry: { ...entry, blueprintKind: result.kind, designSystem: null }, error: null };
  }

  if (
    entry.blueprintKind !== undefined &&
    entry.blueprintKind !== null &&
    !isBlueprintKind(entry.blueprintKind)
  ) {
    return { entry: null, error: 'Registry entry has an unsupported blueprintKind.' };
  }
  // A malformed design-system binding is dropped, not trusted (the entry stays).
  const checked = /** @type {Record<string, unknown>} */ ({
    ...entry,
    designSystem: validBinding(entry.designSystem),
  });
  return { entry: checked, error: null };
}

/**
 * A consumer workspace indexes the catalog shipped in the installed
 * `@protoyard/templates` package (hoisted or under pnpm's `.pnpm` store), so
 * its blueprints are read from there too (Corag consumer gap, 1.5.0). The
 * same no-symlink, inside-the-workspace and size checks apply.
 */
const INSTALLED_CATALOG =
  /^node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?@protoyard\/templates\/blueprints\/(?:[a-z]+\/)?[^/]+\.json$/;

/** @param {string} workspaceRoot @param {Record<string, unknown>} entry */
function readCatalogBlueprint(workspaceRoot, entry) {
  const sourcePath = /** @type {string} */ (entry.path);
  if (
    !(sourcePath.startsWith('blueprints/') || INSTALLED_CATALOG.test(sourcePath)) ||
    !sourcePath.endsWith('.json') ||
    sourcePath.includes('\\')
  ) {
    return {
      ok: false,
      error:
        'Blueprint source path must be a workspace-relative blueprints/*.json path or the installed @protoyard/templates catalog.',
    };
  }
  const filename = sourcePath.split('/').at(-1);
  if (filename !== `${entry.slug}.json`) {
    return { ok: false, error: 'Blueprint source file name does not match its registry slug.' };
  }
  const root = resolve(workspaceRoot);
  const source = resolve(root, sourcePath);
  if (!contains(root, source) || source === root) {
    return { ok: false, error: 'Blueprint source path escapes the workspace.' };
  }

  let raw;
  try {
    const realRoot = realpathSync.native(root);
    const parts = relative(root, source).split(sep);
    let current = root;
    for (const part of parts) {
      current = join(current, part);
      if (lstatSync(current).isSymbolicLink()) {
        return { ok: false, error: 'Blueprint source path contains a symlink.' };
      }
    }
    const realSource = realpathSync.native(source);
    if (!contains(realRoot, realSource)) {
      return { ok: false, error: 'Blueprint source path resolves outside the workspace.' };
    }
    const stat = statSync(realSource);
    if (!stat.isFile()) return { ok: false, error: 'Blueprint source is not a regular file.' };
    if (stat.size > BLUEPRINT_MAX_BYTES) {
      return {
        ok: false,
        error: `Blueprint source exceeds the ${BLUEPRINT_MAX_BYTES}-byte limit.`,
      };
    }
    raw = JSON.parse(readFileSync(realSource, 'utf8'));
  } catch (error) {
    return {
      ok: false,
      error: `Blueprint source could not be read safely (${/** @type {Error} */ (error).message}).`,
    };
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Blueprint source must contain a JSON object.' };
  }
  const kind = detectBlueprintKind(raw);
  if (!kind.ok) return { ok: false, error: kind.message };
  if (entry.blueprintKind !== undefined && entry.blueprintKind !== kind.kind) {
    return { ok: false, error: 'Registry blueprintKind does not match the blueprint source.' };
  }
  const catalog = CatalogSchema.safeParse(raw.catalog);
  if (!catalog.success) {
    return { ok: false, error: 'Blueprint catalog metadata is missing or invalid.' };
  }
  if (!entry.catalog || typeof entry.catalog !== 'object' || Array.isArray(entry.catalog)) {
    return { ok: false, error: 'Registry blueprint is missing catalog metadata.' };
  }
  const registryCatalog = /** @type {Record<string, unknown>} */ (entry.catalog);
  const registryCatalogResult = CatalogSchema.safeParse({
    category: registryCatalog.category,
    ...(typeof registryCatalog.productType === 'string'
      ? { productType: registryCatalog.productType }
      : {}),
    platforms: registryCatalog.platforms,
    ...(typeof registryCatalog.shell === 'string' ? { shell: registryCatalog.shell } : {}),
    features: registryCatalog.features,
    highlights: registryCatalog.highlights,
    ...(typeof registryCatalog.difficulty === 'string'
      ? { difficulty: registryCatalog.difficulty }
      : {}),
  });
  if (!registryCatalogResult.success) {
    return { ok: false, error: 'Registry catalog metadata is invalid.' };
  }
  return { ok: true, kind: kind.kind };
}

/**
 * @param {string} parent
 * @param {string} child
 */
function contains(parent, child) {
  const rel = relative(parent, child);
  return rel === '' || (!isAbsolute(rel) && rel.split(sep)[0] !== '..');
}

/**
 * Resolves manifest thumbnails to files the gallery may publish. Rules:
 *  - the entry's slug matches SLUG_PATTERN and its kind is prototype/template
 *    (the copied file name derives from them);
 *  - neither the folder nor the thumbnail is a symlink, and the REAL
 *    thumbnail path stays inside the REAL folder, itself inside the workspace;
 *  - it is an image type and at most 2 MB.
 * Anything else falls back to the icon: a committed symlink such as
 * public/thumbnail.png → ~/.ssh/id_ed25519 is never copied into the site.
 *
 * @param {string} workspaceRoot
 * @param {EntryLike[]} entries
 * @returns {Map<string, Thumbnail>} keyed by `${kind}:${slug}`
 */
export function resolveThumbnails(workspaceRoot, entries) {
  /** @type {Map<string, Thumbnail>} */
  const out = new Map();
  let realRoot;
  try {
    realRoot = realpathSync.native(workspaceRoot);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (typeof entry.thumbnail !== 'string' || entry.thumbnail === '') continue;
    if (typeof entry.slug !== 'string' || !SLUG_PATTERN.test(entry.slug)) continue;
    if (!THUMBNAIL_KINDS.has(entry.kind) || typeof entry.path !== 'string') continue;
    const folder = resolve(workspaceRoot, entry.path);
    const source = resolve(folder, entry.thumbnail);
    if (!contains(folder, source)) continue;
    const ext = extname(source).toLowerCase();
    if (!IMAGE_TYPES[ext]) continue;
    let real = '';
    let size = 0;
    let mtime = 0;
    try {
      if (lstatSync(folder).isSymbolicLink() || lstatSync(source).isSymbolicLink()) continue;
      const realFolder = realpathSync.native(folder);
      real = realpathSync.native(source);
      if (realFolder === realRoot || !contains(realRoot, realFolder) || !contains(realFolder, real))
        continue;
      const s = statSync(real);
      if (!s.isFile()) continue;
      size = s.size;
      mtime = Math.round(s.mtimeMs);
    } catch {
      continue;
    }
    if (size > THUMBNAIL_MAX_BYTES) continue;
    const file = `${entry.kind}-${entry.slug}${ext}`;
    // The mtime query busts browser caches when a thumbnail is regenerated.
    out.set(`${entry.kind}:${entry.slug}`, {
      source: real,
      file,
      url: `${THUMBNAIL_DIR}/${file}?v=${mtime.toString(36)}`,
    });
  }
  return out;
}

/**
 * Vite plugin + Astro integration for the generated registry:
 *  - `virtual:protoyard-registry` exports { registry, registryError, thumbnails }.
 *    A missing/malformed file yields `registry: null` (first-run state).
 *  - Thumbnails are served in dev from their prototype folders and copied
 *    into `<dist>/thumbnails/` after a build. No prototype code is imported.
 *
 * The workspace root is the folder that holds `.protoyard/`, so a synthetic
 * registry (PROTOYARD_REGISTRY, used by benchmarks and showcase builds)
 * resolves entry paths against its own workspace.
 *
 * @param {{ registryPath: string }} options
 * @returns {import('astro').AstroIntegration}
 */
export function protoyardRegistry(options) {
  const { registryPath } = options;
  const workspaceRoot = dirname(dirname(registryPath));
  const thumbnails = () => {
    const { registry } = readRegistry(registryPath);
    return resolveThumbnails(workspaceRoot, registry?.entries ?? []);
  };

  /** @type {import('vite').Plugin} */
  const vitePlugin = {
    name: 'protoyard-registry',
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : undefined;
    },
    load(id) {
      if (id !== RESOLVED_ID) return undefined;
      this.addWatchFile(registryPath);
      const { registry, error } = readRegistry(registryPath);
      for (const entry of registry?.entries ?? []) {
        if (entry.kind === 'prototype' && SLUG_PATTERN.test(entry.slug)) {
          const reviewFile = resolve(
            workspaceRoot,
            'artifacts',
            'review',
            'comments',
            `${entry.slug}.json`
          );
          if (existsSync(reviewFile)) this.addWatchFile(reviewFile);
        }
      }
      const urls = Object.fromEntries(
        [...resolveThumbnails(workspaceRoot, registry?.entries ?? [])].map(([key, t]) => [
          key,
          t.url,
        ])
      );
      return [
        `export const registry = ${JSON.stringify(registry)};`,
        `export const registryError = ${JSON.stringify(error)};`,
        `export const thumbnails = ${JSON.stringify(urls)};`,
        '',
      ].join('\n');
    },
    configureServer(server) {
      server.watcher.add(registryPath);
      server.watcher.on('change', (file) => {
        if (file !== registryPath) return;
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      });
      server.middlewares.use((req, res, next) => {
        const match = /\/thumbnails\/([a-z0-9-]+\.[a-z]+)(?:\?|$)/.exec(req.url ?? '');
        if (!match) return next();
        const thumbnail = [...thumbnails().values()].find((t) => t.file === match[1]);
        if (!thumbnail) return next();
        res.setHeader(
          'Content-Type',
          IMAGE_TYPES[extname(thumbnail.file)] ?? 'application/octet-stream'
        );
        res.setHeader('Cache-Control', 'no-cache');
        createReadStream(thumbnail.source).pipe(res);
      });
    },
  };

  return {
    name: 'protoyard-registry',
    hooks: {
      'astro:config:setup': ({ updateConfig }) => {
        updateConfig({ vite: { plugins: [vitePlugin] } });
      },
      'astro:build:done': async ({ dir, logger }) => {
        const { registry, listing } = readRegistry(registryPath);
        if (listing?.problem) logger.warn(listing.problem);
        if (listing?.hidden) {
          logger.info(
            `${listing.hidden} registry entr${listing.hidden === 1 ? 'y' : 'ies'} hidden by ${LISTING_CONFIG_FILE} (PROTOYARD_LISTING=all lists every entry)`
          );
        }
        for (const issue of registry?.invalid ?? []) {
          logger.warn(`Omitted registry record ${issue.path}: ${issue.errors.join(' ')}`);
        }
        const list = [...resolveThumbnails(workspaceRoot, registry?.entries ?? []).values()];
        if (list.length === 0) return;
        const target = join(fileURLToPath(dir), THUMBNAIL_DIR);
        await mkdir(target, { recursive: true });
        await Promise.all(list.map((t) => copyFile(t.source, join(target, t.file))));
        logger.info(`copied ${list.length} thumbnail(s)`);
      },
    },
  };
}
