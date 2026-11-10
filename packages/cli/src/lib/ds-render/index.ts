/**
 * `protoyard check ds --render` (PLAN_013 T-render): the runtime half of the
 * locked design system check. The static scan (`../ds-check`) reads source;
 * this pass opens a built prototype in Chromium, visits every route in light
 * and dark on a phone and a desktop viewport, and runs Texuli's
 * `runLockedRenderChecks` (`@texuli/tools/ds-check`) on the live page:
 *
 * - mapping (`unmapped`, `not-allowed`): every interactive element sits
 *   inside a catalog root (`data-tx-component`, rendered since Texuli 0.16.0)
 *   that the design system allows;
 * - painted colors (`render-literal`): every color a catalog component paints
 *   follows the design system's `--tx-*` variables;
 * - contrast (`render-contrast`) and axe (`render-axe`) inside the app root;
 * - `render-empty`: a route that painted no catalog component.
 *
 * Protoyard adds `render-unowned-visualization` (a `canvas`, or an `svg` of
 * 48 px or more, outside every catalog root) and `render-page-error` (a route
 * that did not boot, so it could not be checked). Chart, map and canvas
 * marks are exempt from the per-pixel check (Texuli's
 * `DS_LOCKED_RENDER_EXEMPT_IDS`); their chrome, text and controls are not.
 *
 * This module is pure (route planning, the allow set, findings, baselines);
 * `./run.ts` orchestrates and `./browser.ts` drives Playwright.
 */
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { partParentMap } from '@texuli/catalog/manifest';
import type { DesignSystemAllow } from '@texuli/spec/design-system';
import { DS_AXES, type DsCatalog, enabledValues, type LibraryEntryLike } from '../ds-catalog.ts';

export type DsRenderMode = 'light' | 'dark';

export interface DsRenderViewport {
  id: 'desktop' | 'phone';
  width: number;
  height: number;
  mobile: boolean;
}

export const DS_RENDER_MODES: readonly DsRenderMode[] = ['light', 'dark'];

export const DS_RENDER_VIEWPORTS: readonly DsRenderViewport[] = [
  { id: 'desktop', width: 1280, height: 800, mobile: false },
  { id: 'phone', width: 390, height: 844, mobile: true },
];

/** The most routes one prototype is checked on (declared and discovered together). */
export const DS_RENDER_MAX_ROUTES = 24;

/** An `svg` this large (CSS px, either side) outside a catalog root is a visualization. */
export const DS_RENDER_MIN_VISUALIZATION_PX = 48;

/** The catalog ids whose painted marks are exempt from the per-pixel check (Texuli's list). */
export const DS_RENDER_EXEMPT_IDS: readonly string[] = ['canvas', 'data-map', 'charts-*'];

export const DS_RENDER_CODES = [
  'not-allowed',
  'unmapped',
  'render-literal',
  'render-contrast',
  'render-axe',
  'render-empty',
  'render-unowned-visualization',
  'render-disabled-value',
  'render-page-error',
  'render-not-compiled',
] as const;
export type DsRenderCode = (typeof DS_RENDER_CODES)[number];

/** One route the prototype declares (`path:` in a `createRouter`/`defineRoutes` file). */
export interface DeclaredRoute {
  pattern: string;
  /** Workspace-relative POSIX path of the file that declares it. */
  file: string;
}

/** One route to visit: a concrete hash path. */
export interface PlannedRoute {
  path: string;
  /** The declared pattern it comes from, when one matches. */
  pattern: string | null;
  /** The declaring file, when known. */
  file: string | null;
  source: 'declared' | 'link' | 'option';
}

export interface SkippedRoute {
  pattern: string;
  file: string | null;
  reason: string;
}

export interface DsRenderVisit {
  route: PlannedRoute;
  mode: DsRenderMode;
  viewport: DsRenderViewport;
}

export interface DsRenderFinding {
  slug: string;
  route: string;
  mode: DsRenderMode;
  viewport: DsRenderViewport['id'];
  code: DsRenderCode | string;
  /** The element: a selector (mapping, visualizations) or a short description (literals). */
  selector: string;
  /** The catalog id involved, when there is one. */
  component: string | null;
  /** The file that declares the route (the screen to look at), when known. */
  file: string | null;
  message: string;
  wayOut: string;
  /** Stable key for baselines: slug, route, viewport, mode, code and element. */
  fingerprint: string;
  /** Set when a baseline lists this finding: it does not fail the run. */
  baselined?: boolean;
}

