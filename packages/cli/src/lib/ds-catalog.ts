import { createRequire } from 'node:module';
import type { CatalogEntry, ManifestGroup } from '@texuli/catalog/build';
import type { CatalogManifest } from '@texuli/catalog/manifest';
import {
  type MergedCatalog,
  mergeCatalogs,
  SPEC_CATALOG_HASH,
  type SpecCatalog,
} from '@texuli/spec';
import {
  checkDesignSystemAllow,
  type DesignSystemAllow,
  type DesignSystemAllowCatalog,
  type DesignSystemAllowEntry,
  type DesignSystemIssue,
  fullAllowEntry,
  type LockedPreset,
  lockedAllowPreset,
} from '@texuli/spec/design-system';
import {
  CATALOG_EXTENSIONS,
  CATALOG_NON_COMPONENTS,
  CATALOG_REEXPORTS,
  type CatalogExtensionManifest,
  type CatalogReexport,
  importCollisions,
  isExtensionId,
  type MergeRefusal,
  toExtensionFiles,
} from './ds-extensions/index.ts';

/**
 * The Texuli component catalog as locked design systems read it (PLAN_013
 * T-tx015): the allow catalog `checkDesignSystemAllow` and
 * `initLockedDesignSystem` take, the axes (axis → prop name and values) the
 * `ds-disabled-value` rule needs, and the mapper from an imported Svelte
 * component to a catalog id.
 *
 * Everything comes from `@texuli/catalog` (`manifests/all` and the
 * non-component list of `manifest`) and the catalog extension data in
 * `./ds-extensions/`; nothing here lists Texuli components by hand.
 *
 * ## The mapper (one function: {@link catalogIdFor})
 *
 * An import is a `(module, export name)` pair (the local name of a default
 * import). In order:
 *
 * 1. `extension`: a catalog extension lists the pair in its `imports`
 *    (`DataTable` from `@protoyard/ui` → `protoyard:data-table`).
 * 2. A wrapping library's re-export is followed to the Texuli import it is
 *    (`FormField` from `@protoyard/ui` is `Field` from `texuli/field`).
 * 3. `import`: a Texuli manifest lists the pair in its `imports` (Texuli
 *    0.15.0 maps every component export; the catalog is the source of truth).
 * 4. `non-component`: Texuli (or a wrapping library) lists the pair as a
 *    non-component export (`MotionProvider`, `SafeArea`, `AppShell`): never
 *    refused, never counted.
 * 5. Otherwise a Texuli module (or a library that publishes its re-exports)
 *    is `unmapped`: no fallback to names while the catalog lists imports.
 *
 * Fallback, only for a Texuli whose manifests carry no `imports`: by name
 * (`exact`: the id whose PascalCase is the name; `package`: the package's id
 * prefix plus the name, `Grid` from `@texuli/data` → `data-grid`; `prefix`:
 * the longest id whose PascalCase starts the name at a word boundary,
 * `CardHeader` → `card`).
 *
 * ## Extensions
 *
 * Texuli's `mergeCatalogs` (the root of `@texuli/spec`) decides which
 * extensions merge, with its own codes, over a projection of the installed
 * catalog ({@link specCatalogOf}); the one rule checked here is that no
 * extension import collides ({@link importCollisions}). Texuli's design
 * system validator accepts namespaced `allow` keys (`protoyard:data-table`),
 * so the document is validated, compiled and approved as written.
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

/** The fields of a catalog manifest this module reads. */
export interface CatalogManifestLike {
  id: string;
  package: string;
  label?: string;
  summary?: string;
  /** The manifest group (`forms`, `overlays`…); set for Texuli manifests. */
  group?: string;
  tier?: 'app' | 'content';
  /** Texuli's emit tiers of the manifest (`emitTiers`). */
  emit?: readonly ('developer' | 'untrusted')[];
  props?: readonly {
    name: string;
    kind?: string;
    required?: boolean;
    enumValues?: readonly string[];
    default?: unknown;
  }[];
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

/** What Texuli's `mergeCatalogs` answered (the local view of `MergedCatalog`). */
export interface DsCatalogMerge {
  ok: boolean;
  /** The SHA-256 of the merged catalog (Texuli's `catalogHash`). */
  catalogHash: string;
  /** The namespaces merged, with each extension file's digest. */
  extensions: readonly { namespace: string; digest: string }[];
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
  /** Texuli's merge result; null when no merge ran (catalogs built from manifests alone). */
  merge: DsCatalogMerge | null;
  /** True when at least one Texuli manifest lists its imports (exact mapping). */
  hasImports: boolean;
  /** `module\0export` → Texuli id. */
  importIndex: ReadonlyMap<string, string>;
  /** `module\0export` → extension id. */
  extensionImportIndex: ReadonlyMap<string, string>;
  /** `module\0export` of every non-component export (Texuli's and wrapping libraries'). */
  nonComponentIndex: ReadonlySet<string>;
  /** `module\0name` → the Texuli import a wrapping library re-exports. */
  reexportIndex: ReadonlyMap<string, CatalogReexport>;
  /** Modules that publish their re-exports: their other names never map by name. */
  reexportModules: ReadonlySet<string>;
  /** Modules extensions import from (governed like Texuli's: `@protoyard/ui`, `@acme/ui`). */
  extensionModules: ReadonlySet<string>;
  /** export name → id, or null when two ids export the same name. */
  exportIndex: ReadonlyMap<string, string | null>;
  /** package → the id prefix every id of that package shares (`data-`), if any. */
  packagePrefix: ReadonlyMap<string, string>;
}

export type CatalogMatch =
  | { id: string; how: 'extension' | 'import' | 'exact' | 'package' | 'prefix' }
  | { id: null; how: 'non-component' | 'unmapped' };

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

const importKey = (module: string, name: string) => `${module}\0${name}`;

export interface CatalogOptions {
  /** Extensions the merge refused (reported, left out). */
  refusals?: readonly MergeRefusal[];
  /** Texuli's merge result. */
  merge?: DsCatalogMerge | null;
  /** Non-component exports (Texuli's `NON_COMPONENT_IMPORTS` and wrapping libraries'). */
  nonComponents?: readonly CatalogImport[];
  /** Re-exports of wrapping libraries. */
  reexports?: readonly CatalogReexport[];
}

/**
 * Builds the catalog view from manifests (exported for tests with fake
 * manifests). A manifest with a namespaced id and `composes` is a catalog
 * extension; pass the merged list ({@link mergeWithExtensions}).
 */
export function catalogFromManifests(
  manifests: readonly CatalogManifestLike[],
  options: CatalogOptions = {}
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
          extensionImportIndex.set(importKey(entry.module, name), component.id);
        }
      }
      continue;
    }
    hasImports = true;
    for (const entry of imports) {
      for (const name of entry.exports) {
        importIndex.set(importKey(entry.module, name), component.id);
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
  const nonComponentIndex = new Set<string>();
  for (const entry of options.nonComponents ?? []) {
    for (const name of entry.exports) {
      const key = importKey(entry.module, name);
      // A name a manifest maps stays a component.
      if (!importIndex.has(key) && !extensionImportIndex.has(key)) nonComponentIndex.add(key);
    }
  }
  const reexportIndex = new Map<string, CatalogReexport>();
  for (const reexport of options.reexports ?? []) {
    reexportIndex.set(importKey(reexport.module, reexport.name), reexport);
  }
  return {
    components,
    byId,
    allowCatalog: allowCatalogOf(components),
    texuliAllowCatalog: allowCatalogOf(texuli),
    extensions: components.filter((c) => c.composes),
    extensionRefusals: options.refusals ?? [],
    merge: options.merge ?? null,
    hasImports,
    importIndex,
    extensionImportIndex,
    nonComponentIndex,
    reexportIndex,
    reexportModules: new Set((options.reexports ?? []).map((r) => r.module)),
    extensionModules: new Set(
      [...extensionImportIndex.keys()].map((key) => key.split('\0')[0] ?? '')
    ),
    exportIndex,
    packagePrefix,
  };
}

/**
 * The installed Texuli catalog as Texuli's `SpecCatalog` (what
 * `mergeCatalogs` takes): the shape of Texuli's own `projectCatalog`
 * (components sorted by id; placement from the tier; Texuli's emit tiers;
 * capability `unknown`, as Texuli projects an unaudited id; props as
 * `{ name, kind, required?, enumValues? }`; axes as `{ prop, values,
 * default }`; states; imports), hashed as `SPEC_CATALOG_HASH`.
 */
export function specCatalogOf(manifests: readonly CatalogManifestLike[]): SpecCatalog {
  const components = [...manifests]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((m) => {
      const props = [...(m.props ?? [])].sort((a, b) => (a.name < b.name ? -1 : 1));
      const axes: Record<string, { prop: string; values: string[]; default: string }> = {};
      for (const axis of DS_AXES) {
        const prop = props.find((p) => p.name === m.axes?.[axis]);
        if (prop?.enumValues && typeof prop.default === 'string') {
          axes[axis] = { prop: prop.name, values: [...prop.enumValues], default: prop.default };
        }
      }
      return {
        id: m.id,
        label: m.label ?? m.id,
        summary: m.summary ?? m.id,
        group: m.group ?? 'ungrouped',
        placement: m.tier ?? 'app',
        emit: [...(m.emit ?? [])].sort(),
        capability: 'unknown',
        props: props.map((p) => ({
          name: p.name,
          kind: p.kind ?? 'unknown',
          ...(p.required === true ? { required: true } : {}),
          ...(p.enumValues ? { enumValues: [...p.enumValues] } : {}),
        })),
        ...(Object.keys(axes).length > 0 ? { axes } : {}),
        ...(m.states?.length ? { states: [...m.states] } : {}),
        ...(m.imports?.length
          ? { imports: m.imports.map((i) => ({ module: i.module, exports: [...i.exports] })) }
          : {}),
      };
    });
  return { catalogHash: SPEC_CATALOG_HASH, components } as unknown as SpecCatalog;
}

export type TexuliMerge = (texuli: SpecCatalog, extensions: readonly unknown[]) => MergedCatalog;

export interface MergeOutcome {
  /** Texuli manifests, then the accepted extensions. */
  manifests: readonly (CatalogManifestLike | CatalogExtensionManifest)[];
  refusals: readonly MergeRefusal[];
  merge: DsCatalogMerge;
}

/**
 * Texuli manifests plus `extensions`, merged by Texuli's `mergeCatalogs`
 * over {@link specCatalogOf} and the extensions as Texuli extension files
 * (one per namespace). Extensions whose imports collide are left out first
 * ({@link importCollisions}); Texuli refuses a whole extension file when any
 * of its components fails its rules, and every issue keeps Texuli's code and
 * path (`extensions[<file>].components[<i>]…`). Never throws.
 */
export function mergeWithExtensions(
  texuli: readonly CatalogManifestLike[],
  extensions: readonly CatalogExtensionManifest[] = CATALOG_EXTENSIONS,
  merge: TexuliMerge = mergeCatalogs
): MergeOutcome {
  const collisions = importCollisions(texuli, extensions);
  const colliding = new Set(collisions.map((refusal) => refusal.id));
  const candidates = extensions.filter((extension) => !colliding.has(extension.id));
  const files = toExtensionFiles(candidates);
  const merged = merge(
    specCatalogOf(texuli),
    files.map((entry) => entry.file)
  );
  const accepted = new Set(
    merged.catalog.components.map((c) => c.id).filter((id) => isExtensionId(id))
  );
  const refusals: MergeRefusal[] = [
    ...collisions,
    ...merged.issues.map((issue) => {
      const at = /^extensions\[(\d+)\](?:\.components\[(\d+)\])?/.exec(issue.path);
      const file = at ? files[Number(at[1])] : undefined;
      const component = at?.[2] === undefined ? undefined : file?.manifests[Number(at[2])];
      return {
        code: issue.code,
        id: component?.id ?? (file?.file.namespace ? `${file.file.namespace}:*` : '*'),
        path: issue.path,
        message: issue.message,
      };
    }),
  ];
  return {
    manifests: [...texuli, ...candidates.filter((extension) => accepted.has(extension.id))],
    refusals,
    merge: {
      ok: merged.ok && collisions.length === 0,
      catalogHash: merged.catalog.catalogHash,
      extensions: merged.extensions.map((e) => ({ namespace: e.namespace, digest: e.digest })),
    },
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
    const load = createRequire(import.meta.url);
    const { ALL_MANIFEST_GROUPS } = load('@texuli/catalog/manifests/all') as {
      ALL_MANIFEST_GROUPS: readonly ManifestGroup[];
    };
    const { emitTiers } = load('@texuli/catalog/build') as {
      emitTiers: (manifest: CatalogManifest, group: string) => CatalogEntry['emit'];
    };
    const { NON_COMPONENT_IMPORTS } = load('@texuli/catalog/manifest') as {
      NON_COMPONENT_IMPORTS?: readonly CatalogImport[];
    };
    const texuli = ALL_MANIFEST_GROUPS.flatMap((group) =>
      group.manifests.map((manifest) => ({
        ...(manifest as unknown as CatalogManifestLike),
        group: group.name,
        emit: emitTiers(manifest, group.name),
      }))
    );
    const merged = mergeWithExtensions(texuli);
    cached = catalogFromManifests(merged.manifests, {
      refusals: merged.refusals,
      merge: merged.merge,
      nonComponents: [...(NON_COMPONENT_IMPORTS ?? []), ...CATALOG_NON_COMPONENTS],
      reexports: CATALOG_REEXPORTS,
    });
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
  return resolveImport(catalog, module, identifier, identifier, 0);
}

function resolveImport(
  catalog: DsCatalog,
  module: string,
  exported: string,
  name: string,
  depth: number
): CatalogMatch {
  const key = importKey(module, exported);
  const extension = catalog.extensionImportIndex.get(key);
  if (extension) return { id: extension, how: 'extension' };
  const reexport = catalog.reexportIndex.get(key);
  if (reexport && depth < 4) {
    // A default re-export keeps the library's name for the by-name fallback.
    const fallback = reexport.export === 'default' ? reexport.name : reexport.export;
    return resolveImport(catalog, reexport.from, reexport.export, fallback, depth + 1);
  }
  const direct = catalog.importIndex.get(key);
  if (direct) return { id: direct, how: 'import' };
  if (catalog.nonComponentIndex.has(key)) return { id: null, how: 'non-component' };
  if (!isGovernedModule(module)) return { id: null, how: 'unmapped' };
  if (catalog.hasImports) {
    // The catalog lists every Texuli import: no fallback to names.
    if (isTexuliModule(module) || catalog.reexportModules.has(module)) {
      return { id: null, how: 'unmapped' };
    }
    const unique = catalog.exportIndex.get(exported);
    if (unique) return { id: unique, how: 'import' };
  }
  return byName(catalog, packageOf(module), name);
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
 * other.
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
