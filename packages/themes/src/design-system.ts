import { defineTheme, type Theme, type ThemePalette, tokenToCssVar } from '@protoyard/core';
import type { ApplicableDesignSystem } from '@texuli/tokens/design-system/apply';
import { applyDesignSystem, pickDesignSystemMode } from '@texuli/tokens/design-system/apply';
import type {
  CompiledDesignSystem,
  FromThemeLoss,
} from '@texuli/tokens/design-system/compile-core';
import type { DesignSystem, DesignSystemImportWarning } from '@texuli/tokens/design-system/import';
import { getTheme, type ResolvedMode, registerDesignSystemPainter } from './apply.ts';
import { toTexuliTheme } from './texuli.ts';

/**
 * Design systems (PLAN_008 T-design-systems): Texuli's design-system document
 * (`format: "texuli/design-system"`), compiled to `--tx-*` variables by
 * `@texuli/tokens/design-system/compile-core` and painted by Texuli's
 * runtime (`applyDesignSystem`), behind a Protoyard theme id.
 *
 * - `createDesignSystem` builds a document from a brief or a few inputs
 *   (Texuli's `importBrand`), `designSystemFromTheme` from any Protoyard
 *   theme (Texuli's `fromTheme`), and `compileDesignSystemDocument`
 *   validates an untrusted document and compiles it. All three load Texuli's
 *   importer or compiler with `import()`, so a page that does not call them
 *   never downloads them.
 * - `defineDesignSystemTheme` turns a compiled design system into a
 *   Protoyard `Theme` (for pickers, Protoyard's own variables and the
 *   no-flash cache) and registers it, so `applyAppearance` paints the
 *   compiled variables with `applyDesignSystem` whenever that theme is used.
 *   It needs only the runtime (`@texuli/tokens/design-system/apply`).
 *
 * Deterministic: the same inputs give the same document, the same compiled
 * variables and the same hash.
 */

/**
 * What a prototype ships: the runtime's fields of a compiled design system,
 * plus its name and, when the document has one, its description.
 */
export type ShippedDesignSystem = ApplicableDesignSystem &
  Pick<CompiledDesignSystem, 'name' | 'version' | 'modes' | 'hash'> & {
    /** The document's description, shown by theme pickers. */
    description?: string;
  };

/** Options for {@link defineDesignSystemTheme}. */
export interface DesignSystemThemeOptions {
  /**
   * The base URL the document's relative font paths resolve against, so a
   * package can ship its own font files: `new URL('./fonts/', import.meta.url)`.
   * Default: the page's base URI.
   */
  fontBase?: string | URL;
  /**
   * One resolved URL per font file, keyed by the document's `src`
   * (`{ 'fonts/inter.woff2': new URL('./fonts/inter.woff2', import.meta.url) }`).
   * Use this in a Vite production build: a bundler only emits files it sees
   * named one by one, so a directory `fontBase` would 404. Wins over `fontBase`.
   */
  fontFiles?: Readonly<Record<string, string | URL>>;
  /** The theme's description in pickers. Default: the shipped description, then `Design system <id>@<version>`. */
  description?: string;
}

export type { DesignSystem };

/** The inputs of a design system made from a few choices. */
export interface DesignSystemInput {
  /** Lowercase kebab-case id (also the Protoyard theme id). */
  id: string;
  name?: string;
  /** A brand one-liner (`brand #4f46e5, font Inter, rounded, compact`); the flags below are added after it. */
  brief?: string;
  /** The brand seed color (hex). */
  brand?: string;
  secondary?: string;
  accent?: string;
  /** Body font family name (`Inter`). */
  font?: string;
  headingFont?: string;
  monoFont?: string;
  /** `sharp`, `rounded` or `pill`. */
  shape?: 'sharp' | 'rounded' | 'pill';
  /** Corner radius in px (overrides `shape`'s radius). */
  radius?: number;
  density?: 'dense' | 'compact' | 'comfortable' | 'spacious';
  motion?: 'none' | 'subtle' | 'standard' | 'expressive';
  contrast?: 'AA' | 'AAA';
}