const SOURCE_FILE = /\.(?:svelte|ts)$/;
const ROUTER_CALL = /\b(?:createRouter|defineRoutes)\s*\(/;
const PATH_LITERAL = /\bpath\s*:\s*(['"`])(\/[^'"`\s]*)\1/g;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'tests', '.vite', 'public']);

function* sourceFiles(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir).sort();
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name) || name.startsWith('.')) continue;
    const file = join(dir, name);
    const stat = lstatSync(file);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) yield* sourceFiles(file);
    else if (SOURCE_FILE.test(name)) yield file;
  }
}

/**
 * The route patterns a prototype declares: every `path: '/…'` literal of a
 * source file under `src/` that calls `createRouter(` or `defineRoutes(`
 * (`src/routes.ts`, an `App.svelte`). Generated prototypes that route
 * through `@protoyard/crud/app` declare none here; their routes come from
 * the links on the page. Read-only.
 */
export function discoverDeclaredRoutes(root: string, dir: string): DeclaredRoute[] {
  const out: DeclaredRoute[] = [];
  const seen = new Set<string>();
  const src = join(dir, 'src');
  if (!existsSync(src)) return out;
  for (const file of sourceFiles(src)) {
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    if (!ROUTER_CALL.test(text)) continue;
    for (const match of text.matchAll(PATH_LITERAL)) {
      const pattern = match[2] as string;
      if (seen.has(pattern)) continue;
      seen.add(pattern);
      out.push({ pattern, file: relative(root, file).split(sep).join('/') });
    }
  }
  return out;
}

