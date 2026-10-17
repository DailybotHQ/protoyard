// @ts-check
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const VIRTUAL_ID = 'virtual:protoyard-registry';
const RESOLVED_ID = `\0${VIRTUAL_ID}`;
const THUMBNAIL_DIR = 'thumbnails';
const THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;
/** @type {Record<string, string>} */
const IMAGE_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

/**
 * @typedef {{ kind: string; slug: string; path: string; thumbnail: string | null }} EntryLike
 * @typedef {{ source: string; file: string; url: string }} Thumbnail
 */

/** @param {string} registryPath */
function readRegistry(registryPath) {
  if (!existsSync(registryPath)) return { registry: null, error: null };
  try {
    const parsed = JSON.parse(readFileSync(registryPath, 'utf8'));
    if (parsed && parsed.format === 'protoyard.registry' && Array.isArray(parsed.entries)) {
      return { registry: parsed, error: null };
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
 * Resolves manifest thumbnails to files the gallery may publish. A thumbnail
 * must stay inside its own prototype folder, be an image type and be at most
 * 2 MB; anything else is ignored (the card falls back to the icon).
 *
 * @param {string} workspaceRoot
 * @param {EntryLike[]} entries
 * @returns {Map<string, Thumbnail>} keyed by `${kind}:${slug}`
 */
export function resolveThumbnails(workspaceRoot, entries) {
  /** @type {Map<string, Thumbnail>} */
  const out = new Map();
  for (const entry of entries) {
    if (!entry.thumbnail) continue;
    const folder = resolve(workspaceRoot, entry.path);
    const source = resolve(folder, entry.thumbnail);
    const rel = relative(folder, source);
    if (rel.startsWith('..') || rel.split(sep)[0] === '..' || resolve(folder, rel) !== source)
      continue;
    const ext = extname(source).toLowerCase();
    if (!IMAGE_TYPES[ext]) continue;
    let size = 0;
    let mtime = 0;
    try {
      const s = statSync(source);
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
      source,
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
