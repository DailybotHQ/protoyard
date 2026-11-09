import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  catalogIdFor,
  componentUses,
  type DsCatalog,
  importedNames,
} from '../src/lib/ds-catalog.ts';

/**
 * Test support (PLAN_013 T-tx015): the Svelte component exports of
 * `@protoyard/ui`, read mechanically from `packages/ui/src/index.ts` and the
 * barrels it re-exports, and the Texuli catalog ids a Protoyard-own component
 * renders (through its own local children too).
 */

export const UI_SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../../ui/src');

export interface UiComponentExport {
  /** The name `@protoyard/ui` exports. */
  name: string;
  /** The module it comes from: a Texuli module, or a local `.svelte` file. */
  module: string;
  /** Absolute path of the local `.svelte` file; undefined for a Texuli re-export. */
  file?: string;
}

const EXPORT_FROM = /export\s+(\*|\{([^}]*)\})\s+from\s+['"]([^'"]+)['"]/g;
/** A component name: PascalCase with at least one lowercase letter (not `MAX_TOASTS`). */
const COMPONENT_NAME = /^[A-Z][A-Za-z0-9]*[a-z][A-Za-z0-9]*$/;

function scanBarrel(file: string, out: UiComponentExport[]): void {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(EXPORT_FROM)) {
    const spec = m[3] ?? '';
    const local = spec.startsWith('.');
    const target = local ? join(dirname(file), spec) : undefined;
    if (m[1] === '*') {
      if (target?.endsWith('.ts')) scanBarrel(target, out);
      continue;
    }
    for (const part of (m[2] ?? '').split(',')) {
      const text = part.trim();
      if (!text || /^type\s/.test(text)) continue;
      const [exported = '', alias] = text.split(/\s+as\s+/).map((s) => s.trim());
      const name = alias ?? exported;
      if (!COMPONENT_NAME.test(name)) continue;
      if (!target) {
        out.push({ name, module: spec });
      } else if (target.endsWith('.svelte')) {
        out.push({ name, module: spec, file: target });
      } else if (target.endsWith('.ts')) {
        const nested: UiComponentExport[] = [];
        scanBarrel(target, nested);
        const hit = nested.find((entry) => entry.name === exported);
        if (hit) out.push({ ...hit, name });
      }
    }
  }
}

/**
 * Every Svelte component `@protoyard/ui` exports: a re-export of a Texuli
 * module (`module` is the specifier), or a Protoyard-own `.svelte` file. Names
 * that are not components (classes such as `OverlayStack`, helpers, types)
 * are left out: a re-export from a `.ts` file counts only when it reaches a
 * `.svelte` file, and a Texuli re-export only when it is PascalCase.
 */
export function uiComponentExports(src = UI_SRC): UiComponentExport[] {
  const out: UiComponentExport[] = [];
  scanBarrel(join(src, 'index.ts'), out);
  const seen = new Set<string>();
  return out.filter((entry) => !seen.has(entry.name) && seen.add(entry.name));
}

/** The plain-object classes `@protoyard/ui` exports by PascalCase name (not components). */
export const UI_NON_COMPONENT_EXPORTS: readonly string[] = ['OverlayStack'];

function scriptOf(source: string): string {
  return [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/g)]
    .map((m) => m[1] ?? '')
    .join('\n');
}

export interface DerivedComposition {
  /** Catalog ids the component renders (Texuli ids only), sorted. */
  ids: string[];
  /** Governed identifiers the mapper cannot place (`module#Name`), sorted. */
  unmapped: string[];
}

/**
 * The Texuli catalog ids a Protoyard-own component renders: every Texuli
 * component it uses as a tag, through the local `.svelte` components it
 * renders too (`ActorRow` renders `Avatar`, which renders Texuli's avatar).
 */
export function derivedComposition(file: string, catalog: DsCatalog): DerivedComposition {
  const ids = new Set<string>();
  const unmapped = new Set<string>();
  const visited = new Set<string>();
  const walk = (path: string) => {
    if (visited.has(path) || !existsSync(path)) return;
    visited.add(path);
    const source = readFileSync(path, 'utf8');
    for (const use of componentUses(source)) {
      const match = catalogIdFor(catalog, use.module, use.identifier);
      if (match.id && !match.id.includes(':')) ids.add(match.id);
      else if (!match.id) unmapped.add(`${use.module}#${use.identifier}`);
    }
    const markup = source.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/g, '');
    for (const name of importedNames(scriptOf(source))) {
      if (!name.module.startsWith('.') || !name.module.endsWith('.svelte')) continue;
      if (!new RegExp(`<${name.local}[\\s/>.]`).test(markup)) continue;
      walk(join(dirname(path), name.module));
    }
  };
  walk(file);
  return { ids: [...ids].sort(), unmapped: [...unmapped].sort() };
}
