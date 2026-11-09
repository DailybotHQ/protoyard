/**
 * Texuli adoption rules — keep Protoyard and every workspace built on it on
 * Texuli. Used by `scripts/check-texuli-adoption.ts` (this repository's
 * ratchet) and by `protoyard check texuli` (any workspace, consumers
 * included).
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
 *   `.svelte` file: it draws its own UI instead of composing Texuli's;
 * - `component-bind-this`: `bind:this` on a Texuli or `@protoyard/ui`
 *   component whose value is then used as a DOM element (use `bind:ref`);
 * - `ref-undefined`: `bind:ref={x}` where `x` does not start as `null`. Svelte
 *   throws at runtime on `bind:ref={undefined}` against a `ref` with a fallback,
 *   which stops the whole island; start refs as `$state<HTMLElement | null>(null)`.
 * - `local-motion`: an import from `svelte/transition` or `svelte/animate`, or
 *   an `@keyframes` rule, in a UI package, template or prototype. Motion comes
 *   from Texuli (`texuli/motion`, `@texuli/core/motion`, `--tx-motion-*`
 *   tokens), which honors reduced motion by construction.
 * - `icon-size`: a pixel number as `size` on Texuli's `Icon` or `LucideIcon`.
 *   Sizes are `xs | sm | md | lg`; a number matches none, and a built-in
 *   glyph then renders with no width and fills its container.
 * - `component-scoped-class`: a scoped `<style>` rule for a class that the
 *   markup only passes to components (`<Button class="x">`). Svelte scopes the
 *   rule to this file's elements, and a child component's root never gets the
 *   scope hash, so the rule silently never applies and the control falls back
 *   to its default look. Wrap the selector in `:global()` under a scoped
 *   parent (`.panel :global(.x)`), or put the class on an element.
 *
 * Known violations live per unit in `tests/adoption/pending/<unit>.json`
 * (unit = `packages__<name>`, `apps__<name>`, `templates` or `prototypes`).
 * The default run is a ratchet: it fails on violations the pending lists do
 * not cover, and on stale pending entries (a count above today's, including
 * a violation that is gone) until `--prune` tightens them. `--scope <path>` limits the run; `--strict` fails on every
 * violation in scope; `--allow-gaps` (with `--strict`) still accepts a pending
 * entry that cites an open gap in `tests/adoption/texuli-gaps.json`.
 * `tests/adoption/texuli-exceptions.json` is the closed list of files that stay
 * Protoyard's, each with a reason. `--prune` rewrites pending lists without
 * the violations that are gone (it never adds any); `--write-baseline`
 * records today's violations (lead only, once).
 *
 * Exit 0 when clean, 1 on any problem, 2 on usage errors.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = ['packages', 'apps', 'templates', 'prototypes'];
/**
 * Copies that exist only while a package is packed (`prepack` writes them,
 * `postpack` removes them): the sources they copy are scanned where they live.
 */
const PACK_COPY = /^(?:packages\/templates\/(?:templates|blueprints)|apps\/gallery\/guides)\//;
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
  | 'own-component'
  | 'component-bind-this'
  | 'ref-undefined'
  | 'local-motion'
  | 'icon-size'
  | 'component-scoped-class';
