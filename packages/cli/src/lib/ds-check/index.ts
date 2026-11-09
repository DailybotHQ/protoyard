/**
 * Locked design systems (PLAN_013): `protoyard check ds` and the
 * `design-system` step of `protoyard validate`. A prototype whose
 * `protoyard.json` has `designSystem.locked: true` draws its UI only with the
 * design system's components; local code composes them with layout. Pure
 * functions, exported for tests; the scanner reads files and never writes.
 *
 * Rules (stable ids):
 * - `ds-raw-control`: a native control (the `raw-control` elements of the
 *   Texuli adoption check), an element with an interactive ARIA role, or a
 *   plain element (`<a>`, `<div>`…) given a click handler;
 * - `ds-visual-css`: a visual declaration (color, background, border, radius,
 *   shadow, outline, font and text, spacing of letters and lines, opacity,
 *   filter, transform, transition, animation) or a literal color in a
 *   `.svelte` `<style>` block or a `.css` file; also a `--tx-*` token
 *   redefined, and a `z-index` off the 0–50 scale;
 * - `ds-global-override`: a selector that targets a `tx-` class or a
 *   `[data-tx-*]` attribute (through `:global(...)` or a global `.css` file);
 * - `ds-utility`: a class token that is not a layout utility of the allow-list
 *   (`./utilities.ts`), a `tx-` class or a class the prototype's own CSS
 *   defines, and any arbitrary value (`p-[13px]`);
 * - `ds-inline-style`: `style="..."` or `style:prop` on any element or component;
 * - `ds-styled-local-component`: a local `.svelte` file that styles itself
 *   (visual declarations in its `<style>` or visual utility classes);
 * - `ds-ui-library`: an import of another UI library (bits-ui, Skeleton, …);
 * - `ds-local-motion`: `svelte/transition`, `svelte/animate` or `svelte/motion`
 *   imports, `transition:`/`in:`/`out:`/`animate:` directives, `@keyframes`
 *   (aligned with the adoption check's `local-motion`).
 *
 * Two more rules run only when the bound design system has an `allow`
 * section (Texuli spec 0.13.0; {@link DsAllowContext}):
 * - `ds-not-allowed`: a Texuli (or `@protoyard/ui`) component rendered as a
 *   tag whose catalog id (`catalogIdFor` in `../ds-catalog.ts`) the allow
 *   section does not list, and is not a part of an allowed id; a component
 *   the mapper cannot place (`unmapped`); a `@ds/<id>/<Name>` import that is
 *   not in the design system's library (or belongs to another design
 *   system); in a library component's own file, a catalog id its entry does
 *   not list in `composes`.
 * - `ds-disabled-value`: a literal value (`variant="ghost"`,
 *   `size={'sm'}`) on an axis prop (variant, size, tone, density; the prop
 *   name comes from the catalog manifest's `axes`) that the allow entry does
 *   not enable. Dynamic expressions are skipped here; the render check covers
 *   them.
 */
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { DesignSystemAllow } from '@texuli/spec/design-system';
import { locateDesignSystem, readDocumentFile } from '../design-systems.ts';
import {
  allowedVia,
  catalogIdFor,
  componentUses,
  DS_AXES,
  type DsCatalog,
  dsCatalog,
  enabledValues,
  type LibraryEntryLike,
  readAllow,
  readLibrary,
} from '../ds-catalog.ts';
import {
  KEYFRAMES,
  openingTagMatches,
  RAW_CONTROL,
  splitTopLevel,
  stripComments,
  stripGlobal,
} from '../texuli-adoption.ts';
import { classifyUtility } from './utilities.ts';

export { classifyUtility, type UtilityVerdict } from './utilities.ts';

export type DsRule =
  | 'ds-raw-control'
  | 'ds-visual-css'
  | 'ds-global-override'
  | 'ds-utility'
  | 'ds-inline-style'
  | 'ds-styled-local-component'
  | 'ds-ui-library'
  | 'ds-local-motion'
  | 'ds-not-allowed'
  | 'ds-disabled-value';

export const DS_RULES: readonly DsRule[] = [
  'ds-raw-control',
  'ds-visual-css',
  'ds-global-override',
  'ds-utility',
  'ds-inline-style',
  'ds-styled-local-component',
  'ds-ui-library',
  'ds-local-motion',
  'ds-not-allowed',
  'ds-disabled-value',
];

