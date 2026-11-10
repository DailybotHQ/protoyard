// @vitest-environment node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import {
  DS_LOCKED_RENDER_EXEMPT_IDS,
  type DsCheckPage,
  type DsCheckRun,
  type DsInspectResult,
  runLockedRenderChecks,
} from '@texuli/tools/ds-check';
import { afterEach, describe, expect, it } from 'vitest';
import { createCheckDsCommand } from '../src/commands/check.ts';
import { buildInputsHash } from '../src/lib/build-inputs.ts';
import { launchChromium, withReadyPage } from '../src/lib/capture/index.ts';
import { captureMaySocket } from '../src/lib/capture/page.ts';
import { makeOutput } from '../src/lib/command.ts';
import { dsCatalog } from '../src/lib/ds-catalog.ts';
import type { DsRenderDriver, DsRenderVisitRequest } from '../src/lib/ds-render/browser.ts';
import { visitUrl } from '../src/lib/ds-render/browser.ts';
import {
  applyBaseline,
  baselineDocument,
  DS_RENDER_EXEMPT_IDS,
  DS_RENDER_MAX_ROUTES,
  type DsRenderPageInfo,
  type DsRenderVisit,
  discoverDeclaredRoutes,
  type LockedReportLike,
  parseBaseline,
  parseRouteOption,
  planRoutes,
  planVisits,
  renderAllowManifest,
  routeMatcher,
  visitFindings,
} from '../src/lib/ds-render/index.ts';
import {
  type DsRenderDeps,
  type DsRenderReport,
  type DsRenderTarget,
  freshBuild,
  realDsRenderDeps,
  renderPrototypes,
} from '../src/lib/ds-render/run.ts';
import { CliError } from '../src/lib/output.ts';
import type { RegistryEntry } from '../src/lib/registry.ts';
import { createContext } from '../src/lib/workspace.ts';
import { addPrototype, cli, createWorkspace, type TempWorkspace } from './helpers.ts';

/** The `render` part of the command's data. */
type RenderData = DsRenderReport & {
  blocking: number;
  wroteBaseline: string | null;
  skipped: { slug: string; reason: string }[];
};

const LOCKED = { designSystem: { id: 'acme', version: '1.0.0', locked: true } };

const route = (path: string, file: string | null = null) => ({
  path,
  pattern: path,
  file,
  source: 'declared' as const,
});

const info = (overrides: Partial<DsRenderPageInfo> = {}): DsRenderPageInfo => ({
  scope: '#app',
  roots: 3,
  links: [],
  unownedVisualizations: [],
  ...overrides,
});

const cleanRun = (mode: 'light' | 'dark'): LockedReportLike['runs'][number] => ({
  variant: null,
  mode,
  components: ['button'],
  axe: [],
  pairs: [],
  literals: [],
});

const clean = (mode: 'light' | 'dark'): LockedReportLike => ({
  mapping: { errors: [] },
  runs: [cleanRun(mode)],
});