export const RULES: readonly Rule[] = [
  'legacy-import',
  'raw-lucide',
  'py-token',
  'raw-control',
  'input-as-choice',
  'own-component',
  'component-bind-this',
  'ref-undefined',
  'local-motion',
  'icon-size',
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
  /**
   * `deferred`: planned by Texuli for a later release, size or polish only,
   * with no adapter in Protoyard and no behavior change (the developer's call
   * to release with it, recorded in the plan). Only `open` blocks entries.
   */
  status: 'open' | 'fixed' | 'wontfix' | 'deferred';
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
export const SVELTE_MOTION = /(?:from\s+|import\s*\(\s*)['"]svelte\/(?:transition|animate)['"]/g;
export const KEYFRAMES = /@keyframes\s/g;
const MOTION_UNIT =
  /^(packages\/(ui|[a-z-]+-ui|devtools|crud|player|renderer-svelte)|apps\/gallery|templates|prototypes)\//;
export const RAW_CONTROL = /<(button|input|select|textarea|dialog)(?=[\s/>])/g;
const UI_UNIT = /^(packages\/(ui|[a-z-]+-ui|devtools|crud|player)|apps\/gallery)\//;
const COMPOSES =
  /from\s*['"](texuli(?:\/[^'"]*)?|@texuli\/[^'"]+|@protoyard\/(?:ui|[a-z-]+-ui)(?:\/[^'"]*)?|[^'"]+\.svelte)['"]/;
const LUCIDE_IMPORT = /import\s*\{([^}]*)\}\s*from\s*['"]@lucide\/svelte(?:\/[^'"]*)?['"]/g;
const LUCIDE_DEFAULT =
  /import\s+([A-Za-z_$][\w$]*)\s+from\s*['"]@lucide\/svelte\/icons\/[^'"]+['"]/g;
const COMPONENT_IMPORT = /^(?:texuli(?:\/.*)?|@texuli\/[^/]+|@protoyard\/ui(?:\/.*)?)$/;
const DOM_ELEMENT_MEMBERS =
  /(?:\?\.|\.)\s*(?:setSelectionRange|scrollIntoView|scrollTo|getBoundingClientRect|contains|querySelector(?:All)?|closest|matches|addEventListener)\s*\(/;
const DOM_ELEMENT_TYPE = /\b(?:HTML[A-Za-z]+Element|HTMLElement|Element|Node)\b/;

function count(text: string, pattern: RegExp): number {
  return [...text.matchAll(new RegExp(pattern.source, pattern.flags))].length;
}

/**
 * Strips JS and CSS comments from script, style, TypeScript or CSS source.
 * String literals are skipped, so `'../demos/*Demo.svelte'` or `'**\/*'`
 * never opens a comment. A `'` or `"` string ends at a newline (JS strings
 * cannot span lines), so a lone quote in a regex literal affects one line at
 * most. A `//` right after `:` (`http://`) is kept, as before. With
 * `keepLines`, a removed comment leaves its newlines behind, so line numbers
 * still match the source (`protoyard check ds` reports lines).
 */
function stripCodeComments(text: string, keepLines = false): string {
  let out = '';
  let quote = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string;
    if (quote) {
      out += c;
      if (c === '\\' && i + 1 < text.length) out += text[++i];
      else if (c === quote || (c === '\n' && quote !== '`')) quote = '';
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      if (keepLines) out += newlinesOf(text.slice(i, end < 0 ? text.length : end + 2));
      i = end < 0 ? text.length : end + 1;
      continue;
    }
    if (c === '/' && text[i + 1] === '/' && text[i - 1] !== ':') {
      const end = text.indexOf('\n', i);
      i = (end < 0 ? text.length : end) - 1;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    out += c;
  }
  return out;
}

/**
 * Strips comments so commented-out code does not count. In a `.svelte` file,
 * markup loses only `<!-- -->` (so `accept="image/*"` or a ` // ` in text never
 * hides what follows), and JS/CSS comments are stripped only inside `<script>`
 * and `<style>` blocks. Other files strip `<!-- -->`, `/* *\/` and `//`.
 * `keepLines` keeps every removed comment's newlines (see `stripCodeComments`).
 */
export function stripComments(file: string, text: string, keepLines = false): string {
  const html = (whole: string) => (keepLines ? newlinesOf(whole) : '');
  if (!file.endsWith('.svelte'))
    return stripCodeComments(text.replace(/<!--[\s\S]*?-->/g, html), keepLines);
  return text.replace(
    /<!--[\s\S]*?-->|(<(script|style)\b[^>]*>)([\s\S]*?)(<\/\2\s*>)/g,
    (
      whole: string,
      open: string | undefined,
      _tag,
      body: string | undefined,
      close: string | undefined
    ) => (open ? `${open}${stripCodeComments(body ?? '', keepLines)}${close}` : html(whole))
  );
}

/** The newlines of a removed span, so later line numbers do not move. */
function newlinesOf(text: string): string {
  return '\n'.repeat(text.split('\n').length - 1);
}

/**
 * Returns the opening tags of `<name …>` in markup. Attribute values in braces
 * (`onclick={() => go()}`) and quotes are balanced, so a `>` inside them does
 * not end the tag.
 */
export function openingTags(markup: string, name: string): string[] {
  return openingTagMatches(markup, name).map((m) => m.tag);
}

/** Like `openingTags`, with each tag's offset in `markup`. */
export function openingTagMatches(markup: string, name: string): { index: number; tag: string }[] {
  const tags: { index: number; tag: string }[] = [];
  const start = new RegExp(`<${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[\\s/>])`, 'g');
  for (const match of markup.matchAll(start)) {
    let i = (match.index ?? 0) + match[0].length;
    let depth = 0;
    let quote = '';
    for (; i < markup.length; i++) {
      const c = markup[i];
      if (quote) {
        // In an expression a '…' or "…" string cannot span lines.
        if (depth > 0 && c === '\\') i += 1;
        else if (c === quote || (depth > 0 && c === '\n' && quote !== '`')) quote = '';
      } else if (depth > 0 && c === '/' && (markup[i + 1] === '*' || markup[i + 1] === '/')) {
        // A JS comment inside an expression (`{() => { /* don't */ go(); }}`).
        const end = markup.indexOf(markup[i + 1] === '*' ? '*/' : '\n', i + 2);
        i = end < 0 ? markup.length : markup[i + 1] === '*' ? end + 1 : end - 1;
      } else if (c === '"' || c === "'" || (c === '`' && depth > 0)) quote = c;
      else if (c === '{') depth += 1;
      else if (c === '}') depth = Math.max(0, depth - 1);
      else if (c === '>' && depth === 0) break;
    }
    tags.push({ index: match.index ?? 0, tag: markup.slice(match.index ?? 0, i + 1) });
  }
  return tags;
}

export function markupOf(svelte: string): string {
  return svelte.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
}

/** Counts Texuli Input opening tags used where a dedicated choice control belongs. */
function inputAsChoiceCount(markup: string): number {
  return openingTags(markup, 'Input').filter(
    (tag) => /\btype\s*=\s*(['"])(?:checkbox|radio)\1/i.test(tag) || /\bbind:checked\b/.test(tag)
  ).length;
}

/**
 * True when a `let` declaration tail (`: T = init`) starts the variable as
 * `null`: `= null`, `= $state(null)` or `= $state<T>(null)`. The type is
 * ignored, so `$state<HTMLElement | null>()` (undefined) does not pass.
 */
function startsNull(tail: string): boolean {
  const eq = tail.search(/(?<![=!<>])=(?![=>])/);
  if (eq < 0) return false;
  const init = tail.slice(eq + 1).trim();
  if (/^null\b/.test(init)) return true;
  const state = init.match(/^\$state(?:\.raw)?\s*(?:<.*>)?\s*\(([^)]*)\)/);
  return state !== null && (state[1] ?? '').trim() === 'null';
}

/** Counts `bind:ref={x}` whose `x` is declared with no `null` initial value. */
function refUndefinedCount(svelte: string): number {
  const script = (svelte.match(/<script[\s\S]*?<\/script>/g) ?? []).join('\n');
  const markup = markupOf(svelte);
  let violations = 0;
  for (const match of markup.matchAll(/\bbind:ref=\{\s*([A-Za-z_$][\w$]*)\s*\}/g)) {
    const name = match[1] ?? '';
    const decl = script.match(new RegExp(`\\blet\\s+${name.replace(/\$/g, '\\$')}\\b([^;\\n]*)`));
    if (decl && !startsNull(decl[1] ?? '')) violations += 1;
  }
  return violations;
}

/** Counts component refs from Texuli/@protoyard/ui that are used as DOM elements. */
function componentBindThisCount(svelte: string): number {
  const imported = new Set<string>();
  const namespaces = new Set<string>();
  for (const match of svelte.matchAll(/import\s+([\s\S]*?)\s+from\s*['"]([^'"]+)['"]/g)) {
    const clause = match[1] ?? '';
    if (!COMPONENT_IMPORT.test(match[2] ?? '')) continue;
    const namespace = clause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
    if (namespace?.[1]) namespaces.add(namespace[1]);
    const named = clause.match(/\{([^}]*)\}/)?.[1];
    if (named) {
      for (const specifier of named.split(',')) {
        const parts = specifier
          .trim()
          .replace(/^type\s+/, '')
          .split(/\s+as\s+/);
        const local = parts.at(-1)?.trim();
        if (local && /^[A-Za-z_$][\w$]*$/.test(local)) imported.add(local);
      }
    }
    const defaultImport = clause.match(/^\s*([A-Za-z_$][\w$]*)\s*(?:,|$)/);
    if (defaultImport?.[1] && defaultImport[1] !== 'type') imported.add(defaultImport[1]);
  }

  const script = (svelte.match(/<script[\s\S]*?<\/script>/g) ?? []).join('\n');
  const markup = markupOf(svelte);
  const tags = [
    ...imported,
    ...[...namespaces].flatMap((prefix) =>
      [...markup.matchAll(new RegExp(`<${prefix}\\.([A-Za-z_$][\\w$]*)`, 'g'))].map(
        (match) => `${prefix}.${match[1]}`
      )
    ),
  ];
  let violations = 0;
  for (const tag of tags) {
    for (const opening of openingTags(markup, tag)) {
      const ref = opening.match(/\bbind:this\s*=\s*\{\s*([A-Za-z_$][\w$]*)\s*\}/)?.[1];
      if (!ref) continue;
      const elementType = new RegExp(`\\b${ref}\\b[^;\\n]*${DOM_ELEMENT_TYPE.source}`, 'm');
      const domMember = new RegExp(`\\b${ref}\\s*${DOM_ELEMENT_MEMBERS.source}`, 'm');
      if (elementType.test(script) || domMember.test(script)) violations += 1;
    }
  }
  return violations;
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

/**
 * A Texuli `Icon` or `LucideIcon` given a pixel number as `size`. Texuli takes
 * `xs | sm | md | lg`; a number matches no size, so the built-in glyph renders
 * with no width and stretches to fill its container.
 */
const ICON_NUMERIC_SIZE = /<(?:Icon|LucideIcon)\b[^>]*?\ssize=(?:\{\s*\d|"\d|'\d)/g;

/** An opening tag: its name and attribute text (a heuristic, enough for class tokens). */
const OPENING_TAG = /<([A-Za-z][\w.:-]*)((?:[^>{]|\{[^}]*\})*)>/g;
const CLASS_TOKEN = /-?[A-Za-z_][\w-]*/g;

/** Class names of scoped rules in a Svelte `<style>`, outside every `:global`. */
function scopedClasses(text: string): Set<string> {
  const out = new Set<string>();
  for (const block of text.match(/<style[^>]*>[\s\S]*?<\/style>/g) ?? []) {
    const css = block.replace(/^<style[^>]*>|<\/style>$/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/([^{}]+)\{/g)) {
      const prelude = (m[1] ?? '').trim();
      if (prelude.startsWith('@')) continue;
      for (const selector of splitTopLevel(prelude)) {
        const scoped = stripGlobal(selector).replace(/:global\b[\s\S]*$/, '');
        for (const c of scoped.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) if (c[1]) out.add(c[1]);
      }
    }
  }
  return out;
}

/**
 * Splits a selector list at top-level commas only, so a comma inside
 * `:is(...)`, `:where(...)` or `:global(...)` stays with its selector
 * (Dailybot batch 9).
 */
export function splitTopLevel(prelude: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < prelude.length; i++) {
    const ch = prelude[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (ch === ',' && depth === 0) {
      parts.push(prelude.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(prelude.slice(start));
  return parts;
}

/** Removes every `:global(...)` group, at any nesting depth. */
export function stripGlobal(selector: string): string {
  let out = '';
  let i = 0;
  while (i < selector.length) {
    if (selector.startsWith(':global(', i)) {
      let depth = 0;
      let j = i + ':global'.length;
      for (; j < selector.length; j++) {
        if (selector[j] === '(') depth++;
        else if (selector[j] === ')' && --depth === 0) break;
      }
      i = j + 1;
      continue;
    }
    out += selector[i];
    i++;
  }
  return out;
}

/**
 * Scoped classes the markup uses only on components. A class that also
 * appears on an element, in a `class:` directive or anywhere in the script
 * (built at runtime) is not counted.
 */
function componentScopedClassCount(text: string): number {
  const scoped = scopedClasses(text);
  if (scoped.size === 0) return 0;
  const markup = markupOf(text);
  const script = (text.match(/<script[\s\S]*?<\/script>/g) ?? []).join('\n');
  const onComponent = new Set<string>();
  const elsewhere = new Set<string>();
  for (const m of markup.matchAll(OPENING_TAG)) {
    const name = m[1] ?? '';
    const attrs = m[2] ?? '';
    const component = /^[A-Z]/.test(name) || name.includes('.');
    const target = component ? onComponent : elsewhere;
    for (const d of attrs.matchAll(/\bclass:([\w-]+)/g)) if (d[1]) elsewhere.add(d[1]);
    for (const a of attrs.matchAll(/\bclass\s*=\s*("[^"]*"|'[^']*'|\{[^}]*\})/g)) {
      for (const t of (a[1] ?? '').match(CLASS_TOKEN) ?? []) target.add(t);
    }
  }
  let n = 0;
  for (const c of scoped) {
    if (!onComponent.has(c) || elsewhere.has(c)) continue;
    if (new RegExp(`(?<![\\w-])${c.replace(/[-]/g, '\\-')}(?![\\w-])`).test(script)) continue;
    n++;
  }
  return n;
}

/** Counts each rule in one source file. Pure; exported for tests. */
export function scanSource(file: string, source: string): Violation[] {
  const text = stripComments(file, source);
  const out: Violation[] = [];
  const add = (rule: Rule, n: number) => {
    if (n > 0) out.push({ file, rule, count: n });
  };
  add('legacy-import', count(text, LEGACY_IMPORT));
  add('py-token', count(text, PY_TOKEN));
  if (MOTION_UNIT.test(file))
    add('local-motion', count(text, SVELTE_MOTION) + count(text, KEYFRAMES));
  if (file.endsWith('.svelte')) {
    const markup = markupOf(text);
    add('raw-control', count(markup, RAW_CONTROL));
    add('input-as-choice', inputAsChoiceCount(markup));
    add('component-bind-this', componentBindThisCount(text));
    add('ref-undefined', refUndefinedCount(text));
    let raw = 0;
    for (const name of lucideNames(text)) {
      raw += count(markup, new RegExp(`<${name.replace(/\$/g, '\\$')}(?=[\\s/>])`, 'g'));
    }
    add('raw-lucide', raw);
    add('icon-size', count(markup, ICON_NUMERIC_SIZE));
    add('component-scoped-class', componentScopedClassCount(text));
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
  root: string = process.cwd(),
  scopes: string[] = []
): { files: string[]; violations: Violation[] } {
  const files: string[] = [];
  for (const top of ROOTS) walk(join(root, top), root, files);
  const scoped = files.filter((f) => inScope(f, scopes) && !PACK_COPY.test(f)).sort();
  const read: string[] = [];
  const violations: Violation[] = [];
  for (const f of scoped) {
    let source: string;
    try {
      source = readFileSync(join(root, f), 'utf8');
    } catch (error) {
      // A file removed while the scan runs (a parallel pack cleaning its copy).
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    read.push(f);
    violations.push(...scanSource(f, source));
  }
  return { files: read, violations };
}

export function checkAdoption(options: AdoptionOptions = {}): AdoptionReport {
  const root = options.root ?? process.cwd();
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
  const liveCounts = new Map(live.map((v) => [`${v.file}\u0000${v.rule}`, v.count]));
  for (const [key, p] of pending) {
    if (p.gap && !gaps.some((g) => g.id === p.gap))
      problems.push(`${p.file}: cites unknown gap ${p.gap}`);
    // A stale allowance would let a fixed file regress silently up to the old count.
    if (!inScope(p.file, scopes)) continue;
    const now = liveCounts.get(key) ?? 0;
    if (now < p.count)
      problems.push(
        `${p.file}: ${p.rule} pending ×${p.count} is stale (now ×${now}); run --prune to tighten it`
      );
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