/**
 * What the allow rules read: the catalog, the design system's `allow`
 * section and library, and (for a library component's own file) the catalog
 * ids its entry `composes`.
 */
export interface DsAllowContext {
  catalog: DsCatalog;
  designSystemId: string;
  allow: DesignSystemAllow;
  library: readonly LibraryEntryLike[];
  /** Set when scanning a library component's file: the entry's `composes`. */
  composes?: readonly string[];
}

/**
 * The allow context of a design system, or null when it cannot be read or
 * has no `allow` section (the allow rules do not run then; `validate` reports
 * an unusable binding on its own).
 */
export function loadAllowContext(root: string, designSystemId: string): DsAllowContext | null {
  try {
    const document = readDocumentFile(locateDesignSystem(root, designSystemId));
    const allow = readAllow(document);
    if (!allow) return null;
    return { catalog: dsCatalog(), designSystemId, allow, library: readLibrary(document) };
  } catch {
    return null;
  }
}

export interface DsViolation {
  rule: DsRule;
  /** Workspace-relative POSIX path (or the path the caller passed). */
  file: string;
  /** 1-based line in the source. */
  line: number;
  message: string;
  wayOut: string;
}

export interface DsScanOptions {
  /** The bound design system's id, used in the way-out text. */
  designSystemId?: string;
  /** Classes defined by the prototype's own global `.css` files. */
  localClasses?: ReadonlySet<string>;
  /** The bound design system's allow section; the allow rules run only with it. */
  allow?: DsAllowContext | null;
}

/** The way out every violation carries. */
export function dsWayOut(designSystemId?: string, name = '<Name>'): string {
  return `Use a design-system component, or request one: protoyard ds component request ${designSystemId || '<design-system-id>'} ${name}`;
}

const UI_LIBRARY =
  /^(?:bits-ui|melt-ui|@melt-ui\/[^/]+|@skeletonlabs\/[^/]+|flowbite(?:-[\w-]+)?|daisyui|shadcn(?:-[\w-]+)?|@shadcn\/[^/]+|@radix-ui\/[^/]+|@headlessui\/[^/]+|svelte-headlessui|svelte-ux|carbon-components-svelte|@smui(?:-extra)?\/[^/]+|tailwind-variants|class-variance-authority|@ark-ui\/[^/]+|@zag-js\/[^/]+|sveltestrap|@sveltestrap\/[^/]+|svelte-material-ui|attractions)(?:\/.*)?$/;