describe('route planning', () => {
  let ws: TempWorkspace | undefined;
  afterEach(() => {
    ws?.cleanup();
    ws = undefined;
  });

  it('reads the declared routes of router files only, once each, with the declaring file', () => {
    ws = createWorkspace();
    ws.write(
      'prototypes/a/src/App.svelte',
      `<script>const router = createRouter([\n  { path: '/', component: A },\n  { path: "/notes/:id", component: B },\n]);</script>`
    );
    ws.write(
      'prototypes/a/src/routes.ts',
      `export const routes = defineRoutes([{ path: '/', x }, { path: '/settings', y }]);`
    );
    ws.write('prototypes/a/src/lib/links.ts', `export const link = { path: '/not-a-route' };`);
    ws.write('prototypes/a/tests/App.svelte', `createRouter([{ path: '/from-tests' }])`);
    const declared = discoverDeclaredRoutes(ws.root, join(ws.root, 'prototypes/a'));
    expect(declared).toEqual([
      { pattern: '/', file: 'prototypes/a/src/App.svelte' },
      { pattern: '/notes/:id', file: 'prototypes/a/src/App.svelte' },
      { pattern: '/settings', file: 'prototypes/a/src/routes.ts' },
    ]);
  });

  it('matches the hash router patterns', () => {
    expect(routeMatcher('/notes/:id')('/notes/n1')).toBe(true);
    expect(routeMatcher('/notes/:id')('/notes')).toBe(false);
    expect(routeMatcher('/notes/:id?')('/notes')).toBe(true);
    expect(routeMatcher('/docs/*')('/docs/a/b')).toBe(true);
    expect(routeMatcher('/')('/')).toBe(true);
    expect(routeMatcher('/')('/x')).toBe(false);
  });

  it('visits static routes, resolves parameterized ones through links and skips the rest with a reason', () => {
    const declared = [
      { pattern: '/', file: 'src/App.svelte' },
      { pattern: '/settings', file: 'src/App.svelte' },
      { pattern: '/notes/:id', file: 'src/App.svelte' },
      { pattern: '/people/:id', file: 'src/App.svelte' },
      { pattern: '/docs/*', file: 'src/App.svelte' },
    ];
    const links = ['/notes/n2', '/notes/n1', '/deals/deal_0001', '/deals/deal_0002', '/about'];
    const { routes, skipped } = planRoutes(declared, links);
    expect(routes.map((r) => [r.path, r.pattern, r.source])).toEqual([
      ['/', '/', 'declared'],
      ['/settings', '/settings', 'declared'],
      ['/notes/n2', '/notes/:id', 'link'],
      ['/docs', '/docs/*', 'declared'],
      // One page per shape of an undeclared link (deal_0002 has the shape of deal_0001).
      ['/deals/deal_0001', null, 'link'],
      ['/about', null, 'link'],
    ]);
    expect(skipped).toEqual([
      {
        pattern: '/people/:id',
        file: 'src/App.svelte',
        reason: expect.stringContaining('--route'),
      },
    ]);
  });

  it('always visits the home page and caps the routes of one run', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ pattern: `/p${i}`, file: null }));
    const { routes, skipped } = planRoutes(many as never, []);
    expect(routes).toHaveLength(DS_RENDER_MAX_ROUTES);
    expect(routes[0]?.path).toBe('/');
    expect(skipped).toHaveLength(41 - DS_RENDER_MAX_ROUTES);
    expect(skipped[0]?.reason).toContain('limit');
  });

  it('plans route × viewport × mode, and validates --route', () => {
    const visits = planVisits([route('/'), route('/settings')]);
    expect(visits).toHaveLength(8);
    expect(visits.slice(0, 4).map((v) => `${v.route.path} ${v.viewport.id} ${v.mode}`)).toEqual([
      '/ desktop light',
      '/ desktop dark',
      '/ phone light',
      '/ phone dark',
    ]);
    expect(visits.find((v) => v.viewport.id === 'phone')?.viewport.mobile).toBe(true);
    expect(parseRouteOption(['#/settings', '/a/'])).toEqual([
      { path: '/settings', pattern: null, file: null, source: 'option' },
      { path: '/a', pattern: null, file: null, source: 'option' },
    ]);
    expect(() => parseRouteOption(['settings'])).toThrow(/hash path/);
    expect(visitUrl('http://127.0.0.1:5400/', visits[1] as DsRenderVisit)).toBe(
      'http://127.0.0.1:5400/?devtools=0&mode=dark#/'
    );
  });
});

describe('mapping and exemptions', () => {
  it('maps against the allow set, its parts and what allowed extensions and library entries compose', () => {
    const catalog = dsCatalog();
    const extension = catalog.extensions.find((e) => (e.composes ?? []).length > 0);
    expect(extension).toBeDefined();
    const part = catalog.components.find((c) => c.id === 'select-trigger');
    const allow = {
      button: {},
      ...(part ? { select: {} } : {}),
      [extension?.id as string]: {},
    };
    const manifest = renderAllowManifest(catalog, allow as never, [
      {
        id: 'hero',
        name: 'Hero',
        purpose: 'x',
        version: '1.0.0',
        status: 'approved',
        composes: ['card'],
      },
    ]);
    const ids = Object.keys(manifest.allow);
    expect(ids).toContain('button');
    expect(ids).toContain(extension?.id);
    for (const id of extension?.composes ?? []) expect(ids).toContain(id);
    expect(ids).toContain('card');
    if (part) expect(ids).toContain('select-trigger');
    expect(ids).not.toContain('dialog');
  });

  it("keeps Texuli's exempt ids (charts, maps and canvas)", () => {
    expect([...DS_RENDER_EXEMPT_IDS]).toEqual([...DS_LOCKED_RENDER_EXEMPT_IDS]);
  });

  it("drops painted chart, map and canvas marks but keeps their chrome (Texuli's runLockedRenderChecks)", async () => {
    const inspect: DsInspectResult = {
      components: ['charts-line', 'canvas', 'button'],
      pairs: [],
      checked: 12,
      literals: [
        { component: 'charts-line', element: 'path.series', property: 'stroke', value: '#123456' },
        { component: 'data-map', element: 'circle', property: 'fill', value: '#654321' },
        { component: 'charts-line', element: 'span.legend', property: 'color', value: '#ff0000' },
        {
          component: 'button',
          element: 'button.tx-button',
          property: 'background-color',
          value: '#ff0000',
        },
      ],
    };
    let calls = 0;
    const page: DsCheckPage = {
      goto: async () => undefined,
      emulateMedia: async () => undefined,
      waitForFunction: async () => true,
      evaluate: (async () =>
        calls++ === 0 ? inspect.components : inspect) as DsCheckPage['evaluate'],
    };
    const run = {
      variant: null,
      ok: true,
      modes: ['light'],
      contrast: {},
      adjustments: [],
      warnings: [],
      inlineBytes: 0,
      targets: [],
      compiled: {
        id: 'acme',
        modes: ['light'],
        vars: { light: {} },
        attrs: {},
        fontFaces: [],
        defaults: {},
        report: { contrast: {} },
      },
    } as unknown as DsCheckRun;
    const locked = await runLockedRenderChecks(
      page,
      [run],
      { ok: true, codes: [], errors: [] },
      {
        modes: ['light'],
        axe: async () => [],
      }
    );
    const visit = planVisits([route('/')], ['light'])[0] as DsRenderVisit;
    const findings = visitFindings('acme-app', visit, info(), locked as LockedReportLike, 'acme');
    expect(findings.map((f) => [f.code, f.component, f.selector])).toEqual([
      ['render-literal', 'charts-line', 'span.legend'],
      ['render-literal', 'button', 'button.tx-button'],
    ]);
  });
});

