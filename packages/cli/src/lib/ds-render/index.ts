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
import type { DsCatalog, LibraryEntryLike } from '../ds-catalog.ts';

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
/** An allow value: the document's entry, or `true` for an id allowed only through a library component. */
export type RenderAllowValue = DesignSystemAllow[string] | true;

export interface RenderAllowManifest {
  allow: Record<string, RenderAllowValue>;
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
 * - catalog parts: Texuli's `partParentMap` over the catalog ids, the
 *   declared `CATALOG_PART_PARENTS` relations (`select-trigger` → `select`,
 *   `list-item` → `list`, `field-error` → `field`, …). Since Texuli 0.17.2 a
 *   shared hyphen prefix is not a relation: `alert-dialog`, `icon-button` and
 *   `form-field` are their own ids;
 * - the ids an allowed Protoyard extension (`protoyard:data-table`) composes,
 *   mapped to the extension.
 *
 * A nested catalog root is never covered by an allowed root around it unless
 * it is a declared part or composed id of it (Texuli 0.17.1): a `data-grid`
 * inside an allowed `card` is `not-allowed`.
 *
 * The allow values are the document's entries, so Texuli's mapping also
 * checks the axis values a root renders (`render-disabled-value`, 0.17.3: a
 * root against its own entry, once per root). An id that only a library
 * component composes has no entry and is `true`, so every value is enabled.
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
    allow: Object.fromEntries(
      [...ids].sort().map((id): [string, RenderAllowValue] => [id, allow[id] ?? true])
    ),
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

/** What the injected host reports about the page (see `./host-script.ts`). */
export interface DsRenderPageInfo {
  scope: string;
  roots: number;
  links: string[];
  unownedVisualizations: { selector: string; tag: string }[];
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
  designSystemId?: string
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
  // Texuli reports a disabled axis value on every root that renders it (up
  // to 64); one finding per component and message keeps baselines small and
  // stable.
  const disabled = new Set<string>();
  for (const issue of locked.mapping.errors) {
    if (issue.code === 'render-disabled-value') {
      const key = `${issue.source ?? ''}|${issue.message}`;
      if (disabled.has(key)) continue;
      disabled.add(key);
    }
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
//
// Since 1.9.4 a baseline is Texuli's finding-key shape (`DsFindingKey`,
// `@texuli/tools/ds-check` 0.17.4), compared with Texuli's `compareDsReport`:
// `{ findings: [{ code, path, route, viewport, mode, scope, component }] }`,
// with the prototype slug as `scope` and the selector as `path`. The
// `protoyard/ds-render-baseline` version 1 files of 1.8–1.9.3 are still
// read, once, and converted (`--write-baseline` writes the new shape).

/** The format tag of the version 1 baselines that 1.8–1.9.3 wrote (read only). */
export const DS_RENDER_BASELINE_V1_FORMAT = 'protoyard/ds-render-baseline';

/** One baseline entry: Texuli's `DsFindingKey` plus the message, for people reading the file. */
export interface DsRenderBaselineEntry {
  code: string;
  path: string;
  route: string;
  /** `<width>x<height>`, Texuli's viewport key. */
  viewport: string;
  mode: string;
  /** The prototype slug. */
  scope: string;
  component?: string;
  message?: string;
}

export interface DsRenderBaseline {
  findings: DsRenderBaselineEntry[];
}

/** What a baseline file held: its keys, and whether it was a version 1 file. */
export interface ParsedBaseline {
  findings: DsRenderBaselineEntry[];
  legacy: boolean;
}

/** Texuli's `compareDsReport`, injected so this module stays free of `@texuli/tools`. */
export type CompareDsReport = (
  baseline: unknown,
  report: unknown
) => { added: readonly object[]; removed: readonly unknown[] };

/** A baseline file holds at most this many findings. */
export const DS_RENDER_BASELINE_MAX = 5000;

/** The longest key field Texuli reads (`MAX_FIELD` in its baseline module). */
const KEY_FIELD_MAX = 512;
const KEY_FIELDS = ['route', 'viewport', 'mode', 'scope', 'component'] as const;

function viewportKey(id: string): string {
  const v = DS_RENDER_VIEWPORTS.find((viewport) => viewport.id === id);
  return v ? `${v.width}x${v.height}` : id;
}

/** A finding's baseline key (Texuli's `DsFindingKey`). */
export function baselineEntry(
  f: Pick<DsRenderFinding, 'slug' | 'route' | 'viewport' | 'mode' | 'code' | 'selector'> & {
    component?: string | null;
    message?: string;
  }
): DsRenderBaselineEntry {
  return {
    code: f.code,
    path: f.selector,
    route: f.route,
    viewport: viewportKey(f.viewport),
    mode: f.mode,
    scope: f.slug,
    ...(f.component ? { component: f.component } : {}),
    ...(f.message !== undefined ? { message: f.message } : {}),
  };
}

/** The same key line Texuli builds (code, path, then the fields a key has). */
function keyLine(key: Record<string, unknown>): string {
  const text = (value: unknown) => (typeof value === 'string' ? value.slice(0, KEY_FIELD_MAX) : '');
  let line = `${text(key.code)}\t${text(key.path)}`;
  for (const field of KEY_FIELDS) {
    const value = text(key[field]);
    if (value) line += `\t${field}=${value}`;
  }
  return line;
}

/** The baseline document of a run's findings (what `--write-baseline` saves), sorted. */
export function baselineDocument(findings: readonly DsRenderFinding[]): DsRenderBaseline {
  const unique = new Map<string, DsRenderBaselineEntry>();
  for (const f of findings) {
    const entry = baselineEntry(f);
    unique.set(keyLine(entry as unknown as Record<string, unknown>), entry);
  }
  return {
    findings: [...unique.entries()]
      .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
      .map(([, entry]) => entry),
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

const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 2000;

/** A version 1 fingerprint, `slug|route|viewport|mode|code|component|selector`. */
function fromFingerprint(fingerprint: string): DsRenderBaselineEntry | null {
  const parts = fingerprint.split('|');
  if (parts.length < 7) return null;
  const [slug, route, viewport, mode, code, component] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  return baselineEntry({
    slug,
    route,
    viewport: viewport as DsRenderViewport['id'],
    mode: mode as DsRenderMode,
    code,
    component: component || null,
    selector: parts.slice(6).join('|'),
  });
}

/**
 * Read a baseline: a `--write-baseline` file (Texuli's key shape), a
 * version 1 file of 1.8–1.9.3 (its fingerprints are converted), or a saved
 * `check ds --render --json` output (its `data.render.findings`). Throws a
 * `TypeError` naming what is wrong.
 */
export function parseBaseline(value: unknown): ParsedBaseline {
  const findings = findingsOf(value);
  if (!findings) throw new TypeError('The baseline has no findings list.');
  if (findings.length > DS_RENDER_BASELINE_MAX)
    throw new RangeError(`A baseline holds at most ${DS_RENDER_BASELINE_MAX} findings.`);
  const v1 =
    !!value &&
    typeof value === 'object' &&
    (value as Record<string, unknown>).format === DS_RENDER_BASELINE_V1_FORMAT;
  let legacy = v1;
  const out = findings.map((item, index): DsRenderBaselineEntry => {
    const entry = (item ?? {}) as Record<string, unknown>;
    if (!v1 && isText(entry.code) && typeof entry.path === 'string' && isText(entry.scope)) {
      const key: DsRenderBaselineEntry = {
        code: entry.code,
        path: entry.path.slice(0, 2000),
        route: typeof entry.route === 'string' ? entry.route.slice(0, 2000) : '',
        viewport: typeof entry.viewport === 'string' ? entry.viewport.slice(0, 64) : '',
        mode: typeof entry.mode === 'string' ? entry.mode.slice(0, 16) : '',
        scope: entry.scope,
        ...(isText(entry.component) ? { component: entry.component } : {}),
      };
      return key;
    }
    // A saved --json output: the findings carry their fields.
    if (
      !v1 &&
      isText(entry.code) &&
      isText(entry.slug) &&
      typeof entry.selector === 'string' &&
      typeof entry.route === 'string'
    ) {
      return baselineEntry({
        slug: entry.slug,
        route: entry.route,
        viewport: String(entry.viewport ?? '') as DsRenderViewport['id'],
        mode: String(entry.mode ?? '') as DsRenderMode,
        code: entry.code,
        component: isText(entry.component) ? entry.component : null,
        selector: entry.selector.slice(0, 2000),
      });
    }
    if (isText(entry.fingerprint)) {
      const converted = fromFingerprint(entry.fingerprint);
      if (converted) {
        legacy = true;
        return converted;
      }
    }
    throw new TypeError(
      `Baseline finding ${index} has no finding key (code, path, scope) or version 1 fingerprint.`
    );
  });
  return { findings: out, legacy };
}

/**
 * Mark the findings a baseline lists (`baselined: true`) and count what is
 * new and what the baseline lists that no longer occurs (fixed), through
 * Texuli's `compareDsReport`: a key field the baseline does not name matches
 * any value.
 */
export function applyBaseline(
  findings: readonly DsRenderFinding[],
  baseline: ParsedBaseline | null,
  compare?: CompareDsReport
): { findings: DsRenderFinding[]; fresh: number; baselined: number; fixed: number } {
  if (!baseline || !compare)
    return { findings: [...findings], fresh: findings.length, baselined: 0, fixed: 0 };
  const keys = findings.map((f) => baselineEntry(f));
  const result = compare({ findings: baseline.findings }, { findings: keys });
  const added = new Set(result.added.map((key) => keyLine(key as Record<string, unknown>)));
  const out = findings.map((f, index) =>
    added.has(keyLine(keys[index] as unknown as Record<string, unknown>))
      ? f
      : { ...f, baselined: true }
  );
  const baselined = out.filter((f) => f.baselined).length;
  return { findings: out, fresh: out.length - baselined, baselined, fixed: result.removed.length };
}

/** One finding as a line: code, route, viewport and mode, selector, message. */
export function formatRenderFinding(f: DsRenderFinding): string {
  return `${f.code} #${f.route} [${f.viewport} ${f.mode}] ${f.selector}${f.file ? ` (${f.file})` : ''}: ${f.message}`;
}
