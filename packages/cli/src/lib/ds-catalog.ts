import { createRequire } from 'node:module';
import type { ManifestGroup } from '@texuli/catalog/build';
import * as texuliDesignSystem from '@texuli/spec/design-system';
import {
  checkDesignSystemAllow,
  type DesignSystemAllow,
  type DesignSystemAllowCatalog,
  type DesignSystemAllowEntry,
  type DesignSystemIssue,
  fullAllowEntry,
  type LockedPreset,
  lockedAllowPreset,
  validateDesignSystem,
} from '@texuli/spec/design-system';
import {
  CATALOG_EXTENSIONS,
  type CatalogExtensionManifest,
  isExtensionId,
  type MergeRefusal,
  mergeCatalogManifests,
} from './ds-extensions/index.ts';

/**
 * The Texuli component catalog as locked design systems read it (PLAN_013
 * T-tx015): the allow catalog `checkDesignSystemAllow` and
 * `initLockedDesignSystem` take, the axes (axis → prop name and values) the
 * `ds-disabled-value` rule needs, and the mapper from an imported Svelte
 * component to a catalog id.
 *
 * Everything comes from `@texuli/catalog/manifests/all`; nothing here lists
 * components by hand.
 *
 * ## The mapper (one function: {@link catalogIdFor})
 *
 * 1. When a manifest lists `imports: [{ module, exports }]` (Texuli's catalog
 *    adds them), an import maps by the exact `(module, export name)` pair.
 *    From then on a Texuli module never falls back to names: an export the
 *    catalog does not list is `unmapped`.
 * 2. Until then, by name (identifier = the export name, or the local name of a
 *    default import):
 *    - `exact`: the catalog id whose PascalCase equals the identifier
 *      (`AlertDialog` → `alert-dialog`); the import's own package first.
 *    - `package`: the package's id prefix plus the identifier, for packages
 *      whose ids carry their name (`Grid` from `@texuli/data` → `data-grid`).
 *    - `prefix`: the longest id whose PascalCase is a prefix of the identifier
 *      at a word boundary (`CardHeader` → `card`, `SelectTrigger` →
 *      `select-trigger`, `Selector` → nothing).
 *    - otherwise `unmapped`.
 *
 * `@protoyard/ui` re-exports Texuli's styled components: those map the same
 * way, by name (or by export name alone when the catalog lists imports and
 * the name is unique there). Its own components carry catalog extension
 * manifests (`./ds-extensions/`): an import listed there maps first, by the
 * exact `(module, export name)` pair, to the namespaced id
 * (`DataTable` → `protoyard:data-table`; `how: 'extension'`).
 *
 * ## Extensions and the installed Texuli
 *
 * The catalog merges the extensions with Texuli's `mergeCatalogs` when the
 * installed `@texuli/spec/design-system` exports it (drop 2), else with the
 * local {@link mergeCatalogManifests} (same refusal rules). Texuli's
 * structural validator of drop 1 still refuses namespaced `allow` keys, so
 * until it accepts them ({@link namespacedAllowKeys}) the document Texuli
 * validates, compiles and approves is {@link texuliView}: extension keys left
 * out of `allow` (they are checked here, against the merged catalog), and an
 * extension in a library entry's `composes` replaced by the Texuli ids it
 * composes. Temporary; it becomes the identity once Texuli accepts them.
 */

export const DS_AXES = ['variant', 'size', 'tone', 'density'] as const;
export type DsAxis = (typeof DS_AXES)[number];
/** The allow-entry list of each axis. */
export const AXIS_LIST: Record<DsAxis, 'variants' | 'sizes' | 'tones' | 'densities'> = {
  variant: 'variants',
  size: 'sizes',
  tone: 'tones',
  density: 'densities',
};

export interface CatalogImport {
  module: string;
  exports: readonly string[];
}

/** The fields of a catalog manifest this module reads (drop 2 adds `imports`). */
export interface CatalogManifestLike {
  id: string;
  package: string;
  props?: readonly { name: string; enumValues?: readonly string[] }[];
  axes?: Readonly<Partial<Record<DsAxis, string>>>;
  states?: readonly string[];
  related?: readonly string[];
  imports?: readonly CatalogImport[];
  /** Extensions only: the Texuli ids the component renders. */
  composes?: readonly string[];
}