export type DesignSystemDocumentResult =
  | { ok: true; document: DesignSystem; warnings: string[] }
  | { ok: false; errors: string[] };

export type DesignSystemCompileResult =
  | { ok: true; compiled: CompiledDesignSystem; shipped: ShippedDesignSystem; theme: Theme }
  | { ok: false; errors: string[] };

const ID = /^[a-z][a-z0-9-]*$/;

/**
 * The fields Protoyard reads from a Texuli refusal (`DesignSystemCompileIssue`).
 * Spelled out because the issue's base type lives in `@texuli/spec`, which
 * this package reaches only through `@texuli/tokens`.
 */
interface Refusal {
  path?: string;
  message: string;
  code?: string;
  source?: string;
}
const refusals = (errors: readonly unknown[]): Refusal[] => errors as Refusal[];
/** Characters a clause of Texuli's brand one-liner splits on. */
const CLAUSE_BREAK = /[,;\n\r]/;

/** One flag as a clause, refusing values that would split into a second clause. */
function clause(key: string, value: string | number | undefined): string[] {
  if (value === undefined || value === '') return [];
  const text = String(value).trim();
  if (CLAUSE_BREAK.test(text))
    throw new TypeError(`${key} cannot contain commas, semicolons or line breaks.`);
  return [`${key} ${text}`];
}

/** The brand one-liner for `input`: the brief, then each flag, so the flags win. */
export function designSystemBrief(input: DesignSystemInput): string {
  const parts = [
    ...(input.brief?.trim() ? [input.brief.trim()] : []),
    ...clause('brand', input.brand),
    ...clause('secondary', input.secondary),
    ...clause('accent', input.accent),
    ...clause('font', input.font),
    ...clause('heading font', input.headingFont),
    ...clause('mono font', input.monoFont),
    ...(input.shape ? [input.shape] : []),
    ...clause('radius', input.radius === undefined ? undefined : `${input.radius}px`),
    ...(input.density ? [input.density] : []),
    ...(input.motion ? [`motion ${input.motion}`] : []),
    ...(input.contrast ? [input.contrast] : []),
  ];
  return parts.join(', ');
}

function importWarning(warning: DesignSystemImportWarning): string {
  return `${warning.path ? `${warning.path}: ` : ''}${warning.message} (${warning.code})`;
}

function issueText(issue: { path?: string; message: string; code?: string }): string {
  return `${issue.path ? `${issue.path}: ` : ''}${issue.message}${issue.code ? ` (${issue.code})` : ''}`;
}

/**
 * A design-system document from a brief and a few inputs, with Texuli's
 * `importBrand` validated at `trust: 'untrusted'`. Never throws for a bad
 * value: it comes back as an error or a warning.
 */
export async function createDesignSystem(
  input: DesignSystemInput
): Promise<DesignSystemDocumentResult> {
  if (!ID.test(input.id))
    return { ok: false, errors: [`id "${input.id}" must be lowercase kebab-case.`] };
  let brief: string;
  try {
    brief = designSystemBrief(input);
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : String(error)] };
  }
  if (!brief)
    return {
      ok: false,
      errors: ['Give a brief or at least one input (for example a brand color).'],
    };
  const { importBrand } = await import('@texuli/tokens/design-system/import');
  const result = importBrand(brief, {
    trust: 'untrusted',
    id: input.id,
    ...(input.name ? { name: input.name } : {}),
  });
  if (!result.ok) return { ok: false, errors: result.errors.map(issueText) };
  return { ok: true, document: result.document, warnings: result.warnings.map(importWarning) };
}

/**
 * A Protoyard theme as a design-system document (Texuli's `fromThemeWithReport`),
 * with what the document could not carry exactly. Since Texuli 0.11.4 (G135)
 * the document always compiles: a role pin below the compiler's contrast
 * guarantee is dropped, the compiler derives that role, and the drop is listed
 * in `losses` (for the six built-ins: light `input`, dark `borderStrong` and
 * dark `input`).
 */
