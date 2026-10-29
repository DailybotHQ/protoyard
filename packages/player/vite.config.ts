import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { defineProtoyardConfig } from '@protoyard/renderer-svelte/vite';
import type { Plugin } from 'vite';
import { DEFAULT_ALLOWLIST, frameAncestorSources } from './src/embed/origins.ts';

/**
 * The player builds like a prototype (Tailwind, avatars, DevTools, base `./`,
 * offline service worker) from its own protoyard.json, which only carries
 * build settings: every blueprint gets its manifest and storage namespace at
 * runtime (ADR-029). The `build.offline` flag is consumed by this shared
 * config factory, so the worker is build-only and never runs in `vite dev`.
 *
 * The build adds a strict Content-Security-Policy (see docs/SECURITY.md):
 * scripts only from the player's origin plus the sha256 of each inline
 * script (the no-flash appearance scripts), no `unsafe-eval`, and network,
 * workers and frames limited to the same origin. A meta tag carries it at
 * the top of <head>, right after <meta charset>, so it governs every script; `_headers` repeats
 * it as an HTTP header with `frame-ancestors`, which a meta tag cannot set.
 *
 * The app builds into `dist/app/` (never `dist/`): `pnpm build:packages`
 * emits the embed client into `dist/embed/` and keeps `dist/app/`, and Vite
 * only empties its own folder. After the build, `protoyard-player-assets.json`
 * lists every file of the app with its size and sha256, the contract that
 * `protoyard quick` verifies before it copies the player (ADR-031).
 */

/** Where `vite build` writes the app, relative to this package. */
export const PLAYER_APP_DIR = 'dist/app';
/**
 * The player's HTML pages: `index.html` runs any blueprint; `deck.html`,
 * `page.html` and `doc.html` run one content kind each (src/entries/), with
 * only that kind's boot and styles, sharing chunks and the one asset manifest.
 */
export const PLAYER_HTML_ENTRIES = ['index', 'deck', 'page', 'doc'] as const;

/** Must match PLAYER_ASSETS_MANIFEST in packages/cli/src/lib/quick/player-assets.ts. */
export const PLAYER_ASSETS_MANIFEST = 'protoyard-player-assets.json';

/**
 * Origins that may frame the player (embedding pages, ADR-030); never `*`.
 * Built from the embed allowlist, so framing and `postMessage` agree.
 */
export const PLAYER_FRAME_ANCESTORS = ["'self'", ...frameAncestorSources(DEFAULT_ALLOWLIST)];

/**
 * Opens `<head>` with `<meta charset>` and then the CSP meta. Browsers look
 * for the charset in the first 1024 bytes, and the no-flash scripts that
 * other plugins prepend to `<head>` can be larger than that, so the charset
 * tag moves up from wherever it was. The CSP then precedes every script.
 */
