/**
 * Gallery thumbnails generated from the REAL apps (`pnpm thumbnails`).
 *
 * For each prototype: build it (`pnpm protoyard build <slug>`), serve
 * `artifacts/<slug>/dist` from a tiny local static server, open it in
 * headless Chromium at 1280×800 and write `prototypes/<slug>/public/thumbnail.png`.
 *
 * Deterministic by construction: the manifest's default scenario via
 * `?scenario=`, DevTools off (`?devtools=0`), reduced motion, light color
 * scheme, a fixed viewport, and a capture only after the runtime marks
 * `html[data-py-ready="true"]`, fonts are loaded and the network is idle.
 * Simulated time comes from the scenario, so dates in the UI never drift.
 * Phone-first prototypes render their manifest preview viewport (a centered
 * phone column), which fits the gallery's 16:10 cards.
 *
 *   tsx scripts/generate-thumbnails.ts [slug…] [--skip-build] [--check]
 *
 * `--check` captures twice in fresh browser contexts and fails if the PNGs differ.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync, inflateSync } from 'node:zlib';
import { chromium } from '@playwright/test';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const WIDTH = 1280;
const HEIGHT = 800;
const BUDGET_BYTES = 150 * 1024;

interface Target {
  slug: string;
  dir: string;
  defaultScenario: string | undefined;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

function discover(only: readonly string[]): Target[] {
  const base = join(ROOT, 'prototypes');
  const targets: Target[] = [];
  for (const slug of readdirSync(base).sort()) {
    // Same rule as the CLI's discovery: symlinked prototype folders are never
    // processed (writing a thumbnail would go into the link's target).
    if (lstatSync(join(base, slug)).isSymbolicLink()) continue;
    const manifestPath = join(base, slug, 'protoyard.json');
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      kind?: string;
      status?: string;
      defaultScenario?: string;
    };
    if ((manifest.kind ?? 'prototype') !== 'prototype' || manifest.status === 'archived') continue;
    if (only.length > 0 && !only.includes(slug)) continue;
    targets.push({ slug, dir: join(base, slug), defaultScenario: manifest.defaultScenario });
  }
  const missing = only.filter((slug) => !targets.some((t) => t.slug === slug));
  if (missing.length) throw new Error(`Unknown prototype(s): ${missing.join(', ')}`);
  return targets;
}

/** Static server for one dist folder; never serves outside it. */
function serve(dist: string): Promise<Server> {
  const root = realpathSync(dist);
  const inside = (path: string) => path === root || path.startsWith(root + sep);
  const server = createServer((req, res) => {
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    let file = join(root, normalize(pathname).replace(/^([/\\])+/, ''));
    if (!inside(file)) {
      res.writeHead(403).end();
      return;
    }
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
    // Resolve symlinks too: a link inside dist must not serve files from elsewhere.
    if (!inside(realpathSync(file))) {
      res.writeHead(403).end();
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    res.end(readFileSync(file));
  });
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

/**
 * Lossless PNG re-compression: re-deflates the image data at level 9 and drops
 * ancillary chunks. No pixels change.
 */
export function optimizePng(png: Buffer): Buffer {
  const signature = png.subarray(0, 8);
  const chunks: { type: string; data: Buffer }[] = [];
  const idat: Buffer[] = [];
  for (let offset = 8; offset < png.length; ) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('latin1', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === 'IDAT') idat.push(data);
    else if (type === 'IHDR' || type === 'PLTE' || type === 'tRNS' || type === 'IEND') {
      chunks.push({ type, data });
    }
  }
  const image = deflateSync(inflateSync(Buffer.concat(idat)), { level: 9, memLevel: 9 });
  const encode = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'latin1');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
    return Buffer.concat([head, data, crc]);
  };
  const parts = [signature];
  for (const chunk of chunks) {
    if (chunk.type === 'IEND') parts.push(encode('IDAT', image));
    parts.push(encode(chunk.type, chunk.data));
  }
  const optimized = Buffer.concat(parts);
  return optimized.length < png.length ? optimized : png;
}