export async function designSystemFromTheme(
  theme: Theme,
  options: { id?: string; name?: string } = {}
): Promise<{ document: DesignSystem; losses: FromThemeLoss[] }> {
  const { fromThemeWithReport } = await import('@texuli/tokens/design-system/compile-core');
  const report = fromThemeWithReport(toTexuliTheme(theme), { id: options.id ?? theme.id });
  const document = withoutCopiedSidebarPrimary(report.document as DesignSystem);
  return {
    document: options.name ? { ...document, name: options.name } : document,
    losses: [...report.losses],
  };
}

/**
 * `fromTheme` pins `sidebarPrimary` as a copy of `primary` in every mode. When
 * the sidebar's fill is the primary (or close to it), that pin paints the
 * active item invisibly, and a pinned role is never moved by the compiler.
 * A copy carries no intent, so it is dropped and the compiler derives a
 * visible active fill (Dailybot G-027). A distinct value stays. Exported for tests.
 */
export function withoutCopiedSidebarPrimary(document: DesignSystem): DesignSystem {
  const color = (document as { color?: { roles?: Record<string, Record<string, unknown>> } }).color;
  const roles = color?.roles;
  if (!roles) return document;
  let changed = false;
  const next: Record<string, Record<string, unknown>> = {};
  for (const [mode, modeRoles] of Object.entries(roles)) {
    if (
      modeRoles &&
      typeof modeRoles.sidebarPrimary === 'string' &&
      modeRoles.sidebarPrimary === modeRoles.primary
    ) {
      const { sidebarPrimary: _copy, ...rest } = modeRoles;
      next[mode] = rest;
      changed = true;
    } else next[mode] = modeRoles;
  }
  return changed ? ({ ...document, color: { ...color, roles: next } } as DesignSystem) : document;
}

/** Loads a `texuli:<id>` base from Protoyard's theme library (built-ins first). */
async function loadProtoyardBase(ref: string): Promise<unknown> {
  const id = ref.startsWith('texuli:') ? ref.slice('texuli:'.length) : '';
  if (!ID.test(id)) return undefined;
  const [{ BUILTIN_THEMES }, library] = await Promise.all([
    import('./presets.ts'),
    import('./library/index.ts'),
  ]);
  // A document, not a Theme: the resolver imports a raw Theme base with the
  // plain bridge, which keeps a theme's low-contrast pins (Texuli 0.11.4 notes).
  const builtin = BUILTIN_THEMES.find((theme) => theme.id === id);
  if (builtin) return (await designSystemFromTheme(builtin)).document;
  if (!(await library.findLibraryThemeMeta(id))) return undefined;
  return (await designSystemFromTheme(await library.loadLibraryTheme(id))).document;
}

/**
 * Validates an untrusted design-system document with Texuli and compiles it
 * (`trust: 'untrusted'`: closed keys, CSS-safe values, no remote or `data:`
 * URLs, `extends` depth and cycles checked). A `texuli:<id>` base loads
 * from Protoyard's theme library. Returns the compiled design system, the
 * part a prototype ships and its Protoyard theme, or the refusals.
 */
export async function compileDesignSystemDocument(
  input: unknown,
  options: { modes?: readonly ResolvedMode[] } = {}
): Promise<DesignSystemCompileResult> {
  const { compileDesignSystem, resolveDesignSystemCore } = await import(
    '@texuli/tokens/design-system/compile-core'
  );
  const resolved = await resolveDesignSystemCore(input, {
    trust: 'untrusted',
    loadLibraryBase: loadProtoyardBase,
  });
  if (!resolved.ok) return { ok: false, errors: refusals(resolved.errors).map(compileIssueText) };
  const compiled = compileDesignSystem(resolved.document, {
    trust: 'untrusted',
    ...(options.modes ? { modes: options.modes } : {}),
  });
  if (!compiled.ok) return { ok: false, errors: refusals(compiled.errors).map(compileIssueText) };
  if (!ID.test(compiled.id)) {
    return {
      ok: false,
      errors: [`id "${compiled.id}" must be lowercase kebab-case to name a theme.`],
    };
  }
  const described = (resolved.document as { description?: unknown }).description;
  const shipped = shipDesignSystem(compiled, typeof described === 'string' ? described : undefined);
  return { ok: true, compiled, shipped, theme: designSystemTheme(shipped) };
}