describe('findings', () => {
  const visit = planVisits([route('/settings', 'src/App.svelte')], ['dark'])[0] as DsRenderVisit;

  it('turns every Texuli finding into a located finding with a way out', () => {
    const locked: LockedReportLike = {
      mapping: {
        errors: [
          {
            code: 'unmapped',
            path: 'main>button',
            message: 'Interactive element is not inside a catalog component root.',
          },
          {
            code: 'not-allowed',
            path: 'main>div[data-tx-component="dialog"]',
            message: 'Component "dialog" is not in the allow manifest.',
            source: 'dialog',
          },
        ],
      },
      runs: [
        {
          variant: null,
          mode: 'dark',
          components: ['button'],
          axe: ['color-contrast (serious): .hot'],
          pairs: [
            {
              foreground: '--tx-muted-foreground',
              background: '--tx-background',
              ratio: 3.1,
              required: 4.5,
              pass: false,
            },
          ],
          literals: [
            {
              component: 'button',
              element: 'button.tx-button',
              property: 'color',
              value: 'rgb(255, 0, 0)',
            },
          ],
        },
        { ...cleanRun('dark'), variant: 'high-contrast', components: [] },
        // Another mode's run is not this visit's.
        { ...cleanRun('light'), components: [] },
      ],
    };
    const findings = visitFindings(
      'acme-app',
      visit,
      info({ unownedVisualizations: [{ selector: 'main>svg', tag: 'svg' }] }),
      locked,
      'acme'
    );
    expect(findings.map((f) => f.code)).toEqual([
      'unmapped',
      'not-allowed',
      'render-literal',
      'render-contrast',
      'render-axe',
      'render-empty',
      'render-unowned-visualization',
    ]);
    for (const f of findings) {
      expect(f).toMatchObject({
        slug: 'acme-app',
        route: '/settings',
        mode: 'dark',
        viewport: 'desktop',
        file: 'src/App.svelte',
      });
      expect(f.wayOut.length).toBeGreaterThan(20);
      expect(f.fingerprint).toContain('acme-app|/settings|desktop|dark|');
    }
    expect(findings[1]?.component).toBe('dialog');
    expect(findings[1]?.wayOut).toContain('design-systems/acme/document.json');
    expect(findings[4]?.selector).toBe('.hot');
    expect(findings[5]?.message).toContain('variant high-contrast');
  });

  it('reports rendered axis values the allow entry does not enable, once per value', () => {
    const rendered = info({
      axes: [
        {
          component: 'button',
          selector: 'main>button:nth-of-type(1)',
          variant: 'ghost',
          size: 'sm',
        },
        { component: 'button', selector: 'main>button:nth-of-type(2)', variant: 'ghost' },
        { component: 'button', selector: 'main>button:nth-of-type(3)', variant: 'default' },
        // Every value of an entry without a list is enabled; an id outside allow is the mapping's.
        { component: 'badge', selector: 'main>span', variant: 'neon' },
        { component: 'dialog', selector: 'main>div', size: 'xl' },
      ],
    });
    const allow = { button: { variants: ['default', 'outline'], sizes: ['sm', 'md'] }, badge: {} };
    const findings = visitFindings(
      'acme-app',
      visit,
      rendered,
      clean('dark'),
      'acme',
      allow as never
    );
    expect(findings.map((f) => [f.code, f.component, f.selector])).toEqual([
      ['render-disabled-value', 'button', 'main>button:nth-of-type(1)'],
    ]);
    expect(findings[0]?.message).toContain('variant "ghost"');
    expect(findings[0]?.message).toContain('default, outline');
    // Without the allow section nothing is checked.
    expect(visitFindings('acme-app', visit, rendered, clean('dark'), 'acme')).toEqual([]);
  });

  it('writes, reads and applies baselines (its own file or a saved --json output)', () => {
    const locked: LockedReportLike = {
      mapping: { errors: [{ code: 'unmapped', path: 'main>button', message: 'x' }] },
      runs: [cleanRun('dark')],
    };
    const findings = visitFindings('acme-app', visit, info(), locked);
    const doc = baselineDocument([...findings, ...findings]);
    expect(doc.format).toBe('protoyard/ds-render-baseline');
    expect(doc.findings).toHaveLength(1);
    const fromFile = parseBaseline(JSON.parse(JSON.stringify(doc)));
    const fromJson = parseBaseline({ ok: false, data: { render: { findings } } });
    expect([...fromFile]).toEqual([...fromJson]);
    expect(() => parseBaseline({ nothing: true })).toThrow(/no findings list/);
    expect(() => parseBaseline({ findings: [{ code: 'x' }] })).toThrow(/fingerprint/);

    const applied = applyBaseline(
      findings,
      new Set([...fromFile, 'gone|/|desktop|light|unmapped||x'])
    );
    expect(applied).toMatchObject({ fresh: 0, baselined: 1, fixed: 1 });
    expect(applied.findings[0]?.baselined).toBe(true);
    expect(applyBaseline(findings, null)).toMatchObject({ fresh: 1, baselined: 0, fixed: 0 });
  });
});

