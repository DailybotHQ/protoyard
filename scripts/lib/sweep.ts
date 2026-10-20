/*
 * The pure half of the visual QA sweep (scripts/visual-sweep.ts): arguments,
 * the shot matrix, the densest scenario, layout-fit flags and the contact
 * sheet. No browser and no file system, so all of it is unit-tested
 * (tests/scripts/visual-sweep.test.ts).
 */

export const SHELL_VALUES = [
  'auto',
  'none',
  'phone',
  'tablet',
  'desktop-window',
  'browser',
  'widget-host',
  'extension-popup',
  'side-panel',
] as const;
export type SweepShell = (typeof SHELL_VALUES)[number];
export type Platform = 'mobile' | 'desktop' | 'responsive';
export type Mode = 'light' | 'dark';
export type ViewportName = 'desktop' | 'phone';

export const MODES: readonly Mode[] = ['light', 'dark'];

export const VIEWPORTS: Readonly<
  Record<ViewportName, { width: number; height: number; mobile: boolean }>
> = {
  desktop: { width: 1440, height: 900, mobile: false },
  phone: { width: 390, height: 844, mobile: true },
};

export interface SweepArgs {
  only: string[];
  /** Explicit shells for the desktop viewport (replaces the platform's list). */
  shells: SweepShell[] | null;
  /**
   * Theme ids, `all` (every library theme) or library collection names. `all`
   * or a collection switches to the theme review (see `buildMatrix`).
   */
  themes: string[];
  /** Hash route every shot opens (`/settings` → `#/settings`); the app's home otherwise. */
  route: string | null;
  skipBuild: boolean;
  templates: boolean;
  axe: boolean;
  concurrency: number;
  compare: string | null;
  out: string;
}

export const DEFAULT_OUT = 'tmp/visual-sweep';

const USAGE =
  'Usage: tsx scripts/visual-sweep.ts [--only a,b] [--shells a,b] [--themes all|<collection>|a,b] [--route /path] [--templates] [--skip-build] [--no-axe] [--concurrency N] [--compare <dir>] [--out <dir>]';

