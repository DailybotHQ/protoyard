import { PROTOYARD_UI_EXTENSIONS } from './protoyard-ui.ts';
import type { CatalogExtensionManifest } from './types.ts';

export { PROTOYARD_UI_EXTENSIONS, PROTOYARD_UI_HOST_CHROME } from './protoyard-ui.ts';
export type * from './types.ts';

/**
 * Catalog extensions (PLAN_013 T-tx015): manifests a library that wraps
 * Texuli publishes for its own components, merged into the Texuli catalog so
 * a design system's `allow` section can name them (`protoyard:data-table`)
 * and `check ds` can map and gate them.
 *
 * {@link mergeCatalogManifests} follows the refusal rules agreed with Texuli
 * for its `mergeCatalogs` (drop 2): the id carries a namespace, no id or
 * import collides, and every `composes` id is a Texuli catalog id. A refused
 * extension is left out and reported; the rest merge.
 */

/** Every extension the CLI merges, in a stable order. */
export const CATALOG_EXTENSIONS: readonly CatalogExtensionManifest[] = PROTOYARD_UI_EXTENSIONS;

const KEBAB = '[a-z][a-z0-9]*(?:-[a-z0-9]+)*';
/** `<namespace>:<kebab-id>`, at most 48 characters (the allow-key cap). */
export const EXTENSION_ID = new RegExp(`^(?=.{1,48}$)(${KEBAB}):${KEBAB}$`);
/** Namespaces an extension cannot claim. */
export const RESERVED_NAMESPACES: readonly string[] = ['texuli'];

/** True for a namespaced (extension) id such as `protoyard:data-table`. */
export function isExtensionId(id: string): boolean {
  return id.includes(':');
}

/**
 * The component ids Texuli announced for its drop 2 catalog (manifests for
 * components it ships today without one). Until they land, a Texuli
 * re-export of these is `unmapped`; afterwards it maps to the Texuli id.
 */
export const TEXULI_ANNOUNCED_IDS: readonly string[] = [
  'icon',
  'avatar',
  'skeleton',
  'progress',
  'spinner',
  'carousel',
  'separator',
  'list-item',
  'tabs',
  'accordion',
  'composer',
  'mobile-header',
  'bottom-nav',
  'bottom-sheet',
  'board',
  'notice',
];

/** Texuli exports that stop being components in drop 2 (not catalog entries). */
export const TEXULI_ANNOUNCED_NON_COMPONENTS: readonly string[] = ['MotionProvider', 'SafeArea'];

export type MergeRefusalCode = 'namespace-required' | 'id-collision' | 'composes-unresolved';

export interface MergeRefusal {
  code: MergeRefusalCode;
  /** The extension id (as written). */
  id: string;
  path: string;
  message: string;
}

export interface MergedCatalog<T extends { id: string }> {
  /** Texuli manifests, then the accepted extensions. */
  manifests: readonly (T | CatalogExtensionManifest)[];
  extensions: readonly CatalogExtensionManifest[];
  refusals: readonly MergeRefusal[];
}

/**
 * Texuli manifests plus extension manifests (see the module comment). Pure;
 * never throws.
 */
export function mergeCatalogManifests<T extends { id: string }>(
  texuli: readonly T[],
  extensions: readonly CatalogExtensionManifest[]
): MergedCatalog<T> {
  const texuliIds = new Set(texuli.map((m) => m.id));
  const taken = new Set<string>(texuliIds);
  const claimedImports = new Map<string, string>();
  const accepted: CatalogExtensionManifest[] = [];
  const refusals: MergeRefusal[] = [];
  extensions.forEach((extension, index) => {
    const path = `$.extensions[${index}]`;
    const refuse = (code: MergeRefusalCode, at: string, message: string) =>
      refusals.push({ code, id: String(extension.id), path: at, message });
    const namespace = EXTENSION_ID.exec(String(extension.id))?.[1];
    if (!namespace || RESERVED_NAMESPACES.includes(namespace)) {
      refuse(
        'namespace-required',
        `${path}.id`,
        `"${extension.id}" needs a namespace of its own: <namespace>:<kebab-id> (not texuli:).`
      );
      return;
    }
    if (taken.has(extension.id)) {
      refuse('id-collision', `${path}.id`, `"${extension.id}" is already in the catalog.`);
      return;
    }
    const collisions: string[] = [];
    for (const entry of extension.imports ?? []) {
      for (const name of entry.exports) {
        const owner = claimedImports.get(`${entry.module}\0${name}`);
        if (owner) collisions.push(`${name} from ${entry.module} (already ${owner})`);
      }
    }
    if (collisions.length > 0) {
      refuse(
        'id-collision',
        `${path}.imports`,
        `"${extension.id}" imports ${collisions.join(', ')}.`
      );
      return;
    }
    const unresolved = (extension.composes ?? []).filter((id) => !texuliIds.has(id));
    if (unresolved.length > 0) {
      refuse(
        'composes-unresolved',
        `${path}.composes`,
        `"${extension.id}" composes ids the Texuli catalog does not list: ${unresolved.join(', ')}.`
      );
      return;
    }
    taken.add(extension.id);
    for (const entry of extension.imports ?? []) {
      for (const name of entry.exports)
        claimedImports.set(`${entry.module}\0${name}`, extension.id);
    }
    accepted.push(extension);
  });
  return { manifests: [...texuli, ...accepted], extensions: accepted, refusals };
}