const MOTION_MODULE = /^svelte\/(?:transition|animate|motion)$/;
const IMPORT_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"\n]+)\1/g;
const CSS_IMPORT = /@(?:import|plugin)\s+(?:url\(\s*)?(['"])([^'"\n]+)\1/g;
const CLASS_HELPER = /\b(?:cx|clsx|cn|classNames|twMerge|twJoin)\s*\(/g;
const INTERACTIVE_ROLE =
  /\brole\s*=\s*["']?(?:button|link|checkbox|radio|switch|tab|menuitem|menuitemcheckbox|menuitemradio|option|slider|spinbutton|textbox|searchbox|combobox|listbox)\b/;
const CLICK_HANDLER = /\s(?:onclick\s*=|on:click\b)/;
const VISUAL_PROPERTY =
  /^(?:color|background(?:-[\w-]+)?|border(?:-[\w-]+)?|outline(?:-[\w-]+)?|box-shadow|text-[\w-]+|font(?:-[\w-]+)?|letter-spacing|line-height|word-spacing|opacity|filter|backdrop-filter|transform(?:-[\w-]+)?|translate|rotate|scale|transition(?:-[\w-]+)?|animation(?:-[\w-]+)?|fill|stroke(?:-[\w-]+)?|caret-color|accent-color|mix-blend-mode)$/;
const LITERAL_COLOR =
  /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix|color)\(/;
const DECLARATION = /(^|[{;])(\s*)(-{0,2}[A-Za-z][\w-]*)\s*:\s*([^;{}]+?)\s*(?=;|\})/g;
const TX_TARGET = /\.tx-|\[\s*data-tx-/;
const CONTROL_NAME: Record<string, string> = {
  button: 'Button',
  input: 'Input',
  select: 'Select',
  textarea: 'Textarea',
  dialog: 'Dialog',
};

/** Replaces every character but newlines with a space: offsets and lines stay. */
function blank(text: string): string {
  return text.replace(/[^\n]/g, ' ');
}

function lineIndex(text: string): (offset: number) => number {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return (offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((starts[mid] ?? 0) <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

interface Views {
  script: string;
  style: string;
  markup: string;
}

/** Same-length views of a `.svelte` file: script bodies, style bodies, markup. */
function svelteViews(text: string): Views {
  let script = blank(text);
  let style = blank(text);
  let markup = text;
  for (const m of text.matchAll(/<(script|style)\b[^>]*>([\s\S]*?)<\/\1\s*>/g)) {
    const start = m.index ?? 0;
    const bodyStart = start + m[0].indexOf('>') + 1;
    const body = m[2] ?? '';
    const splice = (view: string, at: number, part: string) =>
      view.slice(0, at) + part + view.slice(at + part.length);
    if (m[1] === 'script') script = splice(script, bodyStart, body);
    else style = splice(style, bodyStart, body);
    markup = splice(markup, start, blank(m[0]));
  }
  return { script, style, markup };
}

/**
 * Masks quoted values and `{…}` expressions inside an opening tag with spaces,
 * so attribute names are found only where they are attributes.
 */
function maskTag(tag: string): string {
  let out = '';
  let depth = 0;
  let quote = '';
  for (let i = 0; i < tag.length; i++) {
    const c = tag[i] as string;
    if (quote) {
      out += c === '\n' ? c : ' ';
      if (c === '\\' && depth > 0) {
        i += 1;
        out += ' ';
      } else if (c === quote) quote = '';
      continue;
    }
    if (depth > 0) {
      if (c === '"' || c === "'" || c === '`') quote = c;
      else if (c === '{') depth += 1;
      else if (c === '}') depth -= 1;
      out += c === '\n' ? c : depth === 0 && c === '}' ? '}' : ' ';
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      out += c;
      continue;
    }
    if (c === '{') depth = 1;
    out += c;
  }
  return out;
}

/** The balanced `{…}`, `(…)` or quoted value starting at `at`, without delimiters. */
function balanced(text: string, at: number): string {
  const open = text[at];
  if (open === '"' || open === "'") {
    const end = text.indexOf(open, at + 1);
    return text.slice(at + 1, end < 0 ? text.length : end);
  }
  const close = open === '(' ? ')' : '}';
  let depth = 0;
  let quote = '';
  for (let i = at; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i += 1;
      else if (c === quote) quote = '';
    } else if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === open) depth += 1;
    else if (c === close && --depth === 0) return text.slice(at + 1, i);
  }
  return text.slice(at + 1);
}

/**
 * Class-like strings of a JS expression: string literals (template literals
 * without their `${}` parts) and unquoted object keys. Literals compared with
 * `===`/`!==` are values, not classes, and are skipped.
 */
export function classStrings(expression: string): string[] {
  const out: string[] = [];
  for (const m of expression.matchAll(/(['"])((?:\\.|(?!\1)[^\\\n])*)\1|`((?:\\.|[^`\\])*)`/g)) {
    const at = m.index ?? 0;
    const before = expression.slice(0, at).trimEnd();
    const after = expression.slice(at + m[0].length).trimStart();
    if (/[=!]==?$/.test(before) || /^[=!]==?/.test(after)) continue;
    if (m[3] !== undefined) out.push(m[3].replace(/\$\{[^}]*\}/g, ' '));
    else out.push(m[2] ?? '');
  }
  for (const m of expression.matchAll(/[{,]\s*([A-Za-z_][\w-]*)\s*:/g)) out.push(m[1] ?? '');
  return out;
}

/** The class tokens of a `class` attribute value (quoted, with `{…}` parts, or an expression). */
function classValueTokens(tag: string, valueAt: number): string[] {
  const open = tag[valueAt] ?? '';
  if (!/["'{]/.test(open))
    return [tag.slice(valueAt).match(/^[^\s/>]+/)?.[0] ?? ''].filter(Boolean);
  const value = balanced(tag, valueAt);
  const strings =
    tag[valueAt] === '{'
      ? classStrings(value)
      : [
          value.replace(/\{[^}]*\}/g, ' '),
          ...[...value.matchAll(/\{([^}]*)\}/g)].flatMap((m) => classStrings(m[1] ?? '')),
        ];
  return strings.flatMap((s) => s.split(/\s+/)).filter(Boolean);
}

/** Classes a stylesheet defines (selectors outside at-rule preludes), `tx-` excluded. */
export function definedClasses(css: string): Set<string> {
  const out = new Set<string>();
  for (const m of css.matchAll(/([^{};]+)\{/g)) {
    const prelude = (m[1] ?? '').trim();
    if (prelude.startsWith('@')) continue;
    for (const c of prelude.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) {
      if (c[1] && !c[1].startsWith('tx-')) out.add(c[1]);
    }
  }
  return out;
}

type Add = (rule: DsRule, offset: number, message: string, name?: string) => void;

function scanImports(view: string, add: Add): void {
  for (const m of view.matchAll(IMPORT_SPECIFIER)) {
    const spec = m[2] ?? '';
    if (UI_LIBRARY.test(spec)) {
      add('ds-ui-library', m.index ?? 0, `imports the UI library "${spec}"`);
    } else if (MOTION_MODULE.test(spec)) {
      add('ds-local-motion', m.index ?? 0, `imports local motion from "${spec}"`);
    }
  }
}

/** Checks one stylesheet view. Returns whether it holds a visual declaration. */
function scanCss(css: string, add: Add, global: boolean): boolean {
  let visual = false;
  for (const m of css.matchAll(CSS_IMPORT)) {
    const spec = m[2] ?? '';
    if (UI_LIBRARY.test(spec))
      add('ds-ui-library', m.index ?? 0, `loads the UI library "${spec}" in CSS`);
  }
  for (const m of css.matchAll(new RegExp(KEYFRAMES.source, 'g'))) {
    add('ds-local-motion', m.index ?? 0, 'defines local motion with @keyframes');
  }
  for (const m of css.matchAll(/([^{};]+)\{/g)) {
    const prelude = (m[1] ?? '').trim();
    if (!prelude || prelude.startsWith('@')) continue;
    const at = (m.index ?? 0) + (m[1] ?? '').search(/\S/);
    for (const selector of splitTopLevel(prelude)) {
      if (!TX_TARGET.test(selector)) continue;
      const how = !TX_TARGET.test(stripGlobal(selector))
        ? 'through :global(...)'
        : global
          ? 'in a global stylesheet'
          : 'in local CSS';
      add(
        'ds-global-override',
        at,
        `selector "${selector.trim()}" targets the design system's own markup ${how}`
      );
    }
  }
  for (const m of css.matchAll(DECLARATION)) {
    const at = (m.index ?? 0) + (m[1] ?? '').length + (m[2] ?? '').length;
    const raw = m[3] ?? '';
    const value = (m[4] ?? '').trim();
    const property = raw.toLowerCase().replace(/^-(?:webkit|moz|ms|o)-/, '');
    let why = '';
    if (property.startsWith('--tx-')) why = `redefines the design-system token ${raw}`;
    else if (property.startsWith('--')) continue;
    else if (VISUAL_PROPERTY.test(property)) why = `visual declaration "${raw}: ${value}"`;
    else if (LITERAL_COLOR.test(value)) why = `literal color in "${raw}: ${value}"`;
    else if (
      property === 'z-index' &&
      !/^(?:auto|[0-9]|[1-4][0-9]|50)$/.test(value) &&
      !value.startsWith('var(--tx-')
    )
      why = `z-index "${value}" is off the scale (0–50, auto or var(--tx-*))`;
    if (!why) continue;
    visual = true;
    add('ds-visual-css', at, why);
  }
  return visual;
}

/** Checks class tokens; returns whether one of them is a visual utility. */
function checkTokens(
  tokens: string[],
  offset: number,
  add: Add,
  local: ReadonlySet<string>
): boolean {
  let visual = false;
  for (const token of tokens) {
    if (token.startsWith('tx-') || local.has(token)) continue;
    const verdict = classifyUtility(token);
    if (verdict === 'allowed') continue;
    if (verdict === 'visual') visual = true;
    add(
      'ds-utility',
      offset,
      verdict === 'arbitrary'
        ? `class "${token}" uses an arbitrary value`
        : verdict === 'visual'
          ? `class "${token}" is a visual utility (locked mode allows layout utilities only)`
          : `class "${token}" is not an allowed layout utility`
    );
  }
  return visual;
}

function scanClassHelpers(view: string, add: Add, local: ReadonlySet<string>): boolean {
  let visual = false;
  for (const m of view.matchAll(CLASS_HELPER)) {
    const open = (m.index ?? 0) + m[0].length - 1;
    const tokens = classStrings(balanced(view, open))
      .flatMap((s) => s.split(/\s+/))
      .filter(Boolean);
    if (checkTokens(tokens, m.index ?? 0, add, local)) visual = true;
  }
  return visual;
}

function scanMarkup(markup: string, add: Add, local: ReadonlySet<string>): boolean {
  let visual = false;
  const names = new Set<string>();
  for (const m of markup.matchAll(/<([A-Za-z][\w.:-]*)(?=[\s/>])/g)) names.add(m[1] ?? '');
  for (const name of names) {
    const element = /^[a-z]/.test(name) && !name.includes(':') && !name.includes('.');
    for (const { index, tag } of openingTagMatches(markup, name)) {
      const masked = maskTag(tag);
      if (element) {
        if (new RegExp(RAW_CONTROL.source).test(`<${name} `)) {
          add('ds-raw-control', index, `raw <${name}> control`, CONTROL_NAME[name] ?? '<Name>');
        } else if (INTERACTIVE_ROLE.test(tag)) {
          add('ds-raw-control', index, `<${name}> given an interactive role`);
        } else if (CLICK_HANDLER.test(masked)) {
          add('ds-raw-control', index, `<${name}> made interactive with a click handler`);
        }
      }
      for (const s of masked.matchAll(/\sstyle(?::[\w-]+(?:\|important)?)?(?=[\s=/>])/g)) {
        add('ds-inline-style', index + (s.index ?? 0), `inline ${s[0].trim()} on <${name}>`);
      }
      for (const d of masked.matchAll(/\s(transition|in|out|animate):[\w$.-]+/g)) {
        add('ds-local-motion', index + (d.index ?? 0), `${d[1]}: directive on <${name}>`);
      }
      for (const c of masked.matchAll(/\sclass:([^\s=/>]+)/g)) {
        if (checkTokens([c[1] ?? ''], index + (c.index ?? 0), add, local)) visual = true;
      }
      for (const c of masked.matchAll(/\sclass\s*=\s*/g)) {
        const valueAt = (c.index ?? 0) + c[0].length;
        if (checkTokens(classValueTokens(tag, valueAt), index + (c.index ?? 0), add, local))
          visual = true;
      }
    }
  }
  return visual;
}

const DS_IMPORT =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])@ds\/([^/'"\n]+)\/([^/'"\n]+)\1/g;

/** `@ds/<id>/<Name>` imports: only the bound design system's library components. */
function scanLibraryImports(view: string, add: Add, ctx: DsAllowContext): void {
  for (const m of view.matchAll(DS_IMPORT)) {
    const id = m[2] ?? '';
    const name = m[3] ?? '';
    if (id !== ctx.designSystemId) {
      add(
        'ds-not-allowed',
        m.index ?? 0,
        `imports @ds/${id}/${name}, a component of another design system than "${ctx.designSystemId}"`
      );
    } else if (!ctx.library.some((entry) => entry.name === name)) {
      add(
        'ds-not-allowed',
        m.index ?? 0,
        `imports @ds/${id}/${name}, which is not in the library of design system "${id}"`,
        name
      );
    }
  }
}

/** The literal value of an attribute in an opening tag, or undefined (absent or dynamic). */
export function literalAttribute(tag: string, prop: string): string | undefined {
  const masked = maskTag(tag);
  const at = new RegExp(`\\s${prop.replace(/[$]/g, '\\$')}\\s*=\\s*`).exec(masked);
  if (!at) return undefined;
  const valueAt = at.index + at[0].length;
  const open = tag[valueAt];
  if (open === '"' || open === "'") {
    const value = balanced(tag, valueAt);
    return value.includes('{') ? undefined : value;
  }
  if (open === '{') {
    const literal = /^\s*(?:(['"])([^'"\\\n]*)\1|`([^`$\\]*)`)\s*$/.exec(balanced(tag, valueAt));
    return literal ? (literal[2] ?? literal[3]) : undefined;
  }
  return tag.slice(valueAt).match(/^[^\s/>{]+/)?.[0];
}

/** The allow rules over one `.svelte` source (comment-stripped, offsets kept). */
function scanAllowed(text: string, markup: string, add: Add, ctx: DsAllowContext): void {
  const allowed = Object.keys(ctx.allow);
  const tags = new Map<string, Map<number, string>>();
  const tagAt = (name: string, offset: number) => {
    let byOffset = tags.get(name);
    if (!byOffset) {
      byOffset = new Map(openingTagMatches(markup, name).map((t) => [t.index, t.tag]));
      tags.set(name, byOffset);
    }
    return byOffset.get(offset) ?? '';
  };
  for (const use of componentUses(text, ctx.catalog)) {
    const match = catalogIdFor(ctx.catalog, use.module, use.identifier);
    if (!match.id) {
      add(
        'ds-not-allowed',
        use.offset,
        `<${use.tag}> (${use.identifier} from "${use.module}") is unmapped: the Texuli catalog does not list it, so design system "${ctx.designSystemId}" cannot allow it`,
        use.identifier
      );
      continue;
    }
    const via = allowedVia(ctx.catalog, allowed, match.id);
    if (!via) {
      add(
        'ds-not-allowed',
        use.offset,
        `<${use.tag}> is the catalog component "${match.id}", which design system "${ctx.designSystemId}" does not allow`,
        use.identifier
      );
      continue;
    }
    if (ctx.composes && !allowedVia(ctx.catalog, ctx.composes, match.id)) {
      add(
        'ds-not-allowed',
        use.offset,
        `<${use.tag}> is the catalog component "${match.id}", which this library entry does not list in composes`,
        use.identifier
      );
    }
    const component = ctx.catalog.byId.get(match.id);
    const entry = ctx.allow[match.id];
    if (!component || !entry) continue;
    const tag = tagAt(use.tag, use.offset);
    for (const axis of DS_AXES) {
      const prop = component.axes[axis]?.prop;
      const enabled = enabledValues(entry, axis);
      if (!prop || !enabled) continue;
      const value = literalAttribute(tag, prop);
      if (value === undefined || enabled.includes(value)) continue;
      add(
        'ds-disabled-value',
        use.offset,
        `<${use.tag} ${prop}="${value}">: ${axis} "${value}" of "${match.id}" is not enabled in design system "${ctx.designSystemId}" (enabled: ${enabled.join(', ') || 'none'})`,
        use.identifier
      );
    }
  }
}

/**
 * Checks one source file of a locked prototype (`.svelte`, `.ts`, `.js` or
 * `.css`). `file` is reported as given; lines are 1-based. Pure.
 */
export function scanDesignSystemSource(
  file: string,
  source: string,
  options: DsScanOptions = {}
): DsViolation[] {
  const text = stripComments(file, source, true);
  const lineOf = lineIndex(text);
  const out: DsViolation[] = [];
  const add: Add = (rule, offset, message, name) =>
    out.push({
      rule,
      file,
      line: lineOf(offset),
      message,
      wayOut: dsWayOut(options.designSystemId, name),
    });
  const global = options.localClasses ?? new Set<string>();
  if (file.endsWith('.css')) {
    scanCss(text, add, true);
  } else if (file.endsWith('.svelte')) {
    const views = svelteViews(text);
    const local = new Set([...global, ...definedClasses(views.style)]);
    scanImports(views.script, add);
    const styled = scanCss(views.style, add, false);
    const visualClasses = scanMarkup(views.markup, add, local);
    const helperClasses = scanClassHelpers(views.script, add, local);
    if (options.allow) {
      scanLibraryImports(views.script, add, options.allow);
      scanAllowed(text, views.markup, add, options.allow);
    }
    if (styled || visualClasses || helperClasses) {
      const first = out.find(
        (v) =>
          v.rule === 'ds-visual-css' ||
          (v.rule === 'ds-utility' && v.message.includes('visual utility'))
      );
      out.push({
        rule: 'ds-styled-local-component',
        file,
        line: first?.line ?? 1,
        message: `local component styles itself (${styled ? 'visual CSS in <style>' : 'visual utility classes'}); compose design-system components with layout classes instead`,
        wayOut: dsWayOut(options.designSystemId),
      });
    }
  } else {
    scanImports(text, add);
    scanClassHelpers(text, add, global);
    if (options.allow) scanLibraryImports(text, add, options.allow);
  }
  return out.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
}

const SCAN_EXTENSIONS = ['.svelte', '.ts', '.js', '.mjs', '.css'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'tests', '__tests__', 'coverage', 'build']);

export interface DsPrototypeScan {
  /** Workspace-relative POSIX paths of the files read. */
  files: string[];
  violations: DsViolation[];
}

function isScannable(name: string): boolean {
  return (
    SCAN_EXTENSIONS.some((ext) => name.endsWith(ext)) &&
    !name.endsWith('.d.ts') &&
    !/\.(?:test|spec)\.[cm]?[jt]s$/.test(name)
  );
}

/** Lists the files `check ds` reads: `src/**` (no `src/generated`) and top-level `*.css`. */
export function designSystemFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (abs: string, rel: string) => {
    let entries: string[];
    try {
      entries = readdirSync(abs).sort();
    } catch {
      return;
    }
    for (const name of entries) {
      if (name.startsWith('.') || SKIP_DIRS.has(name)) continue;
      const path = join(abs, name);
      const relPath = rel ? `${rel}/${name}` : name;
      if (relPath === 'src/generated') continue;
      const stat = lstatSync(path);
      // Symlinks are never followed: they could point outside the prototype.
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) walk(path, relPath);
      else if (stat.isFile() && isScannable(name)) out.push(path);
    }
  };
  const src = join(dir, 'src');
  if (existsSync(src) && !lstatSync(src).isSymbolicLink()) walk(src, 'src');
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (name.endsWith('.css') && lstatSync(path).isFile()) out.push(path);
  }
  return out;
}

/**
 * Scans one prototype folder. `root` makes reported paths workspace-relative.
 * With an allow context, the design system's library components the
 * prototype imports (`@ds/<id>/<Name>`) are scanned too, from
 * `design-systems/<id>/components/<Name>.svelte`, against `allow` and their
 * entry's `composes`.
 */
export function scanPrototypeDesignSystem(
  root: string,
  dir: string,
  options: { designSystemId?: string; allow?: DsAllowContext | null } = {}
): DsPrototypeScan {
  const files = designSystemFiles(dir);
  const sources = new Map<string, string>();
  for (const path of files) sources.set(path, readFileSync(path, 'utf8'));
  const localClasses = new Set<string>();
  for (const [path, source] of sources) {
    if (path.endsWith('.css')) {
      for (const c of definedClasses(stripComments(path, source))) localClasses.add(c);
    }
  }
  const violations: DsViolation[] = [];
  const read: string[] = [];
  const scanOptions: DsScanOptions = {
    localClasses,
    ...(options.designSystemId ? { designSystemId: options.designSystemId } : {}),
    ...(options.allow ? { allow: options.allow } : {}),
  };
  const used = new Set<string>();
  for (const [path, source] of sources) {
    const rel = relative(root, path).split(sep).join('/');
    read.push(rel);
    violations.push(...scanDesignSystemSource(rel, source, scanOptions));
    if (options.allow) {
      for (const m of stripComments(path, source).matchAll(DS_IMPORT)) {
        if (m[2] === options.allow.designSystemId && m[3]) used.add(m[3]);
      }
    }
  }
  const ctx = options.allow;
  if (ctx) {
    for (const name of [...used].sort()) {
      const entry = ctx.library.find((e) => e.name === name);
      if (!entry || !/^[A-Z][A-Za-z0-9]{0,63}$/.test(name)) continue;
      const path = join(root, 'design-systems', ctx.designSystemId, 'components', `${name}.svelte`);
      if (!existsSync(path) || !lstatSync(path).isFile()) continue;
      const rel = relative(root, path).split(sep).join('/');
      read.push(rel);
      violations.push(
        ...scanDesignSystemSource(rel, readFileSync(path, 'utf8'), {
          designSystemId: ctx.designSystemId,
          allow: { ...ctx, composes: entry.composes },
        })
      );
    }
  }
  return { files: read, violations };
}

/** Counts violations per rule (every rule present, zero included). */
export function countByRule(violations: readonly DsViolation[]): Record<DsRule, number> {
  const counts = Object.fromEntries(DS_RULES.map((r) => [r, 0])) as Record<DsRule, number>;
  for (const v of violations) counts[v.rule] += 1;
  return counts;
}
