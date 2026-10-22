import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';

/**
 * The page and doc design gate (T-site-qa-page-design-gate). The level-2 page
 * and doc once shipped unstyled, with a disabled form, two tables of contents
 * and timeline markers over their labels, while every test passed. This
 * module turns "looks designed" into measurable facts:
 *
 * - **Pure half** (unit-tested in `scripts/tests/page-design.test.ts`):
 *   `checkDesignFacts` turns facts measured in a browser into issues;
 *   `collectDesignFacts` is the self-contained function a spec hands to
 *   `page.evaluate` to measure them.
 * - **Harness** (used by `tests/e2e/page-design.spec.ts`):
 *   `prepareDesignBuilds` builds the player (level 1) and generates and
 *   builds the example page and doc with the real CLI in a scratch workspace
 *   under tmp/ (level 2), and `serveStatic` serves a folder on loopback.
 */

export type DesignKind = 'page' | 'doc';
export type DesignLevel = 'player' | 'generated';

export interface DesignTarget {
  kind: DesignKind;
  /** Repository path of the example blueprint. */
  blueprint: string;
  /** The level-2 prototype slug in the scratch workspace. */
  slug: string;
  /** The player page that runs this kind. */
  entry: 'page.html' | 'doc.html';
}

export const PAGE_DESIGN_TARGETS: readonly DesignTarget[] = [
  {
    kind: 'page',
    blueprint: 'blueprints/pages/tidewater-roasters-landing.json',
    slug: 'design-gate-page',
    entry: 'page.html',
  },
  {
    kind: 'doc',
    blueprint: 'blueprints/docs/northwind-quarterly-report.json',
    slug: 'design-gate-doc',
    entry: 'doc.html',
  },
];

/**
 * The display scale a hero or document title must reach, in CSS px and as a
 * multiple of the body text size. Measured 2026-10-22 on the examples: page
 * hero 60 px and doc title 64 px on desktop over a 16 px body. Phones (up to
 * `phoneMaxWidth`) get a smaller floor.
 */
export const DESIGN_THRESHOLDS = Object.freeze({
  desktop: { displayMinPx: 40, displayRatio: 2.25 },
  phone: { displayMinPx: 30, displayRatio: 1.75 },
  phoneMaxWidth: 600,
});

/** Theme tokens the theme engine sets on `<html>`; empty ones mean no theme ran. */
export const REQUIRED_THEME_TOKENS = [
  '--py-background',
  '--py-foreground',
  '--py-primary',
  '--py-font-sans',
  '--py-font-heading',
] as const;

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface DesignFacts {
  kind: DesignKind;
  viewportWidth: number;
  /** `REQUIRED_THEME_TOKENS` read from `<html>`. */
  tokens: Record<string, string>;
  bodyFontFamily: string;
  bodyFontSize: number;
  /** The hero (page) or document (doc) title, or null when none is rendered. */
  title: { text: string; fontSize: number; fontFamily: string } | null;
  /** Rendered `h1`/`h2` elements whose text is the title's (a duplicated title shows here). */
  titleCopies: number;
  /** Rendered tables of contents (`[data-py-doc-toc]`). */
  tocCount: number;
  /** Rendered in-page navigation links (`[data-py-page-nav-link]`, `[data-py-doc-toc-link]`). */
  navLinks: number;
  scrollWidth: number;
  /** Elements reaching past the viewport, outside any scroll container. */
  overflowing: string[];
  /** Each timeline event: its marker and its text labels. */
  timeline: { marker: Box; labels: Box[] }[];
}

export type DesignCheck =
  | 'theme'
  | 'display-scale'
  | 'title-copies'
  | 'toc'
  | 'navigation'
  | 'overflow'
  | 'timeline-overlap';

export interface DesignIssue {
  check: DesignCheck;
  message: string;
}

