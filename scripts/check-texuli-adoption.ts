/**
 * `pnpm exec tsx scripts/check-texuli-adoption.ts` — keep Protoyard on Texuli.
 *
 * Scans the Svelte, TypeScript, CSS and Astro sources of `packages/`, `apps/`,
 * `templates/` and `prototypes/` (tests, dist and node_modules excluded) for:
 *
 * - `legacy-import`: an import of `clsx`, `tailwind-merge` or
 *   `tailwind-variants` (class names go through `cx` from `texuli/cx`);
 * - `raw-lucide`: a component imported from `@lucide/svelte` rendered directly
 *   in markup. Lucide is only the glyph source: render it through `Icon` or
 *   `LucideIcon` from `texuli/icons` (Texuli's documented icon model);
 * - `py-token`: a `var(--py-…)` read (consumers read `--tx-*`);
 * - `raw-control`: a native `<button>`, `<input>`, `<select>`, `<textarea>` or
 *   `<dialog>` in a Svelte component, where Texuli ships the styled control;
 * - `input-as-choice`: a Texuli `<Input>` used as a checkbox or radio (choice
 *   controls use `Checkbox` or `RadioGroup` so checked state works correctly);
 * - `own-component`: a leaf Svelte component of a UI package (`packages/ui`,
 *   `packages/*-ui`, `devtools`, `crud`, `player`, `apps/gallery`) that imports
 *   nothing from `texuli`, `@texuli/*`, `@protoyard/*-ui`/`ui` or another
 *   `.svelte` file: it draws its own UI instead of composing Texuli's.
 *
 * Known violations live per unit in `tests/adoption/pending/<unit>.json`
 * (unit = `packages__<name>`, `apps__<name>`, `templates` or `prototypes`).
 * The default run is a ratchet: it fails only on violations the pending lists
 * do not cover. `--scope <path>` limits the run; `--strict` fails on every
 * violation in scope; `--allow-gaps` (with `--strict`) still accepts a pending
 * entry that cites an open gap in `tests/adoption/texuli-gaps.json`.
 * `tests/adoption/texuli-exceptions.json` is the closed list of files that stay
 * Protoyard's, each with a reason. `--prune` rewrites pending lists without
 * the violations that are gone (it never adds any); `--write-baseline`
 * records today's violations (lead only, once).
 *
 * Exit 0 when clean, 1 on any problem, 2 on usage errors.
 *
 *   pnpm exec tsx scripts/check-texuli-adoption.ts [--scope <path>]... [--strict] [--allow-gaps] [--prune] [--json]
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ROOTS = ['packages', 'apps', 'templates', 'prototypes'];
const EXTENSIONS = ['.svelte', '.ts', '.css', '.astro'];
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'tests',
  '.astro',
  '.svelte-kit',
  'coverage',
  'build',
]);

export type Rule =
  | 'legacy-import'
  | 'raw-lucide'
  | 'py-token'
  | 'raw-control'
  | 'input-as-choice'
  | 'own-component';
export const RULES: readonly Rule[] = [
  'legacy-import',
  'raw-lucide',
  'py-token',
  'raw-control',
  'input-as-choice',
  'own-component',
];

export interface Violation {
  file: string;
  rule: Rule;
  count: number;
}

export interface PendingEntry extends Violation {
  /** An open Texuli gap id (for example `G12`) that blocks this entry. */
  gap?: string;
}

export interface Exception {
  /** A repository-relative file, or a folder ending in `/`. */
  path: string;
  rules: Rule[];
  reason: string;
}

export interface Gap {
  id: string;
  status: 'open' | 'fixed' | 'wontfix';
  summary: string;
}

export interface AdoptionReport {
  ok: boolean;
  problems: string[];
  violations: Violation[];
  counts: { files: number; violations: number; pending: number; gapBlocked: number };
}

