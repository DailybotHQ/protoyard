import {
  CATALOG_EXTENSION_FORMAT,
  CATALOG_EXTENSION_VERSION,
  type CatalogExtensionCode,
} from '@texuli/spec';
import {
  PROTOYARD_UI_EXTENSIONS,
  PROTOYARD_UI_NON_COMPONENTS,
  PROTOYARD_UI_REEXPORTS,
} from './protoyard-ui.ts';
import type { CatalogExtensionManifest, CatalogImportList, CatalogReexport } from './types.ts';

export {
  PROTOYARD_UI_EXTENSIONS,
  PROTOYARD_UI_HOST_CHROME,
  PROTOYARD_UI_NON_COMPONENTS,
  PROTOYARD_UI_REEXPORTS,
} from './protoyard-ui.ts';
export type * from './types.ts';

/**
 * Catalog extensions (PLAN_013 T-tx015): manifests a library that wraps
 * Texuli publishes for its own components, merged into the Texuli catalog so
 * a design system's `allow` section can name them (`protoyard:data-table`)
 * and `check ds` can map and gate them.
 *
 * Texuli's `mergeCatalogs` decides which extensions merge (namespace, ids,
 * collisions, composes, props, axes, states, `CATALOG_EXTENSION_LIMITS`),
 * with its own codes. The one rule checked here is the one Texuli cannot
 * see: an extension's `imports` never claim an import another extension or
 * a Texuli manifest already names ({@link importCollisions}).
 */

/** Every extension the CLI merges, in a stable order. */
export const CATALOG_EXTENSIONS: readonly CatalogExtensionManifest[] = PROTOYARD_UI_EXTENSIONS;

/** Re-exports of wrapping libraries: the mapper follows them to the Texuli import. */
export const CATALOG_REEXPORTS: readonly CatalogReexport[] = PROTOYARD_UI_REEXPORTS;

/** Exports of wrapping libraries that are not components (never refused, never counted). */
export const CATALOG_NON_COMPONENTS: readonly CatalogImportList[] = PROTOYARD_UI_NON_COMPONENTS;

/** True for a namespaced (extension) id such as `protoyard:data-table`. */
export function isExtensionId(id: string): boolean {
  return id.includes(':');
}

/** The namespace of an extension id (`protoyard`), or `''`. */
export function namespaceOf(id: string): string {
  const at = id.indexOf(':');
  return at > 0 ? id.slice(0, at) : '';
}

/** A refusal: Texuli's codes (`extension-*`), plus the extension id when known. */
export interface MergeRefusal {
  code: CatalogExtensionCode;
  /** The extension id (as written), or `<namespace>:*` for a whole extension file. */
  id: string;
  path: string;
  message: string;
}

/**
 * Extensions whose `imports` name a `(module, export)` pair a Texuli manifest
 * or an earlier extension already names. Texuli's extension format carries
 * no imports, so this is the one merge rule checked here.
 */
export function importCollisions(
  texuli: readonly { id: string; imports?: readonly CatalogImportList[] }[],
  extensions: readonly CatalogExtensionManifest[]
): MergeRefusal[] {
  const claimed = new Map<string, string>();
  for (const manifest of texuli) {
    for (const entry of manifest.imports ?? []) {
      for (const name of entry.exports) claimed.set(`${entry.module}\0${name}`, manifest.id);
    }
  }
  const refusals: MergeRefusal[] = [];
  extensions.forEach((extension, index) => {
    const collisions: string[] = [];
    for (const entry of extension.imports ?? []) {
      for (const name of entry.exports) {
        const owner = claimed.get(`${entry.module}\0${name}`);
        if (owner) collisions.push(`${name} from ${entry.module} (already ${owner})`);
      }
    }
    if (collisions.length > 0) {
      refusals.push({
        code: 'extension-collision',
        id: extension.id,
        path: `$.extensions[${index}].imports`,
        message: `"${extension.id}" imports ${collisions.join(', ')}.`,
      });
      return;
    }
    for (const entry of extension.imports ?? []) {
      for (const name of entry.exports) claimed.set(`${entry.module}\0${name}`, extension.id);
    }
  });
  return refusals;
}

/** One Texuli extension file (`texuli/catalog-extension`) and the manifests it carries. */
export interface ExtensionFile {
  file: {
    format: typeof CATALOG_EXTENSION_FORMAT;
    version: typeof CATALOG_EXTENSION_VERSION;
    namespace: string;
    components: unknown[];
  };
  manifests: readonly CatalogExtensionManifest[];
}

/**
 * The manifests as Texuli's extension files: one per namespace, in first-seen
 * order, each component in the catalog's own shape (placement from `tier`,
 * `emit: []` unless agent-emittable, `web-only`, props as `{ name, kind, required?, enumValues? }`, axes as
 * `{ prop, values, default }`). An id without a namespace goes to a file of
 * namespace `''`, which Texuli refuses with its own code.
 */
export function toExtensionFiles(extensions: readonly CatalogExtensionManifest[]): ExtensionFile[] {
  const files = new Map<string, CatalogExtensionManifest[]>();
  for (const extension of extensions) {
    const namespace = namespaceOf(String(extension.id));
    files.set(namespace, [...(files.get(namespace) ?? []), extension]);
  }
  return [...files].map(([namespace, manifests]) => ({
    file: {
      format: CATALOG_EXTENSION_FORMAT,
      version: CATALOG_EXTENSION_VERSION,
      namespace,
      components: manifests.map(toExtensionComponent),
    },
    manifests,
  }));
}

function toExtensionComponent(manifest: CatalogExtensionManifest): Record<string, unknown> {
  const axes: Record<string, { prop: string; values: string[]; default: unknown }> = {};
  for (const [axis, prop] of Object.entries(manifest.axes ?? {})) {
    const schema = manifest.props.find((p) => p.name === prop);
    axes[axis] = {
      prop: String(prop),
      values: [...(schema?.enumValues ?? [])],
      default: schema?.default,
    };
  }
  return {
    id: manifest.id,
    label: manifest.label,
    summary: manifest.summary,
    group: manifest.group,
    // As declared, so Texuli refuses a content-tier or agent-emittable extension itself.
    placement: manifest.tier,
    emit: manifest.agentEmittable ? ['developer'] : [],
    capability: 'web-only',
    props: manifest.props.map((prop) => ({
      name: prop.name,
      kind: prop.kind,
      ...(prop.enumValues ? { enumValues: [...prop.enumValues] } : {}),
    })),
    ...(Object.keys(axes).length > 0 ? { axes } : {}),
    ...(manifest.states ? { states: [...manifest.states] } : {}),
    composes: [...manifest.composes],
  };
}