/** Fake dependencies: a browser that answers from a table of routes. */
function fakeDeps(
  pages: Record<
    string,
    { links?: string[]; error?: string; locked?: (mode: 'light' | 'dark') => LockedReportLike }
  >,
  options: { unavailable?: boolean; compiles?: boolean } = {}
) {
  const visits: DsRenderVisitRequest[] = [];
  const events: string[] = [];
  const driver: DsRenderDriver = {
    async visit(request) {
      visits.push(request);
      const page = pages[request.visit.route.path];
      if (!page || page.error) throw new Error(page?.error ?? 'net::ERR_ABORTED');
      return {
        info: info({ links: page.links ?? [] }),
        locked: page.locked?.(request.visit.mode) ?? clean(request.visit.mode),
      };
    },
    async close() {
      events.push('close-browser');
    },
  };
  const deps: DsRenderDeps = {
    launch: async () =>
      options.unavailable
        ? { ok: false, reason: 'browser-unavailable', detail: "Executable doesn't exist" }
        : { ok: true, driver },
    compile: async () =>
      options.compiles === false
        ? {
            runs: [{ variant: null }],
            allowManifest: undefined,
            errors: ['invalid-value $.colors'],
          }
        : {
            runs: [{ variant: null, compiled: {} }],
            allowManifest: { allow: { button: true } },
            errors: [],
          },
    serve: async () => {
      events.push('serve');
      return {
        baseUrl: 'http://127.0.0.1:5401/',
        build: 'reused',
        close: async () => {
          events.push('close-server');
        },
      };
    },
  };
  return { deps, visits, events };
}

const target = (overrides: Partial<DsRenderTarget> = {}): DsRenderTarget => ({
  slug: 'acme-app',
  entry: { slug: 'acme-app', kind: 'prototype' } as RegistryEntry,
  dir: '/nowhere',
  designSystemId: 'acme',
  locked: true,
  declared: [
    { pattern: '/', file: 'src/App.svelte' },
    { pattern: '/notes/:id', file: 'src/App.svelte' },
  ],
  ...overrides,
});