/** The first family of a CSS `font-family` list, unquoted and lowercased. */
export function firstFamily(fontFamily: string): string {
  return (fontFamily.split(',')[0] ?? '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .toLowerCase();
}

/** Whether a computed `font-family` is the browser default (no stylesheet applied). */
export function isDefaultSerif(fontFamily: string): boolean {
  return /^(?:times new roman|times|serif|tinos|liberation serif|dejavu serif)$/.test(
    firstFamily(fontFamily)
  );
}

/** Whether two boxes overlap by more than `tolerance` px on both axes. */
export function boxesOverlap(a: Box, b: Box, tolerance = 1): boolean {
  const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return x > tolerance && y > tolerance;
}

/** Every design issue in one measured view; an empty list passes the gate. */
export function checkDesignFacts(facts: DesignFacts): DesignIssue[] {
  const issues: DesignIssue[] = [];
  const add = (check: DesignCheck, message: string) => issues.push({ check, message });
  const phone = facts.viewportWidth <= DESIGN_THRESHOLDS.phoneMaxWidth;
  const scale = phone ? DESIGN_THRESHOLDS.phone : DESIGN_THRESHOLDS.desktop;

  // Theme: tokens set, and the stylesheet applied them (a missing stylesheet
  // leaves the browser's default serif even when the tokens are set).
  for (const token of REQUIRED_THEME_TOKENS) {
    if (!facts.tokens[token]) add('theme', `Theme token ${token} is not set on <html>.`);
  }
  if (isDefaultSerif(facts.bodyFontFamily)) {
    add(
      'theme',
      `Body text uses the browser default font (${facts.bodyFontFamily}): no stylesheet.`
    );
  } else {
    const families = [facts.tokens['--py-font-sans'], facts.tokens['--py-font-heading']]
      .filter((value): value is string => Boolean(value))
      .map(firstFamily);
    if (families.length > 0 && !families.includes(firstFamily(facts.bodyFontFamily))) {
      add(
        'theme',
        `Body text uses ${facts.bodyFontFamily}, not the theme's ${families.join(' or ')}.`
      );
    }
  }

  // Display scale: one title, large enough, in the theme's heading font.
  if (!facts.title) {
    add('display-scale', `No ${facts.kind === 'page' ? 'hero' : 'document'} title is rendered.`);
  } else {
    const min = Math.max(scale.displayMinPx, facts.bodyFontSize * scale.displayRatio);
    if (facts.title.fontSize < min) {
      add(
        'display-scale',
        `The title is ${facts.title.fontSize}px; the display scale needs at least ${Math.round(min)}px here.`
      );
    }
    if (isDefaultSerif(facts.title.fontFamily)) {
      add('theme', `The title uses the browser default font (${facts.title.fontFamily}).`);
    }
    if (facts.titleCopies !== 1) {
      add(
        'title-copies',
        `The title "${facts.title.text}" is rendered ${facts.titleCopies} times; it must appear once.`
      );
    }
  }

  // One table of contents for a doc; navigation that reaches the sections.
  if (facts.kind === 'doc' && facts.tocCount !== 1) {
    add('toc', `The doc renders ${facts.tocCount} tables of contents; it must render exactly one.`);
  }
  if (facts.navLinks === 0) {
    add('navigation', `The ${facts.kind} renders no in-page navigation links.`);
  }

  // Nothing wider than the viewport.
  if (facts.scrollWidth > facts.viewportWidth + 1) {
    add(
      'overflow',
      `The page scrolls horizontally: ${facts.scrollWidth}px wide in a ${facts.viewportWidth}px viewport.`
    );
  }
  for (const element of facts.overflowing) {
    add('overflow', `${element} reaches past the ${facts.viewportWidth}px viewport.`);
  }

  // Timeline markers never sit on their labels.
  facts.timeline.forEach((event, index) => {
    if (event.labels.some((label) => boxesOverlap(event.marker, label))) {
      add('timeline-overlap', `Timeline event ${index + 1}: its marker overlaps its label.`);
    }
  });
  return issues;
}

/**
 * Measures `DesignFacts` in the page. Self-contained (it runs through
 * `page.evaluate`, so it may not use anything from this module).
 */
export function collectDesignFacts(input: {
  kind: DesignKind;
  tokens: readonly string[];
}): DesignFacts {
  const rendered = (element: Element) => {
    if (element.getClientRects().length === 0) return false;
    const style = getComputedStyle(element);
    return style.visibility !== 'hidden' && style.display !== 'none';
  };
  const box = (element: Element): Box => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  };
  const text = (element: Element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim();
  const describe = (element: Element) => {
    const marks = [...element.attributes]
      .filter((attribute) => attribute.name.startsWith('data-py'))
      .map((attribute) => `[${attribute.name}]`)
      .join('');
    return `${element.tagName.toLowerCase()}${marks}`;
  };
  const root = getComputedStyle(document.documentElement);
  const tokens: Record<string, string> = {};
  for (const token of input.tokens) tokens[token] = root.getPropertyValue(token).trim();

  const titleElement =
    input.kind === 'doc'
      ? [...document.querySelectorAll('[data-py-doc-title]')].find(rendered)
      : [...document.querySelectorAll('[data-py-page-section] h1, h1')].find(rendered);
  const titleText = titleElement ? text(titleElement) : '';
  const titleStyle = titleElement ? getComputedStyle(titleElement) : null;

  // Elements past the viewport, unless an ancestor scrolls or clips them.
  const width = window.innerWidth;
  const clipped = (element: Element) => {
    for (
      let node = element.parentElement;
      node && node !== document.body;
      node = node.parentElement
    ) {
      const overflow = getComputedStyle(node).overflowX;
      if (overflow !== 'visible') return true;
    }
    return false;
  };
  const overflowing: string[] = [];
  for (const element of document.body.querySelectorAll('*')) {
    if (overflowing.length >= 10) break;
    if (!rendered(element)) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if ((rect.right > width + 1 || rect.left < -1) && !clipped(element)) {
      overflowing.push(describe(element));
    }
  }

  const timeline = [...document.querySelectorAll('[data-py-timeline-event]')]
    .filter(rendered)
    .flatMap((event) => {
      const marker = event.querySelector('[data-py-timeline-marker]');
      if (!marker) return [];
      const labels = [...event.children]
        .filter((child) => child !== marker && rendered(child) && text(child).length > 0)
        .map(box);
      return [{ marker: box(marker), labels }];
    });

  return {
    kind: input.kind,
    viewportWidth: width,
    tokens,
    bodyFontFamily: getComputedStyle(document.body).fontFamily,
    bodyFontSize: Number.parseFloat(getComputedStyle(document.body).fontSize),
    title: titleElement
      ? {
          text: titleText,
          fontSize: Number.parseFloat(titleStyle?.fontSize ?? '0'),
          fontFamily: titleStyle?.fontFamily ?? '',
        }
      : null,
    titleCopies: titleText
      ? [...document.querySelectorAll('h1, h2')].filter(
          (heading) => rendered(heading) && text(heading) === titleText
        ).length
      : 0,
    tocCount: [...document.querySelectorAll('[data-py-doc-toc]')].filter(rendered).length,
    navLinks: [...document.querySelectorAll('[data-py-page-nav-link], [data-py-doc-toc-link]')]
      .length,
    scrollWidth: document.documentElement.scrollWidth,
    overflowing,
    timeline,
  };
}

// ── harness (Node) ─────────────────────────────────────────────────────────

const execFileAsync = promisify(execFile);

export interface DesignBuilds {
  /** The built player with the example blueprints beside it. */
  player: string;
  /** Each level-2 prototype's built `dist/`, by kind. */
  generated: Record<DesignKind, string>;
}

/** The environment of a production build (a test runner's NODE_ENV would make dev builds). */
function buildEnv(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => key !== 'NODE_ENV' && !key.startsWith('VITEST') && !key.startsWith('PLAYWRIGHT_')
    )
  );
}