function compileIssueText(issue: Refusal): string {
  return `${issue.source ? `[${issue.source}] ` : ''}${issueText(issue)}`;
}

/** The fields of a compiled design system a prototype needs at run time (no report). */
export function shipDesignSystem(
  compiled: CompiledDesignSystem,
  description?: string
): ShippedDesignSystem {
  const text = description?.trim();
  return {
    id: compiled.id,
    name: compiled.name,
    version: compiled.version,
    modes: [...compiled.modes],
    ...(compiled.variant ? { variant: compiled.variant } : {}),
    vars: compiled.vars,
    attrs: compiled.attrs,
    fontFaces: compiled.fontFaces,
    defaults: compiled.defaults,
    hash: compiled.hash,
    ...(text ? { description: text.slice(0, 200) } : {}),
  };
}

/**
 * The Protoyard theme a compiled design system paints as: every palette role
 * from the compiled `--tx-*` variable of the same name, the fonts, radius and
 * density. A mode the design system did not compile takes the mode Texuli
 * paints for it. Roles the compiler does not emit keep the default theme's.
 */
export function designSystemTheme(compiled: ShippedDesignSystem): Theme {
  // Inside the function: a module-level call would keep this module in every bundle.
  const fallback = getTheme(undefined);
  const keys = Object.keys(fallback.light) as (keyof ThemePalette)[];
  const varsOf = (mode: ResolvedMode) => compiled.vars[pickDesignSystemMode(compiled, mode)] ?? {};
  const palette = (mode: ResolvedMode): ThemePalette => {
    const vars = varsOf(mode) as Record<string, string>;
    return Object.fromEntries(
      keys.map((key) => [key, vars[tokenToCssVar(key)] ?? fallback[mode][key]])
    ) as ThemePalette;
  };
  const light = varsOf('light') as Record<string, string>;
  const density = Number(light['--tx-density']);
  return defineTheme({
    id: compiled.id,
    name: (compiled.name || compiled.id).slice(0, 40),
    description: (
      compiled.description?.trim() || `Design system ${compiled.id}@${compiled.version}`
    ).slice(0, 200),
    ...(light['--tx-font-sans'] ? { fontFamily: light['--tx-font-sans'] } : {}),
    ...(light['--tx-font-heading'] ? { fontFamilyHeading: light['--tx-font-heading'] } : {}),
    ...(light['--tx-font-mono'] ? { fontFamilyMono: light['--tx-font-mono'] } : {}),
    ...(light['--tx-radius'] ? { radius: light['--tx-radius'] } : {}),
    ...(Number.isFinite(density) ? { density: Math.min(1.25, Math.max(0.75, density)) } : {}),
    light: palette('light'),
    dark: palette('dark'),
  });
}

/**
 * Every compiled `--tx-*` variable of one mode, including the ones a Protoyard
 * `Theme` has no role for (`--tx-ext-*`, component and type tokens): what the
 * painter writes. A mode the design system did not compile gives the mode
 * Texuli paints for it. A fresh object; changing it changes nothing else.
 */
export function designSystemVars(
  compiled: Pick<ShippedDesignSystem, 'vars'>,
  mode: ResolvedMode
): Record<string, string> {
  return {
    ...((compiled.vars[pickDesignSystemMode(compiled, mode)] ?? {}) as Record<string, string>),
  };
}

/**
 * A compiled design system as a Protoyard theme that paints with Texuli's
 * runtime: pass the result to `definePrototype({ themes })`, and every
 * appearance of that theme writes the compiled variables with
 * `applyDesignSystem` (light or dark, whichever the appearance resolves).
 * Component defaults (`components.<name>.defaults`) are not applied here;
 * tokens are. `options.fontBase` lets a package ship the document's font
 * files (relative `src` paths resolve against it), and `options.description`
 * overrides the description pickers show.
 */