describe('renderPrototypes (orchestration, no browser)', () => {
  it('visits declared routes, then the routes their links lead to, in every mode and viewport', async () => {
    const { deps, visits, events } = fakeDeps({
      '/': { links: ['/notes/n1', '/notes/n2'] },
      '/notes/n1': {
        locked: (mode) => ({
          mapping: { errors: [] },
          runs: [
            {
              ...cleanRun(mode),
              literals: [
                { component: 'card', element: 'div.tx-card', property: 'color', value: '#f00' },
              ],
            },
          ],
        }),
      },
    });
    const report = await renderPrototypes([target()], deps);
    expect(visits).toHaveLength(8);
    expect(visits.every((v) => v.allowManifest.allow?.button === true)).toBe(true);
    expect(report.prototypes[0]?.routes.map((r) => r.path)).toEqual(['/', '/notes/n1']);
    expect(report.counts).toMatchObject({ prototypes: 1, visits: 8, findings: 4, fresh: 4 });
    expect(report.counts.byCode).toEqual({ 'render-literal': 4 });
    expect(report.ok).toBe(false);
    expect(events).toEqual(['serve', 'close-server', 'close-browser']);
  });

  it('checks only --route routes when given, and records a route that did not load as an error', async () => {
    const { deps, visits } = fakeDeps({ '/': {} });
    const report = await renderPrototypes([target()], deps, {
      routes: parseRouteOption(['/broken']),
      modes: ['light'],
      viewports: [{ id: 'desktop', width: 1280, height: 800, mobile: false }],
    });
    expect(visits.map((v) => v.visit.route.path)).toEqual(['/broken']);
    expect(report.findings.map((f) => [f.code, f.route])).toEqual([
      ['render-page-error', '/broken'],
    ]);
    expect(report.findings[0]?.message).toContain('could not be checked');
  });

  it('reports a design system that does not compile without opening a page', async () => {
    const { deps, visits, events } = fakeDeps({}, { compiles: false });
    const report = await renderPrototypes([target()], deps);
    expect(visits).toHaveLength(0);
    expect(events).toEqual(['close-browser']);
    expect(report.findings[0]).toMatchObject({ code: 'render-not-compiled' });
    expect(report.findings[0]?.message).toContain('invalid-value');
  });

  it('lets baselined findings pass and counts fixed ones', async () => {
    const pages = {
      '/': {
        locked: (mode: 'light' | 'dark') => ({
          mapping: { errors: [{ code: 'unmapped', path: 'main>button', message: 'x' }] },
          runs: [cleanRun(mode)],
        }),
      },
    };
    const first = await renderPrototypes([target({ declared: [] })], fakeDeps(pages).deps);
    expect(first.counts.fresh).toBe(4);
    const baseline = parseBaseline(baselineDocument(first.findings));
    const second = await renderPrototypes([target({ declared: [] })], fakeDeps(pages).deps, {
      baseline,
    });
    expect(second).toMatchObject({ ok: true, counts: { fresh: 0, baselined: 4, fixed: 0 } });
  });

  it('fails clearly, before building anything, when the browser is missing', async () => {
    const { deps, events } = fakeDeps({}, { unavailable: true });
    const error = await renderPrototypes([target()], deps).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CliError);
    expect((error as CliError).code).toBe('failure');
    expect((error as CliError).message).toContain('needs a browser');
    expect((error as CliError).hint).toContain('pnpm test:e2e:install');
    expect(events).toEqual([]);
  });

  it('does not launch a browser when there is nothing to render', async () => {
    const { deps } = fakeDeps({}, { unavailable: true });
    await expect(renderPrototypes([], deps)).resolves.toMatchObject({ ok: true, prototypes: [] });
  });

  it('reuses a build only while its inputs hash matches, never a future, tracked or planted one (F7)', () => {
    const ws = createWorkspace();
    try {
      ws.write('prototypes/a/src/App.svelte', 'x');
      ws.write('design-systems/acme/document.json', { id: 'acme' });
      ws.write('artifacts/a/dist/index.html', '<!doctype html>');
      const artifacts = join(ws.root, 'artifacts/a');
      const inputs = { root: ws.root, dir: join(ws.root, 'prototypes/a') };
      const now = Date.now();
      const untracked = { now, tracked: () => false };
      const manifestAt = (builtAt: string, extra = {}) =>
        ws.write('artifacts/a/build-manifest.json', { builtAt, base: './', ...extra });
      const hash = () => buildInputsHash(ws.root, inputs.dir) as string;
      const past = new Date(now - 60_000).toISOString();

      manifestAt(past, { inputsHash: hash() });
      expect(freshBuild(artifacts, inputs, untracked)).toMatchObject({ base: './' });
      // A planted manifest: no inputs hash, a made-up one, or a builtAt in the future.
      manifestAt(new Date(now + 3_600_000).toISOString());
      expect(freshBuild(artifacts, inputs, untracked)).toBeNull();
      manifestAt(past, { inputsHash: 'f'.repeat(64) });
      expect(freshBuild(artifacts, inputs, untracked)).toBeNull();
      manifestAt('2999-01-01T00:00:00.000Z', { inputsHash: hash() });
      expect(freshBuild(artifacts, inputs, untracked)).toBeNull();
      // A build committed to the repository is never reused.
      manifestAt(past, { inputsHash: hash() });
      expect(freshBuild(artifacts, inputs, { now, tracked: () => true })).toBeNull();
      manifestAt(past, { inputsHash: hash(), target: 'artifact' });
      expect(freshBuild(artifacts, inputs, untracked)).toBeNull();
      // Any change to the prototype or a design system makes it stale, whatever the clock says.
      manifestAt(past, { inputsHash: hash() });
      ws.write('prototypes/a/src/App.svelte', 'y');
      expect(freshBuild(artifacts, inputs, untracked)).toBeNull();
      manifestAt(past, { inputsHash: hash() });
      ws.write('design-systems/acme/document.json', { id: 'acme', name: 'Acme' });
      expect(freshBuild(artifacts, inputs, untracked)).toBeNull();
    } finally {
      ws.cleanup();
    }
  });
});