export interface DsCatalogComponent {
  id: string;
  package: string;
  /** PascalCase of the id. */
  pascal: string;
  /** Axis → the prop that drives it and its values. */
  axes: Partial<Record<DsAxis, { prop: string; values: readonly string[] }>>;
  states: readonly string[];
  related: readonly string[];
  /** Set for a catalog extension (`protoyard:data-table`): the Texuli ids it renders. */
  composes?: readonly string[];
}

export interface DsCatalog {
  components: readonly DsCatalogComponent[];
  byId: ReadonlyMap<string, DsCatalogComponent>;
  /** What `checkDesignSystemAllow` and `initLockedDesignSystem` take (extensions included). */
  allowCatalog: DesignSystemAllowCatalog;
  /** The Texuli components only. */
  texuliAllowCatalog: DesignSystemAllowCatalog;
  /** The merged catalog extensions. */
  extensions: readonly DsCatalogComponent[];
  /** Extensions the merge refused (left out). Empty for the shipped data. */
  extensionRefusals: readonly MergeRefusal[];
  /** True when at least one Texuli manifest lists its imports (exact mapping). */
  hasImports: boolean;
  /** `module\0export` → Texuli id. */
  importIndex: ReadonlyMap<string, string>;
  /** `module\0export` → extension id. */
  extensionImportIndex: ReadonlyMap<string, string>;
  /** Modules extensions import from (governed like Texuli's: `@protoyard/ui`, `@acme/ui`). */
  extensionModules: ReadonlySet<string>;
  /** export name → id, or null when two ids export the same name. */
  exportIndex: ReadonlyMap<string, string | null>;
  /** package → the id prefix every id of that package shares (`data-`), if any. */
  packagePrefix: ReadonlyMap<string, string>;
}

export type CatalogMatch =
  | { id: string; how: 'extension' | 'import' | 'exact' | 'package' | 'prefix' }
  | { id: null; how: 'unmapped' };

export function pascalCase(id: string): string {
  return id
    .split('-')
    .map((part) => (part ? `${part[0]?.toUpperCase()}${part.slice(1)}` : ''))
    .join('');
}

/** `StatusPill` → `status-pill` (a library entry id). */
export function kebabCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

function isImportList(value: unknown): value is CatalogImport[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item &&
        typeof item === 'object' &&
        typeof (item as CatalogImport).module === 'string' &&
        Array.isArray((item as CatalogImport).exports) &&
        (item as CatalogImport).exports.every((name) => typeof name === 'string')
    )
  );
}

function allowCatalogOf(components: readonly DsCatalogComponent[]): DesignSystemAllowCatalog {
  return {
    components: components.map((c) => ({
      id: c.id,
      axes: Object.fromEntries(
        Object.entries(c.axes).map(([axis, value]) => [axis, { values: value.values }])
      ),
      states: c.states,
    })),
  };
}

/**
 * Builds the catalog view from manifests (exported for tests with fake
 * manifests). A manifest with a namespaced id and `composes` is a catalog
 * extension; pass the merged list ({@link mergeCatalogManifests}).
 */