export function defineDesignSystemTheme(
  compiled: ShippedDesignSystem,
  options: DesignSystemThemeOptions = {}
): Theme {
  const description = options.description?.trim();
  const theme = designSystemTheme(description ? { ...compiled, description } : compiled);
  const fontBase = options.fontBase === undefined ? undefined : String(options.fontBase);
  const fontFiles = options.fontFiles;
  registerDesignSystemPainter(theme.id, (target, mode) => {
    const fonts = fontFiles
      ? rebaseFontFaces(compiled, fontFiles, fontBase ?? target.ownerDocument.baseURI)
      : { compiled, base: fontBase };
    const dispose = applyDesignSystem(target, fonts.compiled, {
      mode,
      ...(compiled.variant ? { variant: compiled.variant } : {}),
      ...(fonts.base ? { base: fonts.base } : {}),
    });
    const vars = compiled.vars[pickDesignSystemMode(compiled, mode)] ?? {};
    return { vars: { ...vars }, dispose };
  });
  return theme;
}

/**
 * Texuli resolves every font `src` (a relative path, never `..`) against one
 * `base` on the page's origin. Bundled files land wherever the bundler puts
 * them, so this resolves each face (mapped files first, the rest against
 * `fallbackBase`), takes their common directory as the base and rewrites each
 * `src` relative to it. Faces on another origin, and inline `data:` faces,
 * are left as they are. Exported for tests.
 */
export function rebaseFontFaces(
  compiled: ShippedDesignSystem,
  files: Readonly<Record<string, string | URL>>,
  fallbackBase: string
): { compiled: ShippedDesignSystem; base: string | undefined } {
  const page = new URL(fallbackBase);
  const resolved = compiled.fontFaces.map((face) => {
    if (face.inline) return null;
    const mapped = files[face.src];
    try {
      return new URL(String(mapped ?? face.src), mapped ? page : fallbackBase);
    } catch {
      return null;
    }
  });
  const sameOrigin = resolved.filter(
    (url): url is URL => url !== null && url.origin === page.origin
  );
  if (sameOrigin.length === 0) return { compiled, base: undefined };
  let dir = sameOrigin[0]?.pathname.replace(/[^/]*$/, '') ?? '/';
  for (const url of sameOrigin) {
    while (!url.pathname.startsWith(dir)) dir = dir.replace(/[^/]*\/$/, '');
  }
  const base = `${page.origin}${dir}`;
  const fontFaces = compiled.fontFaces.map((face, index) => {
    const url = resolved[index];
    return url && url.origin === page.origin
      ? { ...face, src: url.pathname.slice(dir.length) }
      : face;
  });
  return { compiled: { ...compiled, fontFaces }, base };
}

/** Removes a design system registered with {@link defineDesignSystemTheme}. */
export function forgetDesignSystemTheme(themeId: string): void {
  registerDesignSystemPainter(themeId, undefined);
}

export type DesignSystemExportFormat = 'css' | 'tailwind' | 'json';

/** A compiled design system as CSS variables, a Tailwind preset (JSON) or compiled JSON (Texuli's emitters). */
export async function exportDesignSystem(
  compiled: CompiledDesignSystem,
  format: DesignSystemExportFormat
): Promise<string> {
  const emit = await import('@texuli/tokens/design-system/emit');
  if (format === 'tailwind') return emit.emitTailwindPresetJson(compiled);
  if (format === 'json') return emit.emitCompiledJson(compiled);
  return emit.emitCss(compiled);
}

/** Per compiled mode: how many of the compiler's contrast pairs passed, and the failures. */
export function designSystemContrast(
  compiled: CompiledDesignSystem
): Partial<Record<ResolvedMode, { passed: number; total: number; failures: string[] }>> {
  const summary: Partial<
    Record<ResolvedMode, { passed: number; total: number; failures: string[] }>
  > = {};
  for (const mode of compiled.modes) {
    const pairs = compiled.report.contrast[mode] ?? [];
    summary[mode] = {
      passed: pairs.filter((pair) => pair.pass).length,
      total: pairs.length,
      failures: pairs
        .filter((pair) => !pair.pass)
        .map((pair) => `${pair.foreground} on ${pair.background}: ${pair.ratio}:1`),
    };
  }
  return summary;
}