describe('protoyard check ds --render (command)', () => {
  let ws: TempWorkspace | undefined;
  afterEach(() => {
    ws?.cleanup();
    ws = undefined;
  });

  const run = async (...args: string[]) => {
    const result = await cli([
      '--root',
      (ws as TempWorkspace).root,
      '--json',
      'check',
      'ds',
      ...args,
    ]);
    return {
      code: result.code,
      body: result.json<{
        ok: boolean;
        data: Record<string, unknown>;
        error?: { code: string; message: string };
      }>(),
    };
  };

  it('refuses render flags without --render, and unsafe or missing baselines', async () => {
    ws = createWorkspace();
    addPrototype(ws, 'acme-app', LOCKED);
    expect((await run('--route', '/x')).body.error?.message).toContain('needs --render');
    expect((await run('--baseline', 'b.json', '--rebuild')).body.error?.message).toContain(
      'need --render'
    );
    const missing = await run('acme-app', '--render', '--baseline', 'missing.json');
    expect(missing.code).toBe(3);
    const unsafe = await run('acme-app', '--render', '--write-baseline', '../outside.json');
    expect(unsafe.code).toBe(2);
    expect(unsafe.body.error?.code).toBe('unsafe_path');
    ws.write('bad-baseline.json', { findings: 'no' });
    expect((await run('acme-app', '--render', '--baseline', 'bad-baseline.json')).code).toBe(4);
    expect((await run('--render', '--route', '/x')).body.error?.message).toContain('slugs');
  });

  it('renders nothing (and needs no browser) when no prototype is locked', async () => {
    ws = createWorkspace();
    addPrototype(ws, 'loose-app');
    const { code, body } = await run('--render');
    expect(code).toBe(0);
    expect(body.data.render).toMatchObject({ ok: true, prototypes: [], counts: { visits: 0 } });
  });

  /** Runs the handler with injected render dependencies. */
  const handle = async (deps: DsRenderDeps, args: string[], options: Record<string, unknown>) => {
    let stdout = '';
    const out = makeOutput({ json: true } as never, {
      stdout: (s) => (stdout += s),
      stderr: () => undefined,
    });
    const ctx = createContext((ws as TempWorkspace).root, out, true);
    const handler = createCheckDsCommand(() => deps);
    try {
      const result = await handler(ctx, args, options);
      return { ok: true as const, data: result.data as { render: RenderData }, stdout };
    } catch (error) {
      return { ok: false as const, error: error as CliError };
    }
  };

  it('fails a locked prototype on render findings, passes in report mode, and honors a baseline', async () => {
    ws = createWorkspace();
    addPrototype(ws, 'acme-app', LOCKED);
    ws.write(
      'prototypes/acme-app/src/App.svelte',
      `<script>createRouter([{ path: '/', component: A }]);</script>\n<Button>Save</Button>\n`
    );
    addPrototype(ws, 'loose-app', {
      designSystem: { id: 'acme', version: '1.0.0', locked: false },
    });
    const pages = {
      '/': {
        locked: (mode: 'light' | 'dark') => ({
          mapping: {
            errors: [
              {
                code: 'unmapped',
                path: 'main>button',
                message: 'Interactive element is not inside a catalog component root.',
              },
            ],
          },
          runs: [cleanRun(mode)],
        }),
      },
    };
    const failed = await handle(fakeDeps(pages).deps, ['acme-app'], { render: true });
    expect(failed.ok).toBe(false);
    if (failed.ok) return;
    expect(failed.error.code).toBe('validation');
    expect(failed.error.message).toContain('4 render finding(s)');
    expect(failed.error.hint).toContain(
      'unmapped #/ [desktop light] main>button (prototypes/acme-app/src/App.svelte)'
    );

    const reported = await handle(fakeDeps(pages).deps, ['acme-app', 'loose-app'], {
      render: true,
      report: true,
      writeBaseline: 'design-systems/ds-render-baseline.json',
    });
    expect(reported.ok).toBe(true);
    if (!reported.ok) return;
    const render = reported.data.render;
    // A named unlocked prototype bound to a design system is rendered in report mode, and never blocks.
    expect(
      render.prototypes.map((p: { slug: string; locked: boolean }) => [p.slug, p.locked])
    ).toEqual([
      ['acme-app', true],
      ['loose-app', false],
    ]);
    expect(render.blocking).toBe(4);
    expect(render.wroteBaseline).toBe('design-systems/ds-render-baseline.json');
    const saved = JSON.parse(
      readFileSync(join(ws.root, 'design-systems/ds-render-baseline.json'), 'utf8')
    );
    expect(saved.findings).toHaveLength(8);

    const baselined = await handle(fakeDeps(pages).deps, ['acme-app'], {
      render: true,
      baseline: 'design-systems/ds-render-baseline.json',
    });
    expect(baselined.ok).toBe(true);
    if (!baselined.ok) return;
    expect(baselined.data.render).toMatchObject({
      ok: true,
      blocking: 0,
      counts: { baselined: 4, fresh: 0 },
    });
  });
});