async function run(root: string, command: string, args: string[]): Promise<void> {
  await execFileAsync(command, args, {
    cwd: root,
    env: buildEnv(),
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** Who holds the build lock: written into the lock directory right after it is created. */
const LOCK_OWNER = 'owner.json';

/** Whether process `pid` still runs (signal 0 only checks; EPERM means it exists). */
export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * Whether a build lock was left behind by a run that died: its owner process
 * is gone, or it never recorded an owner and is older than `graceMs` (a
 * crash between creating the lock and writing the owner). A live owner's lock
 * is never stale, however old, because a cold build can take many minutes.
 */
export function isStaleLock(
  lock: { owner: { pid: number } | null; ageMs: number },
  alive: (pid: number) => boolean = processAlive,
  graceMs = 60_000
): boolean {
  if (lock.owner) return !alive(lock.owner.pid);
  return lock.ageMs > graceMs;
}

async function readLock(lock: string): Promise<{ owner: { pid: number } | null; ageMs: number }> {
  const ageMs = Date.now() - (await stat(lock)).mtimeMs;
  try {
    const owner = JSON.parse(await readFile(join(lock, LOCK_OWNER), 'utf8')) as { pid?: unknown };
    return { owner: typeof owner.pid === 'number' ? { pid: owner.pid } : null, ageMs };
  } catch {
    return { owner: null, ageMs };
  }
}

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false
  );

/**
 * Builds both levels once under `out` (inside the repository's tmp/):
 *
 * - **Level 1:** `vite build` of `@protoyard/player` into `<out>/player`, with
 *   the two example blueprints copied beside it for `?src=`.
 * - **Level 2:** a scratch workspace in `<out>/ws` with copies of the page and
 *   doc templates, where the real `protoyard generate` and `protoyard build`
 *   run (`--root`). Each prototype links its template's `node_modules`, the
 *   way `pnpm install` would link the same workspace packages.
 *
 * Workers share one build through a lock directory and a done marker. A lock
 * whose owner process died is taken over (`isStaleLock`). Set `reuse` to keep
 * a finished build from an earlier run.
 */
export async function prepareDesignBuilds(options: {
  repo: string;
  out: string;
  reuse?: boolean;
}): Promise<DesignBuilds> {
  const { repo, out } = options;
  const player = join(out, 'player');
  const ws = join(out, 'ws');
  const builds: DesignBuilds = {
    player,
    generated: Object.fromEntries(
      PAGE_DESIGN_TARGETS.map((target) => [target.kind, join(ws, 'artifacts', target.slug, 'dist')])
    ) as Record<DesignKind, string>,
  };
  const done = join(out, 'built.json');
  const lock = join(out, '.lock');
  const stamp = String(process.ppid);
  await mkdir(out, { recursive: true });
  const ready = async () => {
    if (!(await exists(done))) return false;
    if (options.reuse) return true;
    // One build per test run: the runner's process id marks the run.
    const marker = JSON.parse(await readFile(done, 'utf8')) as { run?: string };
    return marker.run === stamp;
  };
  const deadline = Date.now() + 45 * 60_000;
  while (!(await ready())) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for the design builds in ${out}`);
    try {
      await mkdir(lock);
    } catch {
      // Another worker builds, or a crashed run left its lock behind.
      const held = await readLock(lock).catch(() => null);
      if (held && isStaleLock(held)) await rm(lock, { recursive: true, force: true });
      else await new Promise((settle) => setTimeout(settle, 1000));
      continue;
    }
    await writeFile(join(lock, LOCK_OWNER), `${JSON.stringify({ pid: process.pid })}\n`);
    try {
      if (await ready()) break;
      await rm(done, { force: true });
      await run(repo, 'pnpm', [
        '--filter',
        '@protoyard/player',
        'exec',
        'vite',
        'build',
        '--outDir',
        player,
        '--emptyOutDir',
      ]);
      for (const target of PAGE_DESIGN_TARGETS) {
        await cp(
          join(repo, target.blueprint),
          join(player, target.blueprint.split('/').at(-1) ?? '')
        );
      }

      await rm(ws, { recursive: true, force: true });
      await mkdir(join(ws, 'prototypes'), { recursive: true });
      await writeFile(join(ws, 'pnpm-workspace.yaml'), "packages:\n  - 'prototypes/*'\n");
      await writeFile(
        join(ws, 'package.json'),
        '{ "name": "design-gate-workspace", "private": true }\n'
      );
      // Same depth as the repository, so a template's ../../tsconfig.base.json resolves.
      await symlink(join(repo, 'tsconfig.base.json'), join(ws, 'tsconfig.base.json'));
      for (const target of PAGE_DESIGN_TARGETS) {
        await cp(join(repo, 'templates', target.kind), join(ws, 'templates', target.kind), {
          recursive: true,
          filter: (source) => !/[\\/](?:node_modules|dist)(?:[\\/]|$)/.test(source),
        });
        await run(repo, 'pnpm', [
          'protoyard',
          '--root',
          ws,
          'generate',
          target.slug,
          '--blueprint',
          join(repo, target.blueprint),
          '--no-install',
        ]);
        await symlink(
          join(repo, 'templates', target.kind, 'node_modules'),
          join(ws, 'prototypes', target.slug, 'node_modules'),
          'dir'
        );
        await run(repo, 'pnpm', ['protoyard', '--root', ws, 'build', target.slug]);
      }
      await writeFile(done, `${JSON.stringify({ run: stamp })}\n`);
    } finally {
      await rm(lock, { recursive: true, force: true });
    }
  }
  for (const dir of [player, ...Object.values(builds.generated)]) {
    if (!existsSync(join(dir, 'index.html'))) throw new Error(`Missing build: ${dir}/index.html`);
  }
  return builds;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

/**
 * Serves `dir` on 127.0.0.1 at a free port. URLs use `localhost`: the player
 * probes for `quick serve` only on 127.0.0.1, which would log a 404.
 */
export async function serveStatic(dir: string): Promise<{ url: string; close(): Promise<void> }> {
  const root = resolve(dir);
  const server = createServer((request, response) => {
    void (async () => {
      const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
      let file = resolve(root, `.${pathname}`);
      const inside = relative(root, file);
      if (inside.startsWith(`..${sep}`) || inside === '..') {
        response.writeHead(403).end();
        return;
      }
      if ((await exists(file)) && (await stat(file)).isDirectory()) file = join(file, 'index.html');
      try {
        const body = await readFile(file);
        response.writeHead(200, {
          'content-type': MIME[extname(file)] ?? 'application/octet-stream',
          'cache-control': 'no-store',
        });
        response.end(body);
      } catch {
        response.writeHead(404).end('Not found');
      }
    })();
  });
  await new Promise<void>((settle) => server.listen(0, '127.0.0.1', settle));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://localhost:${port}/`,
    close: () => new Promise<void>((settle) => server.close(() => settle())),
  };
}