/** Whether a route pattern has parameters (`:id`, `:id?`) or a wildcard (`*`). */
export function isParameterized(pattern: string): boolean {
  return /(?:^|\/)(?::|\*)/.test(pattern);
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A matcher for the hash router's patterns: `:name`, optional `:name?` and a `*` tail. */
export function routeMatcher(pattern: string): (path: string) => boolean {
  const segments = pattern.split('/').filter(Boolean);
  let source = '^';
  for (const segment of segments) {
    if (segment === '*') {
      source += '(?:/.*)?';
      break;
    }
    if (segment.startsWith(':')) {
      source += segment.endsWith('?') ? '(?:/[^/]+)?' : '/[^/]+';
    } else {
      source += `/${escapeRegex(segment)}`;
    }
  }
  const regex = new RegExp(`${source || '^'}/?$`);
  return (path: string) => regex.test(path.split('?')[0] ?? path);
}

/** The shape of a concrete path: segments with digits become `:id` (`/deals/deal_0001` → `/deals/:id`). */
export function pathShape(path: string): string {
  const segments = (path.split('?')[0] ?? '').split('/').filter(Boolean);
  return `/${segments.map((s) => (/\d/.test(s) ? ':id' : s)).join('/')}`;
}

function normalizePath(path: string): string {
  const clean = (path.split('?')[0] ?? '').trim();
  if (!clean.startsWith('/')) return `/${clean}`;
  return clean.length > 1 ? clean.replace(/\/+$/, '') : clean;
}

/**
 * Plan the routes to visit from the declared patterns and the hash links the
 * visited pages expose. A static pattern is visited as is; a parameterized
 * one through the first link it matches (else it is skipped, with the
 * reason). A link no pattern matches is visited once per shape, so a list of
 * fifty records adds one detail page. At most `limit` routes, in order:
 * declared static routes, then resolved parameterized ones, then links.
 */
export function planRoutes(
  declared: readonly DeclaredRoute[],
  links: readonly string[],
  limit = DS_RENDER_MAX_ROUTES
): { routes: PlannedRoute[]; skipped: SkippedRoute[] } {
  const routes: PlannedRoute[] = [];
  const skipped: SkippedRoute[] = [];
  const visited = new Set<string>();
  const add = (route: PlannedRoute) => {
    if (visited.has(route.path)) return;
    visited.add(route.path);
    routes.push(route);
  };
  const concrete = [...new Set(links.map(normalizePath))];
  const matchers = declared.map((d) => ({ ...d, match: routeMatcher(d.pattern) }));
  if (!declared.some((d) => d.pattern === '/'))
    add({ path: '/', pattern: null, file: null, source: 'declared' });
  for (const d of declared) {
    if (!isParameterized(d.pattern)) {
      add({ path: normalizePath(d.pattern), pattern: d.pattern, file: d.file, source: 'declared' });
      continue;
    }
    const link = concrete.find((path) => routeMatcher(d.pattern)(path));
    if (link) add({ path: link, pattern: d.pattern, file: d.file, source: 'link' });
    else if (/(?:^|\/)\*$/.test(d.pattern) || /:\w+\?$/.test(d.pattern)) {
      // An optional tail or a catch-all also matches its static prefix.
      const prefix = normalizePath(d.pattern.replace(/\/(?::\w+\?|\*)$/, '') || '/');
      add({ path: prefix, pattern: d.pattern, file: d.file, source: 'declared' });
    } else
      skipped.push({
        pattern: d.pattern,
        file: d.file,
        reason: 'no link on the checked pages leads to it; pass --route with a concrete path',
      });
  }
  const shapes = new Set(routes.map((r) => pathShape(r.path)));
  for (const path of concrete) {
    if (matchers.some((m) => m.match(path))) continue;
    const shape = pathShape(path);
    if (shapes.has(shape)) continue;
    shapes.add(shape);
    add({ path, pattern: null, file: null, source: 'link' });
  }
  if (routes.length > limit) {
    for (const route of routes.slice(limit)) {
      skipped.push({
        pattern: route.pattern ?? route.path,
        file: route.file,
        reason: `over the ${limit}-route limit of one run; pass --route to check it`,
      });
    }
    routes.length = limit;
  }
  return { routes, skipped };
}

/** Routes from `--route`: hash paths (`/settings`, `#/settings`), each validated. */
export function parseRouteOption(values: readonly string[]): PlannedRoute[] {
  return values.map((raw) => {
    const value = raw.trim().replace(/^#/, '');
    if (!value.startsWith('/') || /[\s\0]/.test(value) || value.length > 200) {
      throw new TypeError(`--route must be a hash path like /settings (got "${raw}").`);
    }
    return { path: normalizePath(value), pattern: null, file: null, source: 'option' as const };
  });
}

/** Every visit of a route list: route × viewport × mode, in a stable order. */
export function planVisits(
  routes: readonly PlannedRoute[],
  modes: readonly DsRenderMode[] = DS_RENDER_MODES,
  viewports: readonly DsRenderViewport[] = DS_RENDER_VIEWPORTS
): DsRenderVisit[] {
  const visits: DsRenderVisit[] = [];
  for (const route of routes)
    for (const viewport of viewports)
      for (const mode of modes) visits.push({ route, mode, viewport });
  return visits;
}

/** The allow manifest the page is mapped against (Texuli's `DsMapAllowManifest`). */
export interface RenderAllowManifest {
  allow: Record<string, true>;
  /** Child → parent catalog ids: catalog parts and what allowed extensions compose. */
  composed: Record<string, string>;
}

/**
 * The allow manifest the page is mapped against: the design system's allow
 * keys, the ids a design-system library component composes (a library
 * component has no catalog root of its own, so its parts are allowed in
 * their own right), and a `composed` child → parent map that Texuli's
 * mapping resolves against the allow set (`resolveAllowedComponentId`):
 *
 * - catalog parts: Texuli's `partParentMap` over the catalog ids
 *   (`select-trigger` → `select`, `list-item` → `list`, `field-error` →
 *   `field`, …);
 * - the ids an allowed Protoyard extension (`protoyard:data-table`) composes,
 *   mapped to the extension.
 *
 * A nested catalog root is never covered by an allowed root around it unless
 * it is a declared part or composed id of it (Texuli 0.17.1): a `data-grid`
 * inside an allowed `card` is `not-allowed`.
 */
export function renderAllowManifest(
  catalog: DsCatalog,
  allow: DesignSystemAllow,
  library: readonly LibraryEntryLike[] = [],
  partParents: (ids: readonly string[]) => Readonly<Record<string, string>> = partParentMap
): RenderAllowManifest {
  const ids = new Set<string>(Object.keys(allow));
  for (const entry of library) for (const id of entry.composes) ids.add(id);
  const composed: Record<string, string> = {
    ...partParents(catalog.components.map((component) => component.id)),
  };
  for (const extension of [...catalog.extensions].sort((x, y) => x.id.localeCompare(y.id))) {
    if (!ids.has(extension.id)) continue;
    for (const id of extension.composes ?? []) if (!ids.has(id)) composed[id] = extension.id;
  }
  return {
    allow: Object.fromEntries([...ids].sort().map((id) => [id, true as const])),
    composed: Object.fromEntries(
      Object.keys(composed)
        .sort()
        .map((id) => [id, composed[id] as string])
    ),
  };
}

const WAY_OUT: Record<string, string> = {
  unmapped:
    'Build this control from an allowed design-system component (a @protoyard/ui or Texuli component, or a library component of the design system) instead of raw markup.',
  'not-allowed':
    'Use a component the design system allows, or ask its reviewer to allow this one (`protoyard ds component request`, then a reviewed change of design-systems/<id>/document.json).',
  'render-literal':
    'Paint it through the component props and the design-system tokens; remove the literal color (local CSS, inline style or a hard-coded value).',
  'render-contrast':
    'The design system paints this pair below its contrast target; fix the colors in the design-system document and approve it again.',
  'render-axe': 'Fix the accessibility finding on this element (name, role, label or contrast).',
  'render-empty':
    'This route painted no design-system component: build the screen from allowed components.',
  'render-disabled-value':
    'Use a value the design system enables for this component (its allow entry), or ask its reviewer to enable this one.',
  'render-unowned-visualization':
    'Draw charts, maps and canvases with the catalog components (@protoyard/charts-ui, the map and canvas views), which follow the data-viz palette.',
  'render-page-error':
    'The route did not load in the built prototype; run `protoyard preview <slug>` and fix the error, then check again.',
  'render-not-compiled':
    'The design-system document did not compile; run `protoyard ds validate <id>` and fix it.',
};

/** The way out of a finding code. */
export function wayOutFor(code: string, designSystemId?: string): string {
  const text = WAY_OUT[code] ?? 'Fix the finding, then run the render check again.';
  return designSystemId ? text.replace('<id>', designSystemId) : text;
}

export function fingerprintOf(
  f: Pick<DsRenderFinding, 'slug' | 'route' | 'viewport' | 'mode' | 'code' | 'selector'> & {
    component?: string | null;
  }
): string {
  return [f.slug, f.route, f.viewport, f.mode, f.code, f.component ?? '', f.selector].join('|');
}

/** The parts of a Texuli `LockedRenderReport` this module reads (kept structural for tests). */
export interface LockedReportLike {
  mapping: { errors: readonly { code: string; path: string; message: string; source?: string }[] };
  runs: readonly {
    variant: string | null;
    mode: DsRenderMode;
    components: readonly string[];
    axe: readonly string[];
    pairs: readonly {
      foreground: string;
      background: string;
      ratio: number;
      required: number;
      pass: boolean;
    }[];
    literals: readonly { component: string; element: string; property: string; value: string }[];
  }[];
}

/** The axis values one catalog root rendered (`data-tx-variant`, …). */
export interface RenderedAxes {
  component: string;
  selector: string;
  variant?: string;
  size?: string;
  tone?: string;
  density?: string;
}

/** What the injected host reports about the page (see `./host-script.ts`). */
export interface DsRenderPageInfo {
  scope: string;
  roots: number;
  links: string[];
  unownedVisualizations: { selector: string; tag: string }[];
  /** Absent from hosts that do not report axes. */
  axes?: RenderedAxes[];
  /** Each distinct catalog id the page renders, with its first root's selector. */
  components?: { component: string; selector: string }[];
}

/**
 * The findings of one visit: Texuli's mapping and run findings (variant
 * runs carry their variant in the message), plus the unowned
 * visualizations the host listed. Exempt chart, map and canvas marks never
 * reach here: `runLockedRenderChecks` already dropped them.
 */
export function visitFindings(
  slug: string,
  visit: DsRenderVisit,
  info: DsRenderPageInfo,
  locked: LockedReportLike,
  designSystemId?: string,
  allow?: DesignSystemAllow | null
): DsRenderFinding[] {
  const base = {
    slug,
    route: visit.route.path,
    mode: visit.mode,
    viewport: visit.viewport.id,
    file: visit.route.file,
  };
  const out: DsRenderFinding[] = [];
  const push = (
    f: Omit<DsRenderFinding, 'slug' | 'route' | 'mode' | 'viewport' | 'file' | 'fingerprint'>
  ) => {
    const finding = { ...base, ...f };
    out.push({ ...finding, fingerprint: fingerprintOf(finding) });
  };
  for (const issue of locked.mapping.errors) {
    push({
      code: issue.code,
      selector: issue.path,
      component: issue.source ?? null,
      message: issue.message,
      wayOut: wayOutFor(issue.code, designSystemId),
    });
  }
  for (const run of locked.runs) {
    if (run.mode !== visit.mode) continue;
    const label = run.variant ? ` (variant ${run.variant})` : '';
    if (run.components.length === 0)
      push({
        code: 'render-empty',
        selector: info.scope,
        component: null,
        message: `The page painted no catalog component${label}.`,
        wayOut: wayOutFor('render-empty'),
      });
    for (const literal of run.literals)
      push({
        code: 'render-literal',
        selector: literal.element,
        component: literal.component || null,
        message: `${literal.component || 'component'}: ${literal.element} paints ${literal.property} ${literal.value}, which does not follow the design system's variables${label}.`,
        wayOut: wayOutFor('render-literal'),
      });
    for (const pair of run.pairs) {
      if (pair.pass) continue;
      push({
        code: 'render-contrast',
        selector: `${pair.foreground} on ${pair.background}`,
        component: null,
        message: `${pair.foreground} on ${pair.background} paints ${pair.ratio}:1; ${pair.required}:1 is required${label}.`,
        wayOut: wayOutFor('render-contrast'),
      });
    }
    for (const line of run.axe)
      push({
        code: 'render-axe',
        selector: line.split(': ').slice(1).join(': ') || line,
        component: null,
        message: `axe: ${line}${label}`,
        wayOut: wayOutFor('render-axe'),
      });
  }
  if (allow) {
    // An axis value the allow entry does not enable: the static rule skips
    // expressions (`variant={kind}`); the page shows what they evaluated to.
    // Texuli's mapping has a rule of the same id (0.17.1: its own 64-issue
    // cap) but reads differently, so the manifest passes ids only and this
    // rule stays: Texuli reports every element (this reports each value
    // once, which keeps baselines small and stable), checks a part against
    // its parent's entry (this checks the component's own entry, like the
    // static rule), treats a non-list axis as "nothing enabled" (here: not
    // narrowed, like `enabledValues`) and adds a `color` axis the static
    // rule does not have.
    const seen = new Set<string>();
    for (const rendered of info.axes ?? []) {
      const entry = allow[rendered.component];
      if (!entry) continue;
      for (const axis of DS_AXES) {
        const value = rendered[axis];
        if (value === undefined) continue;
        const enabled = enabledValues(entry, axis);
        if (!enabled || enabled.includes(value)) continue;
        const key = `${rendered.component}|${axis}|${value}`;
        if (seen.has(key)) continue;
        seen.add(key);
        push({
          code: 'render-disabled-value',
          selector: rendered.selector,
          component: rendered.component,
          message: `${rendered.component} renders ${axis} "${value}", which the design system does not enable (enabled: ${enabled.join(', ') || 'none'}).`,
          wayOut: wayOutFor('render-disabled-value'),
        });
      }
    }
  }
  for (const v of info.unownedVisualizations)
    push({
      code: 'render-unowned-visualization',
      selector: v.selector,
      component: null,
      message: `A <${v.tag}> outside every design-system component: charts, maps and canvases must be catalog components fed by the data-viz palette.`,
      wayOut: wayOutFor('render-unowned-visualization'),
    });
  return out;
}

/** A visit that could not run (the route did not boot): an error, never a pass. */
export function pageErrorFinding(
  slug: string,
  visit: DsRenderVisit,
  error: unknown
): DsRenderFinding {
  const text = (error instanceof Error ? error.message : String(error)).split('\n')[0] ?? '';
  const finding = {
    slug,
    route: visit.route.path,
    mode: visit.mode,
    viewport: visit.viewport.id,
    file: visit.route.file,
    code: 'render-page-error',
    selector: 'page',
    component: null,
    message: `The route could not be checked: ${text.slice(0, 300)}`,
    wayOut: wayOutFor('render-page-error'),
  };
  return { ...finding, fingerprint: fingerprintOf(finding) };
}

// ── baselines ──────────────────────────────────────────────────────────

export const DS_RENDER_BASELINE_FORMAT = 'protoyard/ds-render-baseline';
export const DS_RENDER_BASELINE_VERSION = 1;

export interface DsRenderBaseline {
  format: typeof DS_RENDER_BASELINE_FORMAT;
  version: typeof DS_RENDER_BASELINE_VERSION;
  findings: { fingerprint: string; code: string; slug: string; route: string; message: string }[];
}

/** A baseline file holds at most this many findings. */
export const DS_RENDER_BASELINE_MAX = 5000;

/** The baseline document of a run's findings (what `--write-baseline` saves), sorted. */
export function baselineDocument(findings: readonly DsRenderFinding[]): DsRenderBaseline {
  const unique = new Map<string, DsRenderBaseline['findings'][number]>();
  for (const f of findings)
    unique.set(f.fingerprint, {
      fingerprint: f.fingerprint,
      code: f.code,
      slug: f.slug,
      route: f.route,
      message: f.message,
    });
  return {
    format: DS_RENDER_BASELINE_FORMAT,
    version: DS_RENDER_BASELINE_VERSION,
    findings: [...unique.values()].sort((a, b) => a.fingerprint.localeCompare(b.fingerprint)),
  };
}

function findingsOf(value: unknown): unknown[] | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.findings)) return record.findings;
  for (const key of ['data', 'render']) {
    const nested = findingsOf(record[key]);
    if (nested) return nested;
  }
  return null;
}