/** One real Chromium run against a tiny built locked prototype (a static page, no Vite build). */
const browser = await launchChromium();
if (browser.ok) await browser.browser.close();
const skipReason = browser.ok
  ? ''
  : `${browser.reason}: ${browser.detail} (run pnpm test:e2e:install)`;

describe.skipIf(!browser.ok)(
  `check ds --render in Chromium${skipReason ? ` (skipped: ${skipReason})` : ''}`,
  () => {
    let ws: TempWorkspace | undefined;
    afterEach(() => {
      ws?.cleanup();
      ws = undefined;
    });

    /** Renders the fixture page (with `head` markup added) and checks every finding the page must produce. */
    async function expectFindings(head: string): Promise<void> {
      ws = createWorkspace();
      expect((await cli(['--root', ws.root, 'ds', 'new', 'acme', '--brand', '#0f766e'])).code).toBe(
        0
      );
      addPrototype(ws, 'acme-app', LOCKED);
      // Narrow the button's variants: the page renders a disabled one.
      const documentFile = join(ws.root, 'design-systems/acme/document.json');
      const document = JSON.parse(readFileSync(documentFile, 'utf8'));
      document.allow.button = { ...document.allow.button, variants: ['default'] };
      writeFileSync(documentFile, JSON.stringify(document));
      const dist = join(ws.root, 'artifacts/acme-app/dist');
      mkdirSync(dist, { recursive: true });
      writeFileSync(
        join(dist, 'index.html'),
        `<!doctype html>
<html lang="en" data-py-ready="true"><head><meta charset="utf-8"><title>Acme</title>${head}
<style>
  body { margin: 0; font-family: sans-serif; background: var(--tx-background); color: var(--tx-foreground); }
  .tx-button { background: var(--tx-primary); color: var(--tx-primary-foreground); border: 0; padding: 8px 16px; min-height: 44px; }
  .hot { background: #b00020; color: #ffffff; border: 0; padding: 8px 16px; min-height: 44px; }
  .legend { color: var(--tx-foreground); }
</style></head>
<body><div id="app"><main>
  <h1>Notes</h1>
  <button class="tx-button" data-tx-component="button" type="button">Save</button>
  <button class="hot" data-tx-component="button" data-tx-variant="destructive" type="button">Delete</button>
  <button type="button" class="tx-button">Raw</button>
  <div data-tx-component="charts-line" role="img" aria-label="Signups">
    <svg width="200" height="100"><path d="M0 50 L200 10" stroke="#123456" fill="none" stroke-width="3"></path></svg>
    <span class="legend">Signups</span>
  </div>
  <svg width="120" height="80" role="img" aria-label="Local chart"><rect width="60" height="70" fill="#123456"></rect></svg>
</main></div></body></html>
`
      );
      ws.write('artifacts/acme-app/build-manifest.json', {
        builtAt: new Date().toISOString(),
        base: './',
        inputsHash: buildInputsHash(ws.root, join(ws.root, 'prototypes/acme-app')),
      });

      let stdout = '';
      const out = makeOutput({ json: true } as never, {
        stdout: (s) => (stdout += s),
        stderr: () => undefined,
      });
      const ctx = createContext(ws.root, out, true);
      const handler = createCheckDsCommand((c) => realDsRenderDeps(c));
      const result = await handler(ctx, ['acme-app'], {
        render: true,
        report: true,
        route: ['/'],
      }).catch((e: unknown) => e);
      expect(result).not.toBeInstanceOf(Error);
      const render = (result as { data: { render: RenderData } }).data.render;
      expect(render.prototypes[0]).toMatchObject({ slug: 'acme-app', build: 'reused', visits: 4 });
      const codes = (code: string) => render.findings.filter((f) => f.code === code);
      // The raw button (no catalog root): every mode and viewport.
      expect(codes('unmapped')).toHaveLength(4);
      expect(codes('unmapped')[0]?.selector).toContain('button');
      // The literal red of a catalog button is reported; the chart's painted stroke is exempt.
      const literals = codes('render-literal');
      expect(literals.some((f) => f.component === 'button')).toBe(true);
      expect(literals.some((f) => f.component === 'charts-line')).toBe(false);
      // The hand-drawn svg outside every catalog root.
      expect(codes('render-unowned-visualization')).toHaveLength(4);
      // The variant the narrowed allow entry does not enable.
      expect(codes('render-disabled-value')).toHaveLength(4);
      expect(codes('render-disabled-value')[0]?.component).toBe('button');
      expect(codes('render-page-error')).toHaveLength(0);
    }

    it('finds raw controls, literal colors and unowned charts, and exempts catalog chart marks', async () => {
      await expectFindings('');
    }, 120_000);

    it('closes WebSockets to another origin and blocks service workers in the capture page (F8)', async () => {
      const upgrades: string[] = [];
      const other = createServer((_req, res) => res.end('other'));
      other.on('upgrade', (req, socket) => {
        upgrades.push(String(req.url));
        socket.destroy();
      });
      await new Promise<void>((done) => other.listen(0, '127.0.0.1', done));
      const otherPort = (other.address() as AddressInfo).port;
      const page = `<!doctype html><html data-py-ready="true"><head><title>Socket</title></head><body>
<script>
  window.socketState = 'pending';
  const socket = new WebSocket('ws://127.0.0.1:${otherPort}/exfiltrate');
  socket.onopen = () => { window.socketState = 'open'; };
  socket.onerror = socket.onclose = () => { if (window.socketState === 'pending') window.socketState = 'closed'; };
</script></body></html>`;
      const served = createServer((req, res) => {
        if (req.url === '/sw.js') {
          res.setHeader('content-type', 'text/javascript');
          res.end('self.addEventListener("fetch", () => {});');
          return;
        }
        res.setHeader('content-type', 'text/html');
        res.end(page);
      });
      await new Promise<void>((done) => served.listen(0, '127.0.0.1', done));
      const origin = `http://127.0.0.1:${(served.address() as AddressInfo).port}`;
      const launched = await launchChromium();
      if (!launched.ok) throw new Error(launched.detail);
      try {
        const result = await withReadyPage(
          launched.browser,
          `${origin}/`,
          { viewport: { width: 400, height: 300 }, colorScheme: 'light', allowOrigin: origin },
          async (p) => {
            await p.waitForFunction(
              () => (window as unknown as { socketState: string }).socketState !== 'pending'
            );
            // Playwright's block turns register() into a no-op: nothing is ever registered.
            const worker = await p.evaluate(async () => {
              if (!navigator.serviceWorker) return 'blocked';
              await navigator.serviceWorker.register('/sw.js').catch(() => undefined);
              await new Promise((done) => setTimeout(done, 200));
              const registrations = await navigator.serviceWorker.getRegistrations();
              return registrations.length === 0 ? 'blocked' : 'registered';
            });
            return {
              socket: await p.evaluate(
                () => (window as unknown as { socketState: string }).socketState
              ),
              worker,
            };
          }
        );
        expect(result).toEqual({ socket: 'closed', worker: 'blocked' });
        expect(upgrades).toEqual([]);
        expect(captureMaySocket(`ws://127.0.0.1:${otherPort}/`, origin)).toBe(false);
        expect(captureMaySocket(`${origin.replace('http', 'ws')}/live`, origin)).toBe(true);
      } finally {
        await launched.browser.close();
        await new Promise((done) => served.close(done));
        await new Promise((done) => other.close(done));
      }
    }, 60_000);

    it("still finds them when the prototype's own code stubs the checker and patches DOM prototypes (F2)", async () => {
      // Runs before the check, in the page's main world: non-writable stand-ins
      // for both hosts that report a clean page, and patched DOM functions that
      // hide variants, inline styles and raw buttons.
      await expectFindings(TAMPER);
    }, 120_000);
  }
);