const list = (value: string | undefined, flag: string): string[] => {
  if (value === undefined || value.startsWith('--'))
    throw new Error(`${flag} needs a value. ${USAGE}`);
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

/** Parses the command line; throws with the usage for anything unknown. */
export function parseSweepArgs(argv: readonly string[]): SweepArgs {
  const args: SweepArgs = {
    only: [],
    shells: null,
    themes: [],
    route: null,
    skipBuild: false,
    templates: false,
    axe: true,
    concurrency: 2,
    compare: null,
    out: DEFAULT_OUT,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i] as string;
    const next = argv[i + 1];
    switch (flag) {
      case '--only':
        args.only = list(next, flag);
        i += 1;
        break;
      case '--shells': {
        const shells = list(next, flag);
        const unknown = shells.filter(
          (shell) => !(SHELL_VALUES as readonly string[]).includes(shell)
        );
        if (unknown.length) {
          throw new Error(
            `Unknown shell(s): ${unknown.join(', ')}. Known: ${SHELL_VALUES.join(', ')}`
          );
        }
        args.shells = shells as SweepShell[];
        i += 1;
        break;
      }
      case '--themes':
        args.themes = list(next, flag);
        i += 1;
        break;
      case '--route': {
        const [route = ''] = list(next, flag);
        const path = route.replace(/^#/, '');
        if (!/^\/[A-Za-z0-9._~\-/]*$/.test(path)) {
          throw new Error(`--route must be a hash path like /settings (got ${route})`);
        }
        args.route = path;
        i += 1;
        break;
      }
      case '--concurrency': {
        const value = Number(next);
        if (!Number.isInteger(value) || value < 1 || value > 16) {
          throw new Error('--concurrency must be an integer from 1 to 16');
        }
        args.concurrency = value;
        i += 1;
        break;
      }
      case '--compare':
        args.compare = list(next, flag).join(',');
        i += 1;
        break;
      case '--out':
        args.out = list(next, flag).join(',');
        i += 1;
        break;
      case '--skip-build':
        args.skipBuild = true;
        break;
      case '--templates':
        args.templates = true;
        break;
      case '--no-axe':
        args.axe = false;
        break;
      default:
        throw new Error(`Unknown argument "${flag}". ${USAGE}`);
    }
  }
  return args;
}

/** The library metadata the theme selection needs (`THEME_LIBRARY_META` entries). */
export interface LibraryThemeRef {
  id: string;
  collection: string;
}

export interface ThemeSelection {
  /** Theme ids to capture, library order first, explicit ids after, no repeats. */
  ids: string[];
  /** True when `all` or a collection was asked for: the theme review matrix. */
  review: boolean;
}

/**
 * Expands `--themes`: `all` is every library theme, a collection name its
 * themes, anything else an explicit id kept as given (built-in presets and
 * a prototype's own themes are valid too; an unknown id falls back visibly
 * in the shot). Throws for a collection with no themes.
 */
export function resolveThemes(
  selection: readonly string[],
  library: readonly LibraryThemeRef[],
  collections: readonly string[]
): ThemeSelection {
  const ids: string[] = [];
  const add = (id: string) => {
    if (!ids.includes(id)) ids.push(id);
  };
  let review = false;
  for (const entry of selection) {
    if (entry === 'all' || collections.includes(entry)) {
      review = true;
      const picked = library.filter((theme) => entry === 'all' || theme.collection === entry);
      if (!picked.length) throw new Error(`--themes ${entry}: the library has no such themes`);
      for (const theme of picked) add(theme.id);
    } else {
      add(entry);
    }
  }
  return { ids, review };
}

export interface SweepTarget {
  kind: 'prototype' | 'template' | 'player';
  slug: string;
  platform: Platform;
  defaultScenario?: string;
  scenarios: readonly string[];
  /** `preview.shell` from the manifest. */
  previewShell?: SweepShell;
  /** `preview.layout` from the manifest. */
  layout?: { id?: string; supported?: readonly string[] };
}

/** The bounded, deterministic player sample used by the opt-in visual target. */
export const PLAYER_TARGET: SweepTarget = {
  kind: 'player',
  slug: 'player',
  platform: 'responsive',
  scenarios: [],
  previewShell: 'none',
};
export const PLAYER_BLUEPRINT_SOURCE = './blueprints/quick/assistant.json';

/** Keep player screenshots opt-in so the existing default sweep stays unchanged. */
export function selectPlayerTarget(
  targets: readonly SweepTarget[],
  selected: boolean
): SweepTarget[] {
  return selected ? [...targets, PLAYER_TARGET] : [...targets];
}

/**
 * The densest scenario by name: the first pattern that matches, in order, so
 * `massive` beats `long-history`; the manifest default otherwise. These are
 * the scenarios tests/e2e/layout-fit.spec.ts chose by hand.
 */
const DENSE_PATTERNS = [/massive/, /scale/, /long-/, /multi-/, /power/, /busy/, /mature/];

export function densestScenario(
  scenarios: readonly string[],
  fallback?: string
): string | undefined {
  for (const pattern of DENSE_PATTERNS) {
    const match = scenarios.find((id) => pattern.test(id));
    if (match) return match;
  }
  return fallback ?? scenarios[0];
}

/** Shells that fit a platform (the DevTools primary list, plus `tablet` for mobile apps). */
const PLATFORM_SHELLS: Readonly<Record<Platform, readonly SweepShell[]>> = {
  mobile: ['auto', 'phone', 'tablet', 'none'],
  desktop: ['auto', 'none', 'desktop-window', 'browser'],
  responsive: ['auto', 'none', 'phone', 'desktop-window', 'browser'],
};

/** `auto` → `phone` for mobile prototypes, `none` otherwise (core's resolveShell). */
export function resolveShell(shell: SweepShell, platform: Platform): SweepShell {
  if (shell !== 'auto') return shell;
  return platform === 'mobile' ? 'phone' : 'none';
}

/**
 * Desktop shells to capture: the manifest's own shell first, then the
 * platform's, keeping one per resolved shell (`auto` that resolves to `none`
 * is the same picture as `none`). An explicit list replaces the platform's.
 */
export function shellsFor(
  target: SweepTarget,
  explicit: readonly SweepShell[] | null
): SweepShell[] {
  const candidates = explicit ?? [
    target.previewShell ?? 'auto',
    ...PLATFORM_SHELLS[target.platform],
  ];
  const seen = new Set<SweepShell>();
  const out: SweepShell[] = [];
  for (const shell of candidates) {
    const resolved = resolveShell(shell, target.platform);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    out.push(shell);
  }
  return out;
}

/** The manifest layout first, then its `supported` list; `custom` when the prototype has none. */
export function layoutsFor(target: SweepTarget): string[] {
  const layout = target.layout;
  if (!layout) return ['custom'];
  return [...new Set([layout.id ?? 'custom', ...(layout.supported ?? [])])];
}

export interface Shot {
  key: string;
  kind: SweepTarget['kind'];
  slug: string;
  viewport: ViewportName;
  shell: SweepShell;
  layout: string;
  mode: Mode;
  theme?: string;
  scenario?: string;
  /** Hash route the shot opens (`/settings`). */
  route?: string;
  /** Path of the PNG inside the output folder. */
  file: string;
}

const slugPart = (value: string) => value.replace(/[^a-z0-9-]+/gi, '-').toLowerCase();

function makeShot(base: Omit<Shot, 'key' | 'file'>): Shot {
  const parts = [
    base.viewport,
    base.shell,
    base.layout,
    base.mode,
    ...(base.theme ? [base.theme] : []),
  ];
  const name = parts.map(slugPart).join('-');
  return {
    ...base,
    key: `${base.kind}/${base.slug}/${name}`,
    file: `shots/${base.kind}-${slugPart(base.slug)}/${name}.png`,
  };
}

/**
 * Every shot for the targets. The desktop viewport covers shells × layouts ×
 * modes (× themes). At 390 px every shell is full-bleed (docs/SHELLS.md), so
 * the phone viewport captures only the manifest's own shell.
 *
 * With `review` (the theme review, `--themes all|<collection>`), each target
 * gets one representative screen instead: desktop, the first `--shells`
 * entry or the manifest's shell, the manifest's layout, its densest scenario,
 * in every theme × light and dark (2 × themes shots per target).
 */
export function buildMatrix(
  targets: readonly SweepTarget[],
  args: Pick<SweepArgs, 'shells' | 'themes'> & { route?: string | null; review?: boolean }
): Shot[] {
  const themes: (string | undefined)[] = args.themes.length ? args.themes : [undefined];
  const route = args.route ? { route: args.route } : {};
  const shots: Shot[] = [];
  for (const target of targets) {
    const scenario = densestScenario(target.scenarios, target.defaultScenario);
    const layouts = layoutsFor(target);
    if (args.review) {
      const shell = args.shells?.[0] ?? target.previewShell ?? 'auto';
      for (const theme of themes) {
        for (const mode of MODES) {
          shots.push(
            makeShot({
              kind: target.kind,
              slug: target.slug,
              viewport: 'desktop',
              shell,
              layout: layouts[0] as string,
              mode,
              ...(theme ? { theme } : {}),
              ...(scenario ? { scenario } : {}),
              ...route,
            })
          );
        }
      }
      continue;
    }
    const viewports: [ViewportName, SweepShell[]][] =
      target.kind === 'player'
        ? [
            ['desktop', [target.previewShell ?? 'none']],
            ['phone', [target.previewShell ?? 'none']],
          ]
        : [
            ['desktop', shellsFor(target, args.shells)],
            ['phone', [target.previewShell ?? 'auto']],
          ];
    for (const [viewport, shells] of viewports) {
      for (const shell of shells) {
        for (const layout of layouts) {
          for (const mode of MODES) {
            for (const theme of themes) {
              shots.push(
                makeShot({
                  kind: target.kind,
                  slug: target.slug,
                  viewport,
                  shell,
                  layout,
                  mode,
                  ...(theme ? { theme } : {}),
                  ...(scenario ? { scenario } : {}),
                  ...route,
                })
              );
            }
          }
        }
      }
    }
  }
  return shots;
}

/** The link that opens a shot: DevTools off, its scenario, shell, layout, mode and theme. */
export function shotQuery(shot: Shot): URLSearchParams {
  const query = new URLSearchParams({ devtools: '0' });
  if (shot.kind === 'player') query.set('src', PLAYER_BLUEPRINT_SOURCE);
  if (shot.scenario) query.set('scenario', shot.scenario);
  query.set('shell', shot.shell);
  if (shot.layout !== 'custom') query.set('layout', shot.layout);
  query.set('mode', shot.mode);
  if (shot.theme) query.set('theme', shot.theme);
  return query;
}

/** The full link to a shot under the app's base path: query, then the hash route. */
export function shotUrl(base: string, shot: Shot): string {
  return `${base}?${shotQuery(shot)}${shot.route ? `#${shot.route}` : ''}`;
}

/** What tests/e2e/layout-fit.spec.ts measures, gathered in the page. */
export interface FitMetrics {
  docOverflow: number;
  documentScrolls: boolean;
  innerWidth: number;
  innerHeight: number;
  inputs: { label: string; top: number; bottom: number; left: number; right: number }[];
  region: { label: string; overflow: number; scrolls: boolean } | null;
}

/**
 * Layout problems a reviewer should look at, using the layout-fit rules that
 * hold for every app: a primary input off screen that the document cannot
 * scroll to, a main region that overflows without scrolling, and a page that
 * overflows but cannot scroll.
 */
export function fitFlags(metrics: FitMetrics): string[] {
  const flags: string[] = [];
  const pageScrolls = metrics.docOverflow > 1 && metrics.documentScrolls;
  const offscreen = metrics.inputs.filter(
    (input) =>
      input.top < -1 ||
      input.bottom > metrics.innerHeight + 1 ||
      input.left < -1 ||
      input.right > metrics.innerWidth + 1
  );
  if (offscreen.length && !pageScrolls) flags.push('input-off-screen');
  if (metrics.region && !metrics.region.scrolls) flags.push('region-does-not-scroll');
  if (metrics.docOverflow > 1 && !metrics.documentScrolls) flags.push('page-overflow-stuck');
  return flags;
}

/** Runs in the page (as a string: tsx helpers do not exist there). Returns FitMetrics. */
export const MEASURE_FIT = `(() => {
  const outsideApp = (el) => Boolean(el.closest('.py-devtools'));
  const visible = (el) => {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const label = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
    (el.getAttribute('aria-label') ? '[aria-label="' + el.getAttribute('aria-label') + '"]' : '');
  const scrolling = document.scrollingElement || document.documentElement;
  const inputs = [...document.querySelectorAll('[data-py-composer], textarea')]
    .filter((el) => !outsideApp(el) && visible(el))
    .map((el) => { const r = el.getBoundingClientRect(); return { label: label(el), top: r.top, bottom: r.bottom, left: r.left, right: r.right }; });
  let best = null;
  for (const el of document.querySelectorAll('body *')) {
    if (outsideApp(el) || el.clientHeight < 120) continue;
    const overflow = el.scrollHeight - el.clientHeight;
    if (overflow < 8) continue;
    const overflowY = getComputedStyle(el).overflowY;
    if (overflowY !== 'auto' && overflowY !== 'scroll') continue;
    const area = el.clientWidth * el.clientHeight;
    if (!best || area > best.area) best = { el, area, overflow };
  }
  let region = null;
  if (best) {
    const before = best.el.scrollTop;
    best.el.scrollBy(0, 200);
    if (best.el.scrollTop === before) best.el.scrollBy(0, -200);
    const scrolls = best.el.scrollTop !== before;
    best.el.scrollTop = before;
    region = { label: label(best.el), overflow: best.overflow, scrolls };
  }
  const docOverflow = scrolling.scrollHeight - window.innerHeight;
  let documentScrolls = false;
  if (docOverflow > 1) {
    const before = scrolling.scrollTop;
    window.scrollBy(0, 200);
    documentScrolls = scrolling.scrollTop !== before;
    scrolling.scrollTop = before;
  }
  return { docOverflow, documentScrolls, innerWidth: window.innerWidth, innerHeight: window.innerHeight, inputs, region };
})()`;

export interface ShotResult extends Shot {
  ok: boolean;
  error?: string;
  /** Number of axe rules violated (WCAG 2.1 A/AA); `null` when axe was skipped. */
  axeViolations: number | null;
  flags: string[];
  bytes?: number;
  ms?: number;
  /** Against `--compare`: changed pixels, `'new'` (no earlier shot), `'resized'`, or absent. */
  changed?: number | 'new' | 'resized';
}

export interface SweepSummary {
  shots: number;
  failed: number;
  flagged: number;
  changed: number;
}

export function summarize(results: readonly ShotResult[]): SweepSummary {
  return {
    shots: results.length,
    failed: results.filter((result) => !result.ok).length,
    flagged: results.filter((result) => result.flags.length > 0 || (result.axeViolations ?? 0) > 0)
      .length,
    changed: results.filter((result) => result.changed !== undefined && result.changed !== 0)
      .length,
  };
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const FILTERS = ['slug', 'viewport', 'shell', 'layout', 'mode', 'theme'] as const;

function card(result: ShotResult): string {
  const problems = !result.ok || result.flags.length > 0 || (result.axeViolations ?? 0) > 0;
  const changed = result.changed !== undefined && result.changed !== 0;
  const data = FILTERS.map(
    (field) => `data-${field}="${escapeHtml(String(result[field] ?? ''))}"`
  ).join(' ');
  const badges: string[] = [];
  if (!result.ok) badges.push('<span class="badge bad">failed</span>');
  if (result.axeViolations !== null) {
    badges.push(
      `<span class="badge ${result.axeViolations ? 'bad' : 'good'}">axe ${result.axeViolations}</span>`
    );
  }
  for (const flag of result.flags)
    badges.push(`<span class="badge warn">${escapeHtml(flag)}</span>`);
  if (result.changed === 'new') badges.push('<span class="badge info">new</span>');
  else if (result.changed === 'resized') badges.push('<span class="badge info">resized</span>');
  else if (typeof result.changed === 'number' && result.changed > 0) {
    badges.push(`<span class="badge info">${result.changed} px changed</span>`);
  }
  const title = `${result.slug} · ${result.viewport} · ${result.shell} · ${result.layout} · ${result.mode}${result.theme ? ` · ${result.theme}` : ''}`;
  const image = result.ok
    ? `<a href="${escapeHtml(result.file)}"><img src="${escapeHtml(result.file)}" alt="${escapeHtml(title)}" loading="lazy" width="${result.viewport === 'phone' ? 195 : 360}"></a>`
    : `<p class="error">${escapeHtml(result.error ?? 'failed')}</p>`;
  return `<figure class="card" ${data} data-problem="${problems}" data-changed="${changed}">
${image}
<figcaption><strong>${escapeHtml(title)}</strong>${result.scenario ? `<span>scenario ${escapeHtml(result.scenario)}</span>` : ''}<span class="badges">${badges.join(' ')}</span></figcaption>
</figure>`;
}

function options(results: readonly ShotResult[], field: (typeof FILTERS)[number]): string {
  const values = [...new Set(results.map((result) => String(result[field] ?? '')))]
    .filter(Boolean)
    .sort();
  return values
    .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
    .join('');
}

/**
 * The contact sheet: one static page, no external assets, light and dark,
 * with filters for every dimension plus "problems only" and "changed only".
 */
export function renderContactSheet(
  results: readonly ShotResult[],
  meta: {
    title?: string;
    generatedAt: string;
    command: string;
    durationMs: number;
    compare?: string | null;
  }
): string {
  const summary = summarize(results);
  const filters = FILTERS.filter(
    (field) => field !== 'theme' || results.some((result) => result.theme)
  )
    .map(
      (field) =>
        `<label>${field}<select data-filter="${field}"><option value="">all</option>${options(results, field)}</select></label>`
    )
    .join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(meta.title ?? 'Visual sweep')}</title>
<style>
:root{--bg:#fafafa;--fg:#18181b;--muted:#52525b;--card:#ffffff;--border:#e4e4e7;--bad:#b91c1c;--warn:#92400e;--good:#15803d;--info:#1d4ed8;color-scheme:light dark}
@media (prefers-color-scheme: dark){:root{--bg:#09090b;--fg:#fafafa;--muted:#a1a1aa;--card:#18181b;--border:#3f3f46;--bad:#f87171;--warn:#fbbf24;--good:#4ade80;--info:#93c5fd}}
*{box-sizing:border-box}body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif}
header{display:grid;gap:8px;margin-bottom:16px}h1{margin:0;font-size:20px}.meta{color:var(--muted);font-size:12px;word-break:break-all}
.filters{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:end}.filters label{display:grid;gap:2px;font-size:12px;color:var(--muted)}
select{font:inherit;color:var(--fg);background:var(--card);border:1px solid var(--border);border-radius:6px;padding:4px 6px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,376px),1fr));gap:12px}
.card{margin:0;padding:8px;background:var(--card);border:1px solid var(--border);border-radius:8px;display:grid;gap:6px;align-content:start}
.card img{display:block;max-width:100%;height:auto;border:1px solid var(--border);border-radius:4px}
figcaption{display:grid;gap:2px;font-size:12px}figcaption span{color:var(--muted)}
.badge{display:inline-block;border:1px solid currentColor;border-radius:999px;padding:0 6px;margin:2px 2px 0 0;font-size:11px}
.bad{color:var(--bad)}.warn{color:var(--warn)}.good{color:var(--good)}.info{color:var(--info)}
.error{color:var(--bad);margin:0;word-break:break-word}[hidden]{display:none!important}
</style>
</head>
<body>
<header>
<h1>${escapeHtml(meta.title ?? 'Visual sweep')}</h1>
<p class="meta">${summary.shots} shots · ${summary.failed} failed · ${summary.flagged} with problems${meta.compare ? ` · ${summary.changed} changed vs ${escapeHtml(meta.compare)}` : ''} · ${(meta.durationMs / 1000).toFixed(1)} s · ${escapeHtml(meta.generatedAt)}<br><code>${escapeHtml(meta.command)}</code></p>
<div class="filters">
${filters}
<label><span><input type="checkbox" data-only="problem"> problems only</span></label>
${meta.compare ? '<label><span><input type="checkbox" data-only="changed"> changed only</span></label>' : ''}
<output id="count" aria-live="polite"></output>
</div>
</header>
<main class="grid">
${results.map(card).join('\n')}
</main>
<script>
(() => {
  const cards = [...document.querySelectorAll('.card')];
  const selects = [...document.querySelectorAll('[data-filter]')];
  const checks = [...document.querySelectorAll('[data-only]')];
  const count = document.getElementById('count');
  const apply = () => {
    let shown = 0;
    for (const card of cards) {
      const visible = selects.every((s) => !s.value || card.dataset[s.dataset.filter] === s.value) &&
        checks.every((c) => !c.checked || card.dataset[c.dataset.only] === 'true');
      card.hidden = !visible;
      if (visible) shown++;
    }
    count.textContent = shown + ' of ' + cards.length + ' shown';
  };
  for (const control of [...selects, ...checks]) control.addEventListener('change', apply);
  apply();
})();
</script>
</body>
</html>
`;
}
