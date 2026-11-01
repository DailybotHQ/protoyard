import { defineTheme, type Theme, type ThemePalette, tokenToCssVar } from '@protoyard/core';
import type { ApplicableDesignSystem } from '@texuli/tokens/design-system/apply';
import { applyDesignSystem, pickDesignSystemMode } from '@texuli/tokens/design-system/apply';
import type {
  CompiledDesignSystem,
  FromThemeLoss,
} from '@texuli/tokens/design-system/compile-core';
import type { DesignSystem, DesignSystemImportWarning } from '@texuli/tokens/design-system/import';
import { getTheme, type ResolvedMode, registerDesignSystemPainter } from './apply.ts';

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

/** What a prototype ships: the runtime's fields of a compiled design system, plus its name. */
export type ShippedDesignSystem = ApplicableDesignSystem &
  Pick<CompiledDesignSystem, 'name' | 'version' | 'modes' | 'hash'>;

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

/** Texuli role pins the compiler may refuse on an import, and how many passes to drop them. */
const ROLE_PIN = /^\$\.color\.roles\.(light|dark)\.([A-Za-z0-9]+)$/;
const IMPORT_PASSES = 6;

/**
 * A Protoyard theme as a design-system document (Texuli's `fromTheme`), with
 * what the document could not carry exactly. Adapter for Texuli gap G135:
 * `fromTheme` leaves out roles it expects the seed generator to reproduce
 * (for some seeds it does not: ocean's `surface`), and the compiler holds
 * `input` and `borderStrong` to 3:1, which most Protoyard themes do not
 * meet, while pinned roles are never moved. So every role of the theme is
 * pinned, and a pin the compiler refuses is dropped (the solver then picks a
 * value that passes) and listed in `losses`.
 */
export async function designSystemFromTheme(
  theme: Theme,
  options: { id?: string; name?: string } = {}
): Promise<{ document: DesignSystem; losses: FromThemeLoss[] }> {
  const [{ compileDesignSystem, fromThemeWithReport }, { toTexuliTheme }] = await Promise.all([
    import('@texuli/tokens/design-system/compile-core'),
    import('./texuli.ts'),
  ]);
  const texuliTheme = toTexuliTheme(theme);
  const report = fromThemeWithReport(texuliTheme, { id: options.id ?? theme.id });
  const document = structuredClone(report.document) as DesignSystem & {
    color: { roles: Record<ResolvedMode, Record<string, string>> };
  };
  const losses = [...report.losses];
  document.color = { ...document.color, roles: { ...document.color?.roles } } as never;
  for (const mode of ['light', 'dark'] as const) {
    const roles: Record<string, string> = { ...document.color.roles[mode] };
    for (const [role, value] of Object.entries(texuliTheme[mode])) {
      const color = typeof value === 'string' ? value : value?.default;
      if (!(role in roles) && typeof color === 'string') roles[role] = color;
    }
    document.color.roles[mode] = roles;
  }
  for (let pass = 0; pass < IMPORT_PASSES; pass += 1) {
    const compiled = compileDesignSystem(document, { trust: 'untrusted' });
    if (compiled.ok) break;
    const refused = refusals(compiled.errors).flatMap((issue) => {
      const match = ROLE_PIN.exec(issue.path ?? '');
      return match ? [{ mode: match[1] as ResolvedMode, role: match[2] as string, issue }] : [];
    });
    if (refused.length === 0) break;
    for (const { mode, role, issue } of refused) {
      if (!(role in document.color.roles[mode])) continue;
      delete document.color.roles[mode][role];
      losses.push({
        path: `$.color.roles.${mode}.${role}`,
        reason: `Recomputed by Texuli: ${issue.message}`,
      });
    }
  }
  return { document: options.name ? { ...document, name: options.name } : document, losses };
}

/** Loads a `texuli:<id>` base from Protoyard's theme library (built-ins first). */
async function loadProtoyardBase(ref: string): Promise<unknown> {
  const id = ref.startsWith('texuli:') ? ref.slice('texuli:'.length) : '';
  if (!ID.test(id)) return undefined;
  const [{ BUILTIN_THEMES }, library] = await Promise.all([
    import('./presets.ts'),
    import('./library/index.ts'),
  ]);
  // A document, not a Theme: Texuli would import a Theme base with plain
  // `fromTheme`, which refuses most Protoyard themes (G135).
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
  const shipped = shipDesignSystem(compiled);
  return { ok: true, compiled, shipped, theme: designSystemTheme(shipped) };
}

function compileIssueText(issue: Refusal): string {
  return `${issue.source ? `[${issue.source}] ` : ''}${issueText(issue)}`;
}

/** The fields of a compiled design system a prototype needs at run time (no report). */
export function shipDesignSystem(compiled: CompiledDesignSystem): ShippedDesignSystem {
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
  };
}

const PALETTE_KEYS = Object.keys(getTheme(undefined).light) as (keyof ThemePalette)[];

/**
 * The Protoyard theme a compiled design system paints as: every palette role
 * from the compiled `--tx-*` variable of the same name, the fonts, radius and
 * density. A mode the design system did not compile takes the mode Texuli
 * paints for it. Roles the compiler does not emit keep the default theme's.
 */
export function designSystemTheme(compiled: ShippedDesignSystem): Theme {
  const fallback = getTheme(undefined);
  const varsOf = (mode: ResolvedMode) => compiled.vars[pickDesignSystemMode(compiled, mode)] ?? {};
  const palette = (mode: ResolvedMode): ThemePalette => {
    const vars = varsOf(mode) as Record<string, string>;
    return Object.fromEntries(
      PALETTE_KEYS.map((key) => [key, vars[tokenToCssVar(key)] ?? fallback[mode][key]])
    ) as ThemePalette;
  };
  const light = varsOf('light') as Record<string, string>;
  const density = Number(light['--tx-density']);
  return defineTheme({
    id: compiled.id,
    name: (compiled.name || compiled.id).slice(0, 40),
    description: `Design system ${compiled.id}@${compiled.version}`,
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
 * A compiled design system as a Protoyard theme that paints with Texuli's
 * runtime: pass the result to `definePrototype({ themes })`, and every
 * appearance of that theme writes the compiled variables with
 * `applyDesignSystem` (light or dark, whichever the appearance resolves).
 * Component defaults (`components.<name>.defaults`) are not applied here;
 * tokens are.
 */
export function defineDesignSystemTheme(compiled: ShippedDesignSystem): Theme {
  const theme = designSystemTheme(compiled);
  registerDesignSystemPainter(theme.id, (target, mode) => {
    const dispose = applyDesignSystem(target, compiled, {
      mode,
      ...(compiled.variant ? { variant: compiled.variant } : {}),
    });
    const vars = compiled.vars[pickDesignSystemMode(compiled, mode)] ?? {};
    return { vars: { ...vars }, dispose };
  });
  return theme;
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