/** The prototype code of the F2 test (fictional; it only lies to the checker). */
const TAMPER = `<script>
(() => {
  const fakeHost = {
    ready: async () => ['button'],
    apply: async () => {},
    map: () => ({ ok: true, codes: [], errors: [] }),
    inspect: async ({ pairs }) => ({
      components: ['button'],
      pairs: pairs.map((pair) => ({ ...pair, ratio: 21, pass: true })),
      literals: [],
      checked: 1,
    }),
  };
  const info = { scope: '#app', roots: 1, links: [], unownedVisualizations: [], axes: [] };
  Object.defineProperty(globalThis, 'texuliDsCheck', { value: fakeHost, writable: false, configurable: false });
  Object.defineProperty(globalThis, '__protoyardDsRender', { value: { install: () => info }, writable: false, configurable: false });
  const getAttribute = Element.prototype.getAttribute;
  Element.prototype.getAttribute = function (name) {
    return name === 'data-tx-variant' || name === 'style' ? null : getAttribute.call(this, name);
  };
  const querySelectorAll = Element.prototype.querySelectorAll;
  Element.prototype.querySelectorAll = function (selector) {
    return String(selector).includes('button') || String(selector).includes('svg')
      ? querySelectorAll.call(this, 'protoyard-nothing')
      : querySelectorAll.call(this, selector);
  };
  window.getComputedStyle = () => ({ getPropertyValue: () => '' });
})();
</script>`;
