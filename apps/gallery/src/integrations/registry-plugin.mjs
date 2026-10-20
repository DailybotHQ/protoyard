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
import { ReviewCommentSchema } from '@protoyard/core/review';

const VIRTUAL_ID = 'virtual:protoyard-registry';
const RESOLVED_ID = `\0${VIRTUAL_ID}`;
const THUMBNAIL_DIR = 'thumbnails';
const THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;
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

/** @param {string} registryPath */
export function readRegistry(registryPath) {
  if (!existsSync(registryPath)) return { registry: null, error: null };
  try {
    const parsed = JSON.parse(readFileSync(registryPath, 'utf8'));
    if (parsed && parsed.format === 'protoyard.registry' && Array.isArray(parsed.entries)) {
      // Slugs become page routes and file names: drop entries that could
      // escape (e.g. slug "../../x") instead of trusting the file.
      const workspaceRoot = dirname(dirname(registryPath));
      const entries = parsed.entries.filter(
        (/** @type {Record<string, unknown>} */ e) =>
          e &&
          typeof e.slug === 'string' &&
          SLUG_PATTERN.test(e.slug) &&
          KINDS.has(/** @type {string} */ (e.kind)) &&
          typeof e.path === 'string' &&
          !isAbsolute(e.path) &&
          !e.path.split(/[\\/]/).includes('..')
      );
      return {
        registry: { ...parsed, entries: attachReviewCounts(workspaceRoot, entries) },
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
        const list = [...thumbnails().values()];
        if (list.length === 0) return;
        const target = join(fileURLToPath(dir), THUMBNAIL_DIR);
        await mkdir(target, { recursive: true });
        await Promise.all(list.map((t) => copyFile(t.source, join(target, t.file))));
        logger.info(`copied ${list.length} thumbnail(s)`);
      },
    },
  };
}