/**
 * The fingerprints of a baseline: a `--write-baseline` file, or a saved
 * `check ds --render --json` output (its `data.render.findings`). Throws a
 * `TypeError` naming what is wrong.
 */
export function parseBaseline(value: unknown): Set<string> {
  const findings = findingsOf(value);
  if (!findings) throw new TypeError('The baseline has no findings list.');
  if (findings.length > DS_RENDER_BASELINE_MAX)
    throw new RangeError(`A baseline holds at most ${DS_RENDER_BASELINE_MAX} findings.`);
  const out = new Set<string>();
  findings.forEach((entry, index) => {
    const fingerprint = (entry as { fingerprint?: unknown } | null)?.fingerprint;
    if (typeof fingerprint !== 'string' || fingerprint.length === 0 || fingerprint.length > 2000)
      throw new TypeError(`Baseline finding ${index} has no fingerprint string.`);
    out.add(fingerprint);
  });
  return out;
}

/**
 * Mark the findings a baseline lists (`baselined: true`) and count what is
 * new and what the baseline lists that no longer occurs (fixed).
 */
export function applyBaseline(
  findings: readonly DsRenderFinding[],
  baseline: ReadonlySet<string> | null
): { findings: DsRenderFinding[]; fresh: number; baselined: number; fixed: number } {
  if (!baseline) return { findings: [...findings], fresh: findings.length, baselined: 0, fixed: 0 };
  const seen = new Set<string>();
  const out = findings.map((f) => {
    seen.add(f.fingerprint);
    return baseline.has(f.fingerprint) ? { ...f, baselined: true } : f;
  });
  const baselined = out.filter((f) => f.baselined).length;
  return {
    findings: out,
    fresh: out.length - baselined,
    baselined,
    fixed: [...baseline].filter((fp) => !seen.has(fp)).length,
  };
}

/** One finding as a line: code, route, viewport and mode, selector, message. */
export function formatRenderFinding(f: DsRenderFinding): string {
  return `${f.code} #${f.route} [${f.viewport} ${f.mode}] ${f.selector}${f.file ? ` (${f.file})` : ''}: ${f.message}`;
}