export interface AdoptionOptions {
  root?: string;
  scopes?: string[];
  strict?: boolean;
  allowGaps?: boolean;
}

const LEGACY_IMPORT =
  /(?:from\s+|import\s*\(\s*|import\s+)['"](clsx|tailwind-merge|tailwind-variants)(?:\/[^'"]*)?['"]/g;
const PY_TOKEN = /var\(\s*--py-/g;
const RAW_CONTROL = /<(button|input|select|textarea|dialog)(?=[\s/>])/g;
const INPUT_TAG = /<Input(?=[\s/>])[^>]*>/g;
const UI_UNIT = /^(packages\/(ui|[a-z-]+-ui|devtools|crud|player)|apps\/gallery)\//;
const COMPOSES =
  /from\s*['"](texuli(?:\/[^'"]*)?|@texuli\/[^'"]+|@protoyard\/(?:ui|[a-z-]+-ui)(?:\/[^'"]*)?|[^'"]+\.svelte)['"]/;
const LUCIDE_IMPORT = /import\s*\{([^}]*)\}\s*from\s*['"]@lucide\/svelte(?:\/[^'"]*)?['"]/g;
const LUCIDE_DEFAULT =
  /import\s+([A-Za-z_$][\w$]*)\s+from\s*['"]@lucide\/svelte\/icons\/[^'"]+['"]/g;

function count(text: string, pattern: RegExp): number {
  return [...text.matchAll(new RegExp(pattern.source, pattern.flags))].length;
}

/** Strips HTML and JS comments so commented-out code does not count. */
function stripComments(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

function markupOf(svelte: string): string {
  return svelte.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
}

/** Counts Texuli Input opening tags used where a dedicated choice control belongs. */
function inputAsChoiceCount(markup: string): number {
  return [...markup.matchAll(new RegExp(INPUT_TAG.source, INPUT_TAG.flags))].filter(
    ([tag]) => /\btype\s*=\s*(['"])(?:checkbox|radio)\1/i.test(tag) || /\bbind:checked\b/.test(tag)
  ).length;
}

function lucideNames(text: string): string[] {
  const names: string[] = [];
  for (const m of text.matchAll(LUCIDE_IMPORT)) {
    for (const part of (m[1] ?? '').split(',')) {
      const spec = part.trim().replace(/^type\s+/, '');
      if (!spec || part.trim().startsWith('type ')) continue;
      const local = spec
        .split(/\s+as\s+/)
        .pop()
        ?.trim();
      if (local) names.push(local);
    }
  }
  for (const m of text.matchAll(LUCIDE_DEFAULT)) if (m[1]) names.push(m[1]);
  return names;
}

/** Counts each rule in one source file. Pure; exported for tests. */
export function scanSource(file: string, source: string): Violation[] {
  const text = stripComments(source);
  const out: Violation[] = [];
  const add = (rule: Rule, n: number) => {
    if (n > 0) out.push({ file, rule, count: n });
  };
  add('legacy-import', count(text, LEGACY_IMPORT));
  add('py-token', count(text, PY_TOKEN));
  if (file.endsWith('.svelte')) {
    const markup = markupOf(text);
    add('raw-control', count(markup, RAW_CONTROL));
    add('input-as-choice', inputAsChoiceCount(markup));
    let raw = 0;
    for (const name of lucideNames(text)) {
      raw += count(markup, new RegExp(`<${name.replace(/\$/g, '\\$')}(?=[\\s/>])`, 'g'));
    }
    add('raw-lucide', raw);
    const script = (text.match(/<script[\s\S]*?<\/script>/g) ?? []).join('\n');
    if (UI_UNIT.test(file) && !COMPOSES.test(script) && markup.trim().length > 0)
      add('own-component', 1);
  }
  return out;
}

/** The pending unit a file belongs to: `packages__ui`, `apps__gallery`, `templates` or `prototypes`. */
export function unitOf(file: string): string {
  const [top, name] = file.split('/');
  if (top === 'templates' || top === 'prototypes') return top;
  return `${top}__${name}`;
}

function walk(dir: string, root: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, root, out);
    else if (EXTENSIONS.some((ext) => entry.endsWith(ext)) && !entry.endsWith('.d.ts')) {
      if (/\.(test|spec)\.ts$/.test(entry)) continue;
      out.push(relative(root, full).split('\\').join('/'));
    }
  }
}

function readJson<T>(path: string, fallback: T): T {
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : fallback;
}

function inScope(file: string, scopes: string[]): boolean {
  return (
    scopes.length === 0 ||
    scopes.some((s) => file === s || file.startsWith(`${s.replace(/\/$/, '')}/`))
  );
}

function excepted(v: Violation, exceptions: Exception[]): boolean {
  return exceptions.some(
    (e) =>
      e.rules.includes(v.rule) &&
      (e.path.endsWith('/') ? v.file.startsWith(e.path) : v.file === e.path)
  );
}

export function loadPending(root: string): Map<string, PendingEntry> {
  const dir = join(root, 'tests/adoption/pending');
  const map = new Map<string, PendingEntry>();
  if (!existsSync(dir)) return map;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const data = readJson<{ entries: PendingEntry[] }>(join(dir, f), { entries: [] });
    for (const e of data.entries) map.set(`${e.file}\u0000${e.rule}`, e);
  }
  return map;
}

export function scanRepository(
  root: string = REPO,
  scopes: string[] = []
): { files: string[]; violations: Violation[] } {
  const files: string[] = [];
  for (const top of ROOTS) walk(join(root, top), root, files);
  const scoped = files.filter((f) => inScope(f, scopes)).sort();
  const violations = scoped.flatMap((f) => scanSource(f, readFileSync(join(root, f), 'utf8')));
  return { files: scoped, violations };
}

export function checkAdoption(options: AdoptionOptions = {}): AdoptionReport {
  const root = options.root ?? REPO;
  const scopes = options.scopes ?? [];
  const exceptions = readJson<Exception[]>(join(root, 'tests/adoption/texuli-exceptions.json'), []);
  const gaps = readJson<Gap[]>(join(root, 'tests/adoption/texuli-gaps.json'), []);
  const openGaps = new Set(gaps.filter((g) => g.status === 'open').map((g) => g.id));
  const pending = loadPending(root);
  const problems: string[] = [];
  for (const e of exceptions) {
    if (!e.reason?.trim()) problems.push(`exception ${e.path} has no reason`);
    if (!existsSync(join(root, e.path))) problems.push(`exception ${e.path} does not exist`);
  }
  const { files, violations } = scanRepository(root, scopes);
  const live = violations.filter((v) => !excepted(v, exceptions));
  let gapBlocked = 0;
  let pendingCount = 0;
  for (const v of live) {
    const p = pending.get(`${v.file}\u0000${v.rule}`);
    if (p && v.count <= p.count) {
      pendingCount += 1;
      if (!options.strict) continue;
      if (options.allowGaps && p.gap && openGaps.has(p.gap)) {
        gapBlocked += 1;
        continue;
      }
      const why = p.gap && !openGaps.has(p.gap) ? ` (gap ${p.gap} is not open)` : '';
      problems.push(`${v.file}: ${v.rule} ×${v.count} still pending${why}`);
    } else if (p) {
      problems.push(`${v.file}: ${v.rule} grew from ${p.count} to ${v.count}`);
    } else {
      problems.push(
        `${v.file}: new ${v.rule} ×${v.count} (use Texuli, or add a reasoned exception)`
      );
    }
  }
  for (const p of pending.values()) {
    if (p.gap && !gaps.some((g) => g.id === p.gap))
      problems.push(`${p.file}: cites unknown gap ${p.gap}`);
  }
  return {
    ok: problems.length === 0,
    problems,
    violations: live,
    counts: { files: files.length, violations: live.length, pending: pendingCount, gapBlocked },
  };
}

/** Writes pending lists from violations: `prune` keeps only entries that still exist (and never raises a count). */
export function writePending(
  root: string,
  violations: Violation[],
  mode: 'baseline' | 'prune',
  scopes: string[] = []
): void {
  const dir = join(root, 'tests/adoption/pending');
  mkdirSync(dir, { recursive: true });
  const old = loadPending(root);
  const exceptions = readJson<Exception[]>(join(root, 'tests/adoption/texuli-exceptions.json'), []);
  const byUnit = new Map<string, PendingEntry[]>();
  if (mode === 'prune') {
    for (const p of old.values()) {
      if (inScope(p.file, scopes)) continue;
      const list = byUnit.get(unitOf(p.file)) ?? [];
      list.push(p);
      byUnit.set(unitOf(p.file), list);
    }
  }
  for (const v of violations) {
    if (excepted(v, exceptions)) continue;
    const prev = old.get(`${v.file}\u0000${v.rule}`);
    if (mode === 'prune' && !prev) continue;
    const entry: PendingEntry = {
      file: v.file,
      rule: v.rule,
      count: prev ? Math.min(prev.count, v.count) : v.count,
    };
    if (prev?.gap) entry.gap = prev.gap;
    const list = byUnit.get(unitOf(v.file)) ?? [];
    list.push(entry);
    byUnit.set(unitOf(v.file), list);
  }
  const units = new Set([...byUnit.keys(), ...[...old.values()].map((p) => unitOf(p.file))]);
  // A scoped prune rewrites only the units its scopes touch; every other list stays byte for byte.
  const touched = (unit: string) =>
    mode === 'baseline' ||
    scopes.length === 0 ||
    [...old.values(), ...violations].some(
      (v) => unitOf(v.file) === unit && inScope(v.file, scopes)
    ) ||
    scopes.some((s) => unitOf(`${s}/x`) === unit);
  for (const unit of units) {
    if (!touched(unit)) continue;
    const entries = (byUnit.get(unit) ?? []).sort(
      (a, b) => a.file.localeCompare(b.file) || a.rule.localeCompare(b.rule)
    );
    writeFileSync(join(dir, `${unit}.json`), `${JSON.stringify({ unit, entries }, null, 2)}\n`);
  }
}

function main(argv: string[]): number {
  const scopes: string[] = [];
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--scope') {
      const v = argv[++i];
      if (!v) {
        console.error('--scope needs a path');
        return 2;
      }
      scopes.push(v.replace(/\/$/, ''));
    } else if (
      ['--strict', '--allow-gaps', '--prune', '--write-baseline', '--json'].includes(a ?? '')
    ) {
      flags.add(a as string);
    } else {
      console.error(`unknown option ${a}`);
      return 2;
    }
  }
  if (flags.has('--allow-gaps') && !flags.has('--strict')) {
    console.error('--allow-gaps only applies with --strict');
    return 2;
  }
  if (flags.has('--write-baseline') || flags.has('--prune')) {
    const { violations } = scanRepository(REPO, scopes);
    writePending(REPO, violations, flags.has('--prune') ? 'prune' : 'baseline', scopes);
  }
  const report = checkAdoption({
    scopes,
    strict: flags.has('--strict'),
    allowGaps: flags.has('--allow-gaps'),
  });
  if (flags.has('--json')) console.log(JSON.stringify(report, null, 2));
  else {
    for (const p of report.problems) console.log(`✗ ${p}`);
    const c = report.counts;
    console.log(
      `${report.ok ? '✓' : '✗'} Texuli adoption: ${c.files} files, ${c.violations} violations (${c.pending} pending, ${c.gapBlocked} waiting on a Texuli gap)`
    );
  }
  return report.ok ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  process.exit(main(process.argv.slice(2)));
