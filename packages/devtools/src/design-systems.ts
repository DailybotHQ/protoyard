import type { PrototypeRuntime, Theme } from '@protoyard/core';
import {
  compileDesignSystemDocument,
  type DesignSystem,
  defineDesignSystemTheme,
} from '@protoyard/themes';

/**
 * Design systems made in Theme Studio, per prototype (its storage namespace)
 * and browser. The Studio saves the design system's theme with the runtime's
 * custom themes; this keeps the design-system document next to it, so a
 * reload can compile it again and paint it with Texuli's runtime.
 *
 * Stored documents are untrusted on the way back in: each is compiled again
 * by Texuli at `trust: 'untrusted'` (never a cached compiled copy, which
 * could carry a font URL), and one whose theme is no longer saved is dropped.
 */

const KEY_PREFIX = 'protoyard:design-systems:';
/** At most this many documents per prototype, and this many characters in all. */
export const MAX_STORED_DESIGN_SYSTEMS = 12;
const MAX_STORED_CHARS = 512 * 1024;

const keyFor = (namespace: string) => `${KEY_PREFIX}${namespace}`;

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** The stored documents of a prototype, by id (unknown shapes are skipped). */
export function readStoredDesignSystems(namespace: string): Record<string, unknown> {
  try {
    const raw = storage()?.getItem(keyFor(namespace));
    if (!raw || raw.length > MAX_STORED_CHARS) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, unknown> = {};
    for (const [id, document] of Object.entries(parsed as Record<string, unknown>)) {
      if (/^[a-z][a-z0-9-]*$/.test(id) && document && typeof document === 'object')
        out[id] = document;
    }
    return out;
  } catch {
    return {};
  }
}

function writeAll(namespace: string, documents: Record<string, unknown>): void {
  const text = JSON.stringify(documents);
  if (text.length > MAX_STORED_CHARS) throw new Error('Too many design systems are saved here.');
  const store = storage();
  if (!store) throw new Error('This browser does not allow saving design systems.');
  store.setItem(keyFor(namespace), text);
}

/** Saves `document` under its id (replacing one with the same id). */
export function storeDesignSystem(namespace: string, document: DesignSystem): void {
  const documents = readStoredDesignSystems(namespace);
  if (!(document.id in documents) && Object.keys(documents).length >= MAX_STORED_DESIGN_SYSTEMS) {
    throw new Error(`Keep at most ${MAX_STORED_DESIGN_SYSTEMS} design systems per prototype.`);
  }
  documents[document.id] = document;
  writeAll(namespace, documents);
}

export function forgetStoredDesignSystem(namespace: string, id: string): void {
  const documents = readStoredDesignSystems(namespace);
  if (!(id in documents)) return;
  delete documents[id];
  try {
    writeAll(namespace, documents);
  } catch {
    // Nothing more to free.
  }
}

/** The theme controller's custom themes, when the runtime has them. */
function savedThemeIds(runtime: PrototypeRuntime): Set<string> {
  const custom = (runtime.theme as { customThemes?: () => readonly Theme[] }).customThemes;
  return new Set(
    typeof custom === 'function' ? custom.call(runtime.theme).map((theme) => theme.id) : []
  );
}

/**
 * Compiles every stored design system whose theme is still saved and
 * registers it, so the document repaints with Texuli's runtime. Returns the
 * ids it restored. Never throws: a document Texuli refuses is dropped.
 */
export async function restoreDesignSystems(runtime: PrototypeRuntime): Promise<string[]> {
  const namespace = runtime.manifest.storage.namespace;
  const documents = readStoredDesignSystems(namespace);
  const ids = Object.keys(documents);
  if (ids.length === 0) return [];
  const saved = savedThemeIds(runtime);
  const restored: string[] = [];
  for (const id of ids) {
    if (!saved.has(id)) {
      forgetStoredDesignSystem(namespace, id);
      continue;
    }
    const result = await compileDesignSystemDocument(documents[id]);
    if (!result.ok || result.compiled.id !== id) {
      forgetStoredDesignSystem(namespace, id);
      continue;
    }
    defineDesignSystemTheme(result.shipped);
    restored.push(id);
  }
  return restored;
}