async function capture(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  url: string
): Promise<Buffer> {
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    colorScheme: 'light',
    locale: 'en-US',
    timezoneId: 'UTC',
  });
  try {
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.documentElement.dataset.pyReady !== undefined, null, {
      timeout: 30_000,
    });
    const state = await page.evaluate(() => document.documentElement.dataset.pyReady);
    if (state !== 'true') throw new Error(`prototype failed to boot (data-py-ready="${state}")`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForLoadState('networkidle');
    // liveQuery results land a few ticks after mount; wait until the DOM is quiet.
    // liveQuery results land a few ticks after mount; wait until the DOM is quiet.
    // A string, because tsx rewrites named functions with a helper the page lacks.
    await page.evaluate(QUIET_DOM);
    if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
    return await page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide' });
  } finally {
    await context.close();
  }
}

const QUIET_DOM = `new Promise((done) => {
  let timer;
  const observer = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(stop, 400); });
  const stop = () => { observer.disconnect(); done(); };
  timer = setTimeout(stop, 400);
  observer.observe(document.body, { subtree: true, childList: true, characterData: true });
})`;

const sha = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex').slice(0, 12);

async function main() {
  const args = process.argv.slice(2);
  const skipBuild = args.includes('--skip-build');
  const check = args.includes('--check');
  const targets = discover(args.filter((a) => !a.startsWith('--')));
  const browser = await chromium.launch();
  let failures = 0;
  try {
    for (const target of targets) {
      const started = performance.now();
      try {
        if (!skipBuild) {
          const build = spawnSync('pnpm', ['protoyard', 'build', target.slug], {
            cwd: ROOT,
            encoding: 'utf8',
          });
          if (build.status !== 0) throw new Error(`build failed:\n${build.stdout}${build.stderr}`);
        }
        const dist = join(ROOT, 'artifacts', target.slug, 'dist');
        if (!existsSync(join(dist, 'index.html'))) throw new Error(`no build at ${dist}`);
        const server = await serve(dist);
        try {
          const { port } = server.address() as AddressInfo;
          const query = new URLSearchParams({ devtools: '0' });
          if (target.defaultScenario) query.set('scenario', target.defaultScenario);
          const url = `http://127.0.0.1:${port}/?${query}`;
          const raw = await capture(browser, url);
          const png = optimizePng(raw);
          if (check) {
            const second = optimizePng(await capture(browser, url));
            if (!second.equals(png)) {
              throw new Error(`not deterministic: ${sha(png)} vs ${sha(second)}`);
            }
          }
          mkdirSync(join(target.dir, 'public'), { recursive: true });
          const out = join(target.dir, 'public', 'thumbnail.png');
          // Never write THROUGH a symlink (a committed public/thumbnail.png -> ~/.zshrc).
          for (const path of [join(target.dir, 'public'), out]) {
            if (existsSync(path) && lstatSync(path).isSymbolicLink()) {
              throw new Error(`refusing to write through the symlink ${path}`);
            }
          }
          writeFileSync(out, png);
          const kb = (png.length / 1024).toFixed(1);
          const note =
            png.length > BUDGET_BYTES ? ` (over the ${BUDGET_BYTES / 1024} KB budget)` : '';
          console.log(
            `✓ ${target.slug}: ${WIDTH}×${HEIGHT} ${kb} KB (raw ${(raw.length / 1024).toFixed(1)} KB)${note} sha ${sha(png)}${check ? ' · deterministic' : ''} · ${((performance.now() - started) / 1000).toFixed(1)} s`
          );
        } finally {
          server.close();
        }
      } catch (error) {
        failures++;
        console.error(
          `✗ ${target.slug}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  } finally {
    await browser.close();
  }
  if (failures) process.exitCode = 1;
}

await main();
