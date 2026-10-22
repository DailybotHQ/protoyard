/**
 * Blueprint kinds (ADR-036). A blueprint's `kind` decides its renderer at both
 * levels (player and `generate`), its synthesizer, variants and validation
 * summary. A missing `kind` means `app`, so every blueprint written before
 * kinds existed keeps its meaning and its content identity.
 *
 * Not to be confused with the registry's `ProjectKind` (prototype, template,
 * blueprint) in `@protoyard/core`: that names where a project comes from, this
 * names what a blueprint renders as.
 */

/** Every kind this version understands, in display order. */
export const BLUEPRINT_KINDS = ['app', 'deck', 'page', 'doc'] as const;
export type BlueprintKind = (typeof BLUEPRINT_KINDS)[number];

/** Kinds made of content (blocks) rather than entities; each has a body key named after it. */
export const CONTENT_KINDS = ['deck', 'page', 'doc'] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

/** The kind a blueprint without `kind` has. */
export const DEFAULT_BLUEPRINT_KIND: BlueprintKind = 'app';

export function isBlueprintKind(value: unknown): value is BlueprintKind {
  return typeof value === 'string' && (BLUEPRINT_KINDS as readonly string[]).includes(value);
}

export function isContentKind(value: unknown): value is ContentKind {
  return typeof value === 'string' && (CONTENT_KINDS as readonly string[]).includes(value);
}

/** The friendly message for a `kind` this version does not know. */
export function unknownKindMessage(kind: string): string {
  const shown = kind.length > 40 ? `${kind.slice(0, 40)}…` : kind;
  return `Blueprint kind "${shown}" needs a newer Protoyard (this version supports ${BLUEPRINT_KINDS.join(', ')}).`;
}

export type KindDetection =
  | { ok: true; kind: BlueprintKind }
  | { ok: false; message: string; fix: string };

/**
 * Reads the kind of unparsed input without validating anything else: a
 * missing or `undefined` kind is `app`. Loaders use it to pick a schema (and,
 * in the player, a renderer) before parsing.
 */
export function detectBlueprintKind(input: unknown): KindDetection {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: true, kind: DEFAULT_BLUEPRINT_KIND };
  }
  const kind = Object.hasOwn(input, 'kind') ? (input as { kind?: unknown }).kind : undefined;
  if (kind === undefined) return { ok: true, kind: DEFAULT_BLUEPRINT_KIND };
  if (typeof kind !== 'string') {
    return {
      ok: false,
      message: `Blueprint "kind" must be a string (one of ${BLUEPRINT_KINDS.join(', ')}).`,
      fix: 'Set "kind" to app, deck, page or doc, or remove it for an app.',
    };
  }
  if (!isBlueprintKind(kind)) {
    return {
      ok: false,
      message: unknownKindMessage(kind),
      fix: 'Update Protoyard, or set "kind" to one this version supports.',
    };
  }
  return { ok: true, kind };
}