export function catalogFromManifests(
  manifests: readonly CatalogManifestLike[],
  extensionRefusals: readonly MergeRefusal[] = []
): DsCatalog {
  const components: DsCatalogComponent[] = [];
  const byId = new Map<string, DsCatalogComponent>();
  const importIndex = new Map<string, string>();
  const extensionImportIndex = new Map<string, string>();
  const exportIndex = new Map<string, string | null>();
  let hasImports = false;
  for (const manifest of manifests) {
    if (byId.has(manifest.id)) continue;
    const extension = isExtensionId(manifest.id);
    const axes: DsCatalogComponent['axes'] = {};
    for (const axis of DS_AXES) {
      const prop = manifest.axes?.[axis];
      if (!prop) continue;
      const values = manifest.props?.find((p) => p.name === prop)?.enumValues ?? [];
      axes[axis] = { prop, values: [...values] };
    }
    const component: DsCatalogComponent = {
      id: manifest.id,
      package: manifest.package,
      pascal: pascalCase(manifest.id),
      axes,
      states: [...(manifest.states ?? [])],
      related: [...(manifest.related ?? [])],
      ...(extension ? { composes: [...(manifest.composes ?? [])] } : {}),
    };
    components.push(component);
    byId.set(component.id, component);
    const imports = (manifest as { imports?: unknown }).imports;
    if (!isImportList(imports) || imports.length === 0) continue;
    if (extension) {
      for (const entry of imports) {
        for (const name of entry.exports) {
          extensionImportIndex.set(`${entry.module}\0${name}`, component.id);
        }
      }
      continue;
    }
    hasImports = true;
    for (const entry of imports) {
      for (const name of entry.exports) {
        importIndex.set(`${entry.module}\0${name}`, component.id);
        const seen = exportIndex.get(name);
        exportIndex.set(name, seen === undefined || seen === component.id ? component.id : null);
      }
    }
  }
  const texuli = components.filter((c) => !c.composes);
  const packagePrefix = new Map<string, string>();
  const byPackage = new Map<string, string[]>();
  for (const c of texuli) byPackage.set(c.package, [...(byPackage.get(c.package) ?? []), c.id]);
  for (const [pkg, ids] of byPackage) {
    const short = pkg.replace(/^@texuli\//, '');
    if (short !== pkg && ids.every((id) => id.startsWith(`${short}-`))) {
      packagePrefix.set(pkg, `${short}-`);
    }
  }
  return {
    components,
    byId,
    allowCatalog: allowCatalogOf(components),
    texuliAllowCatalog: allowCatalogOf(texuli),
    extensions: components.filter((c) => c.composes),
    extensionRefusals,
    hasImports,
    importIndex,
    extensionImportIndex,
    extensionModules: new Set(
      [...extensionImportIndex.keys()].map((key) => key.split('\0')[0] ?? '')
    ),
    exportIndex,
    packagePrefix,
  };
}

type TexuliMerge = (texuli: unknown, extensions: unknown) => unknown;

/**
 * Texuli's `mergeCatalogs` when the installed `@texuli/spec/design-system`
 * exports it (drop 2), read through the namespace so drop 1 still loads.
 */
function texuliMergeCatalogs(): TexuliMerge | undefined {
  const merge = (texuliDesignSystem as Record<string, unknown>).mergeCatalogs;
  return typeof merge === 'function' ? (merge as TexuliMerge) : undefined;
}

/**
 * Texuli manifests plus `extensions`. The manifests (props, axes, imports)
 * come from the local merge, which the mapper needs. When the installed
 * `@texuli/spec` exports `mergeCatalogs(texuli, extensions)` (drop 2:
 * `{ ok, catalog, extensions, issues }` over the spec catalog), its `issues`
 * are reported too and an extension it refuses is left out, so Texuli's
 * rules (namespace, collisions, composes, CATALOG_EXTENSION_LIMITS) decide.
 */
export function mergeWithExtensions(
  texuli: readonly CatalogManifestLike[],
  extensions: readonly CatalogExtensionManifest[] = CATALOG_EXTENSIONS
): { manifests: readonly CatalogManifestLike[]; refusals: readonly MergeRefusal[] } {
  const local = mergeCatalogManifests(texuli, extensions);
  const merge = texuliMergeCatalogs();
  if (!merge) return { manifests: local.manifests, refusals: local.refusals };
  let result: unknown;
  try {
    result = merge({ components: texuli }, extensions);
  } catch (error) {
    return {
      manifests: local.manifests,
      refusals: [
        ...local.refusals,
        { code: 'id-collision', id: '*', path: '$', message: (error as Error).message },
      ],
    };
  }
  const issues = record(result)?.issues;
  const texuliRefusals: MergeRefusal[] = Array.isArray(issues)
    ? issues.map((issue) => {
        const e = record(issue) ?? {};
        return {
          code: (typeof e.code === 'string' ? e.code : 'id-collision') as MergeRefusal['code'],
          id: typeof e.id === 'string' ? e.id : '*',
          path: typeof e.path === 'string' ? e.path : '$',
          message: typeof e.message === 'string' ? e.message : 'Refused by mergeCatalogs.',
        };
      })
    : [];
  // Leave out every extension Texuli refused (its issue paths name the extension index).
  const refusedIndexes = new Set(
    texuliRefusals
      .map((r) => /^\$?\.?extensions\[(\d+)\]/.exec(r.path)?.[1])
      .filter((i): i is string => i !== undefined)
      .map(Number)
  );
  const refusedIds = new Set(
    extensions.filter((_, i) => refusedIndexes.has(i)).map((extension) => extension.id)
  );
  return {
    manifests: local.manifests.filter((manifest) => !refusedIds.has(manifest.id)),
    refusals: [...local.refusals, ...texuliRefusals],
  };
}

let cached: DsCatalog | undefined;

/**
 * The catalog of the installed `@texuli/catalog` merged with the catalog
 * extensions (built once per process). The manifests (about 0.5 MB of
 * modules) load on first use with a synchronous `require` (Node 24 loads ES
 * modules that way), so commands that never read a design system's allow
 * section do not pay for them.
 */
export function dsCatalog(): DsCatalog {
  if (!cached) {
    const { ALL_MANIFEST_GROUPS } = createRequire(import.meta.url)(
      '@texuli/catalog/manifests/all'
    ) as { ALL_MANIFEST_GROUPS: readonly ManifestGroup[] };
    const merged = mergeWithExtensions(
      ALL_MANIFEST_GROUPS.flatMap((group) => group.manifests) as readonly CatalogManifestLike[]
    );
    cached = catalogFromManifests(merged.manifests, merged.refusals);
  }
  return cached;
}

const TEXULI_MODULE = /^(?:texuli|@texuli\/[a-z0-9-]+)(?:\/[\w./-]+)?$/;
const PROTOYARD_UI_MODULE = /^@protoyard\/ui(?:\/[\w./-]+)?$/;

/** `texuli`, `texuli/<sub>` or `@texuli/<pkg>[/<sub>]`. */
export function isTexuliModule(module: string): boolean {
  return TEXULI_MODULE.test(module);
}

/** A module whose Svelte components the allow rules govern: Texuli's and `@protoyard/ui`. */
export function isGovernedModule(module: string): boolean {
  return isTexuliModule(module) || PROTOYARD_UI_MODULE.test(module);
}

/** The catalog `package` of a Texuli module (`texuli/card` → `texuli`), or null. */
export function packageOf(module: string): string | null {
  if (!isTexuliModule(module)) return null;
  const scoped = /^(@texuli\/[a-z0-9-]+)/.exec(module);
  return scoped?.[1] ?? 'texuli';
}

function boundaryPrefix(identifier: string, prefix: string): boolean {
  if (!prefix || prefix.length >= identifier.length || !identifier.startsWith(prefix)) return false;
  return /[A-Z0-9]/.test(identifier[prefix.length] ?? '');
}

function byName(catalog: DsCatalog, pkg: string | null, identifier: string): CatalogMatch {
  // Names reach Texuli ids only; an extension maps by its imports.
  const texuli = catalog.components.filter((c) => !c.composes);
  const same = (c: DsCatalogComponent) => pkg === null || c.package === pkg;
  const pools = pkg === null ? [texuli] : [texuli.filter(same), texuli];
  for (const pool of pools) {
    const exact = pool.find((c) => c.pascal === identifier);
    if (exact) return { id: exact.id, how: 'exact' };
  }
  // The package's id prefix: `Grid` from @texuli/data → `data-grid`.
  const prefixes =
    pkg === null ? [...catalog.packagePrefix] : [[pkg, catalog.packagePrefix.get(pkg)]];
  for (const [owner, prefix] of prefixes) {
    if (!prefix || !owner) continue;
    const qualified = `${pascalCase(prefix.slice(0, -1))}${identifier}`;
    const hit = texuli.find((c) => c.package === owner && c.pascal === qualified);
    if (hit) return { id: hit.id, how: 'package' };
  }
  for (const pool of pools) {
    let best: DsCatalogComponent | undefined;
    for (const c of pool) {
      const candidates = [c.pascal];
      const prefix = catalog.packagePrefix.get(c.package);
      if (prefix && c.id.startsWith(prefix)) candidates.push(pascalCase(c.id.slice(prefix.length)));
      for (const candidate of candidates) {
        if (
          boundaryPrefix(identifier, candidate) &&
          (!best || c.pascal.length > best.pascal.length)
        )
          best = c;
      }
    }
    if (best) return { id: best.id, how: 'prefix' };
  }
  return { id: null, how: 'unmapped' };
}

/**
 * The catalog id of an imported Svelte component: `module` is the import
 * specifier, `identifier` the export name (or the local name of a default
 * import). The one place the mapping lives; see the module comment.
 */
export function catalogIdFor(catalog: DsCatalog, module: string, identifier: string): CatalogMatch {
  const extension = catalog.extensionImportIndex.get(`${module}\0${identifier}`);
  if (extension) return { id: extension, how: 'extension' };
  if (!isGovernedModule(module)) return { id: null, how: 'unmapped' };
  if (catalog.hasImports) {
    const direct = catalog.importIndex.get(`${module}\0${identifier}`);
    if (direct) return { id: direct, how: 'import' };
    if (isTexuliModule(module)) return { id: null, how: 'unmapped' };
    const unique = catalog.exportIndex.get(identifier);
    if (unique) return { id: unique, how: 'import' };
  }
  return byName(catalog, packageOf(module), identifier);
}

/**
 * Whether `id` is a part of `parent` in the catalog: its id extends the
 * parent's (`select-trigger` of `select`) and its manifest relates it to the
 * parent or to another part of it. `alert-dialog` is not a part of `alert`:
 * it relates to `dialog`.
 */
export function isPartOf(catalog: DsCatalog, id: string, parent: string): boolean {
  if (!id.startsWith(`${parent}-`)) return false;
  const component = catalog.byId.get(id);
  if (!component) return false;
  return component.related.some((r) => r === parent || r.startsWith(`${parent}-`));
}

/** The allowed id that covers `id` (itself, or a parent it is a part of), or null. */
export function allowedVia(
  catalog: DsCatalog,
  allowed: Iterable<string>,
  id: string
): string | null {
  const ids = new Set(allowed);
  if (ids.has(id)) return id;
  let best: string | null = null;
  for (const parent of ids) {
    if (isPartOf(catalog, id, parent) && (!best || parent.length > best.length)) best = parent;
  }
  return best;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** The document's `allow` section, or null when it has none (the document is not locked). */
export function readAllow(document: unknown): DesignSystemAllow | null {
  const allow = record(record(document)?.allow);
  return allow ? (allow as DesignSystemAllow) : null;
}

export interface LibraryEntryLike {
  id: string;
  name: string;
  purpose: string;
  version: string;
  status: 'draft' | 'approved';
  composes: string[];
  approval?: DocumentApproval;
}

/** The document's `library` entries (well-formed ones only). */
export function readLibrary(document: unknown): LibraryEntryLike[] {
  const library = record(document)?.library;
  if (!Array.isArray(library)) return [];
  return library.filter(
    (entry): entry is LibraryEntryLike =>
      Boolean(record(entry)) &&
      typeof entry.id === 'string' &&
      typeof entry.name === 'string' &&
      Array.isArray(entry.composes)
  );
}

export interface DocumentApproval {
  status: 'draft' | 'approved';
  version: string;
  approvedBy?: string;
  approvedAt?: string;
  contentHash?: string;
}

/** The document's own `approval` section (spec 0.13.0), or null. */
export function readDocumentApproval(document: unknown): DocumentApproval | null {
  const approval = record(record(document)?.approval);
  if (!approval) return null;
  if (approval.status !== 'draft' && approval.status !== 'approved') return null;
  if (typeof approval.version !== 'string') return null;
  const out: DocumentApproval = { status: approval.status, version: approval.version };
  for (const key of ['approvedBy', 'approvedAt', 'contentHash'] as const) {
    if (typeof approval[key] === 'string') out[key] = approval[key] as string;
  }
  return out;
}

/**
 * `checkDesignSystemAllow` against the merged catalog (Texuli plus the
 * extensions): an extension key (`protoyard:data-table`) is a member when the
 * merge accepted it, and its axis values and states are checked like any
 * other. Membership never depends on Texuli's key pattern, so this holds on
 * drop 1 and drop 2 alike.
 */
export function checkAllow(
  document: unknown,
  catalog: DsCatalog = dsCatalog()
): {
  ok: boolean;
  errors: readonly DesignSystemIssue[];
} {
  return checkDesignSystemAllow(document, catalog.allowCatalog);
}

let namespacedKeys: boolean | undefined;

/**
 * Whether the installed Texuli validator accepts a namespaced `allow` key
 * (`protoyard:data-table`). Drop 1 refuses them (keys are kebab-case); drop 2
 * widens the pattern. Probed once with a throwaway document.
 */
export function namespacedAllowKeys(): boolean {
  if (namespacedKeys === undefined) {
    const probe = validateDesignSystem(
      {
        format: 'texuli/design-system',
        formatVersion: texuliDesignSystem.DESIGN_SYSTEM_FORMAT_VERSION,
        id: 'probe',
        version: '0.1.0',
        name: 'Probe',
        color: { brand: { seed: '#4f46e5' } },
        allow: { 'probe:probe': {} },
      },
      { trust: 'untrusted' }
    );
    namespacedKeys = !(
      probe.ok === false && probe.errors.some((e) => e.path.startsWith('$.allow'))
    );
  }
  return namespacedKeys;
}

/**
 * The document as the installed Texuli validates, compiles and approves it.
 * When Texuli accepts namespaced keys it is the document itself. Until then
 * (temporary, Texuli drop 1): extension keys are left out of `allow`
 * ({@link checkAllow} checks them against the merged catalog), and an
 * extension in a library entry's `composes` is replaced by the Texuli ids it
 * composes. Never mutates `document`.
 */
export function texuliView<T>(document: T, catalog: DsCatalog = dsCatalog()): T {
  if (namespacedAllowKeys()) return document;
  const doc = record(document);
  if (!doc) return document;
  const out: Record<string, unknown> = { ...doc };
  const allow = record(doc.allow);
  if (allow && Object.keys(allow).some(isExtensionId)) {
    out.allow = Object.fromEntries(Object.entries(allow).filter(([key]) => !isExtensionId(key)));
  }
  if (Array.isArray(doc.library)) {
    out.library = doc.library.map((entry) => {
      const item = record(entry);
      if (!item || !Array.isArray(item.composes) || !item.composes.some(isExtensionKey)) {
        return entry;
      }
      const flat = new Set<string>();
      for (const id of item.composes as unknown[]) {
        if (typeof id !== 'string') continue;
        if (!isExtensionId(id)) flat.add(id);
        else for (const part of catalog.byId.get(id)?.composes ?? []) flat.add(part);
      }
      return { ...item, composes: [...flat] };
    });
  }
  return out as T;
}

function isExtensionKey(value: unknown): boolean {
  return typeof value === 'string' && isExtensionId(value);
}

/** True for an extension key of an allow section (`protoyard:data-table`). */
export function isExtensionAllowKey(key: string): boolean {
  return isExtensionId(key);
}

/** The extension entries of an allow section (namespaced keys), in order. */
export function extensionAllow(allow: DesignSystemAllow | null | undefined): DesignSystemAllow {
  if (!allow) return {};
  return Object.fromEntries(Object.entries(allow).filter(([key]) => isExtensionId(key)));
}

/** `allow` with every key sorted by id (Texuli's preset order), extensions included. */
export function sortedAllow(allow: DesignSystemAllow): DesignSystemAllow {
  return Object.fromEntries(
    Object.entries(allow).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  ) as DesignSystemAllow;
}

/**
 * Whether every id an extension composes is covered by `allowed` (itself or
 * a parent it is a part of). An extension that composes nothing the catalog
 * knows is not covered.
 */
export function extensionCoveredBy(
  catalog: DsCatalog,
  extension: DsCatalogComponent,
  allowed: Iterable<string>
): boolean {
  const ids = [...allowed];
  const composes = extension.composes ?? [];
  return composes.length > 0 && composes.every((id) => allowedVia(catalog, ids, id) !== null);
}

/**
 * An allow preset over the merged catalog: `all` lists every Texuli
 * component and every extension; `minimal` lists Texuli's minimal set and
 * the extensions whose `composes` that set covers (a part counts through its
 * parent: `select-trigger` through `select`). Keys sorted by id.
 */
export function allowPreset(
  preset: LockedPreset,
  catalog: DsCatalog = dsCatalog()
): DesignSystemAllow {
  const texuli = lockedAllowPreset(catalog.texuliAllowCatalog, preset);
  const minimal = Object.keys(texuli);
  const extensions: Record<string, DesignSystemAllowEntry> = {};
  for (const extension of catalog.extensions) {
    if (preset === 'minimal' && !extensionCoveredBy(catalog, extension, minimal)) continue;
    const entry = catalog.allowCatalog.components.find((c) => c.id === extension.id);
    if (entry) extensions[extension.id] = fullAllowEntry(entry);
  }
  return sortedAllow({ ...texuli, ...extensions });
}

/** One issue as `code at path`. */
export function formatIssue(issue: Pick<DesignSystemIssue, 'path'> & { code: string }): string {
  return `${issue.code} at ${issue.path}`;
}

/** The enabled values of one axis for one allow entry, or null when every value is enabled. */
export function enabledValues(
  entry: DesignSystemAllowEntry | undefined,
  axis: DsAxis
): readonly string[] | null {
  const list = entry?.[AXIS_LIST[axis]];
  return Array.isArray(list) ? list : null;
}

/** An import statement's names, as the scanner reads them. */
export interface ImportedName {
  /** The name the file uses. */
  local: string;
  /** The exported name (`default` imports use the local name). */
  exported: string;
  module: string;
  namespace?: boolean;
}

const IMPORT_STATEMENT =
  /\bimport\s+(?!type\b)([\w$]+\s*,\s*)?(?:\{([^}]*)\}|\*\s+as\s+([\w$]+)|([\w$]+))?\s*from\s*(['"])([^'"\n]+)\5/g;

/** The value imports of a script (type-only imports and names are skipped). */
export function importedNames(script: string): ImportedName[] {
  const out: ImportedName[] = [];
  for (const m of script.matchAll(IMPORT_STATEMENT)) {
    const module = m[6] ?? '';
    const leadingDefault = m[1]?.replace(/[\s,]/g, '');
    if (leadingDefault) out.push({ local: leadingDefault, exported: leadingDefault, module });
    if (m[2] !== undefined) {
      for (const part of m[2].split(',')) {
        const text = part.trim();
        if (!text || /^type\s/.test(text)) continue;
        const [exported, local] = text.split(/\s+as\s+/).map((s) => s.trim());
        if (!exported) continue;
        out.push({
          local: local || exported,
          exported: exported === 'default' ? (local ?? exported) : exported,
          module,
        });
      }
    } else if (m[3]) {
      out.push({ local: m[3], exported: m[3], module, namespace: true });
    } else if (m[4]) {
      out.push({ local: m[4], exported: m[4], module });
    }
  }
  return out;
}

/**
 * The catalog ids a Svelte source renders: every governed import used as a
 * tag (`<Card>`, `<Select.Trigger>` maps `SelectTrigger`). Sorted, unique,
 * unmapped names left out. `ds component new` writes them as `composes`.
 */
export function composedCatalogIds(source: string, catalog: DsCatalog = dsCatalog()): string[] {
  const ids = new Set<string>();
  for (const use of componentUses(source, catalog)) {
    const match = catalogIdFor(catalog, use.module, use.identifier);
    if (match.id) ids.add(match.id);
  }
  return [...ids].sort();
}

export interface ComponentUse {
  /** The identifier the mapper reads (export name; namespace + member). */
  identifier: string;
  module: string;
  /** Offset of the opening tag in `source`. */
  offset: number;
  /** The tag name as written. */
  tag: string;
}

/**
 * Governed components a `.svelte` source uses as tags, in order: Texuli's,
 * `@protoyard/ui`'s and, with a catalog, those of every module a catalog
 * extension imports from.
 */
export function componentUses(source: string, catalog?: DsCatalog): ComponentUse[] {
  const scripts = [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/g)]
    .map((m) => m[1] ?? '')
    .join('\n');
  const imports = new Map<string, ImportedName>();
  for (const name of importedNames(scripts)) {
    if (isGovernedModule(name.module) || catalog?.extensionModules.has(name.module)) {
      imports.set(name.local, name);
    }
  }
  if (imports.size === 0) return [];
  const markup = source.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/g, (block) =>
    block.replace(/[^\n]/g, ' ')
  );
  const out: ComponentUse[] = [];
  for (const m of markup.matchAll(/<([A-Za-z_$][\w$]*)(?:\.([A-Za-z_$][\w$]*))?(?=[\s/>])/g)) {
    const name = imports.get(m[1] ?? '');
    if (!name) continue;
    const identifier = m[2]
      ? `${name.namespace ? name.local : name.exported}${m[2]}`
      : name.exported;
    out.push({ identifier, module: name.module, offset: m.index ?? 0, tag: m[0].slice(1) });
  }
  return out;
}