export function insertCspMeta(html: string, meta: string): string {
  const charset = /[ \t]*<meta\s+charset\s*=\s*["']?[\w-]+["']?\s*\/?>[ \t]*\r?\n?/i;
  const tag = charset.exec(html)?.[0].trim();
  const rest = tag ? html.replace(charset, '') : html;
  const lead = tag ? `${tag}\n    ${meta}` : meta;
  return rest.replace(/<head(\s[^>]*)?>/i, (head) => `${head}\n    ${lead}`);
}

export function playerCsp(scriptHashes: readonly string[]): string {
  return [
    "default-src 'self'",
    `script-src 'self' ${scriptHashes.map((hash) => `'sha256-${hash}'`).join(' ')}`.trim(),
    // Svelte and the theme engine set style attributes and elements at runtime.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

/** Executable inline scripts (no `src`, no data type) in document order. */
export function inlineScripts(html: string): string[] {
  return [...html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .filter(
      ([, attrs = '']) =>
        !/\ssrc\s*=/i.test(attrs) && !/\stype\s*=\s*["']?application\/(?:ld\+)?json/i.test(attrs)
    )
    .map(([, , body = '']) => body);
}

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('base64');

function cspPlugin(): Plugin {
  let outDir = PLAYER_APP_DIR;
  return {
    name: 'protoyard-player-csp',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        // Each page gets the hashes of its own inline scripts.
        const own = inlineScripts(html).map(sha256);
        const meta = `<meta http-equiv="Content-Security-Policy" content="${playerCsp(own)}">`;
        return insertCspMeta(html, meta);
      },
    },
    closeBundle() {
      // One header serves every page, so it allows the inline scripts of all of
      // them: index.html's in document order, then any other page's.
      const hashes: string[] = [];
      for (const name of PLAYER_HTML_ENTRIES) {
        const html = readFileSync(join(outDir, `${name}.html`), 'utf8');
        const own = inlineScripts(html).map(sha256);
        if (!html.includes(playerCsp(own))) {
          throw new Error(
            `The built player page ${name}.html has no CSP meta tag for its scripts.`
          );
        }
        for (const hash of own) if (!hashes.includes(hash)) hashes.push(hash);
      }
      // Cloudflare Pages and Netlify read `_headers`; other hosts: see docs/SECURITY.md.
      const csp = playerCsp(hashes);
      const header = `${csp}; frame-ancestors ${PLAYER_FRAME_ANCESTORS.join(' ')}`;
      writeFileSync(
        join(outDir, '_headers'),
        `/*\n  Content-Security-Policy: ${header}\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n`
      );
    },
  };
}

export interface PlayerAssetsManifest {
  format: 'protoyard.player-assets';
  version: 1;
  player: string;
  files: { path: string; size: number; sha256: string }[];
}

/**
 * The asset manifest for a built app folder: every regular file except the
 * manifest itself (including `_headers`, `sw.js` and `.vite/manifest.json`),
 * as sorted POSIX paths. Links and special files are refused, as the CLI's
 * `verifyPlayerAssets` would refuse them.
 */
export function playerAssetsManifest(appDir: string, player: string): PlayerAssetsManifest {
  const paths: string[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      const rel = relative(appDir, full).split(sep).join('/');
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) paths.push(rel);
      else throw new Error(`The player build has a link or special file: ${rel}`);
    }
  };
  visit(appDir);
  const files = paths
    .filter((path) => path !== PLAYER_ASSETS_MANIFEST)
    .sort()
    .map((path) => {
      const full = join(appDir, ...path.split('/'));
      const data = readFileSync(full);
      return {
        path,
        size: lstatSync(full).size,
        sha256: createHash('sha256').update(data).digest('hex'),
      };
    });
  if (!files.some((file) => file.path === 'index.html')) {
    throw new Error('The built player has no index.html.');
  }
  return { format: 'protoyard.player-assets', version: 1, player, files };
}

/** Writes the asset manifest last, after `_headers` and the service worker. */
function assetsManifestPlugin(): Plugin {
  let outDir = PLAYER_APP_DIR;
  return {
    name: 'protoyard-player-assets-manifest',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle: {
      order: 'post',
      sequential: true,
      handler() {
        const { version } = JSON.parse(
          readFileSync(join(import.meta.dirname, 'package.json'), 'utf8')
        ) as { version: string };
        const manifest = playerAssetsManifest(outDir, version);
        writeFileSync(
          join(outDir, PLAYER_ASSETS_MANIFEST),
          `${JSON.stringify(manifest, null, 2)}\n`
        );
      },
    },
  };
}

export default defineProtoyardConfig({
  root: import.meta.dirname,
  // Four pages: shared Texuli CSS groups would link every page's components
  // into each page (initial CSS, and the CSS a single-file export inlines).
  // Rolldown's own split follows the tree-shaken chunks instead.
  texuliCssGroups: false,
  plugins: [cspPlugin(), assetsManifestPlugin()],
  // PROTOYARD_OUT_DIR and `--outDir` still win (showcase, e2e, visual sweep).
  build: {
    outDir: process.env.PROTOYARD_OUT_DIR
      ? undefined
      : resolve(import.meta.dirname, PLAYER_APP_DIR),
    rolldownOptions: {
      input: Object.fromEntries(
        PLAYER_HTML_ENTRIES.map((name) => [name, resolve(import.meta.dirname, `${name}.html`)])
      ),
      output: {
        codeSplitting: {
          // Rolldown places its tiny module runtime in the first chunk that needs
          // it. With two lazy boots sharing Dexie (apps and kinds), that was the
          // Dexie chunk, which every chunk then imported for the helpers, so
          // 132 KB of Dexie landed on the first screen. Own chunks for both keep
          // Dexie behind the boots.
          groups: [
            { name: 'rolldown-runtime', test: /rolldown[\\/]runtime/ },
            { name: 'dexie', test: /[\\/]dexie[\\/]/ },
          ],
        },
      },
    },
  },
  // The world-generation worker is a module worker. Building it as ES modules
  // lets it code-split and tree-shake like the app: its dynamic Faker import
  // keeps only `Faker`, `en` and `base` instead of every bundled locale.
  worker: { format: 'es' },
});
