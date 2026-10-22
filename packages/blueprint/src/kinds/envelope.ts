import type { DocDocument, PageDocument } from '@protoyard/pages';
import { z } from 'zod';
import { BLUEPRINT_BASE_SHAPE, type Blueprint, BlueprintSchema } from '../schema.ts';
import { kindBodySchema } from './bodies.ts';
import { type BlueprintKind, type ContentKind, detectBlueprintKind } from './kind.ts';

/**
 * The kind union (ADR-036): `parseAnyBlueprint` accepts an app (no `kind`, or
 * `kind: "app"`, parsed by the unchanged app schema) or a content kind whose
 * body schema its engine package supplies (`bodies.ts`). `parseBlueprint`
 * stays app-only, so every consumer that reads `.entities` keeps its type.
 *
 * A content blueprint is strict: the shared root keys plus `kind` and one body
 * key named after the kind. App-only keys (entities, roles, screens, layout,
 * archetype, notifications, history, validation) are rejected there.
 */

const BlueprintBaseSchema = z.strictObject(BLUEPRINT_BASE_SHAPE);
/** Root fields every kind shares (name, description, catalog, tags, icon, category, brand). */
export type BlueprintBase = z.output<typeof BlueprintBaseSchema>;

/**
 * The parsed body of each content kind. The deck stays `unknown` until
 * `@protoyard/decks/schema` is wired in; page and doc come from
 * `@protoyard/pages` (`kinds/page.ts`, `kinds/doc.ts`).
 */
export interface KindBodies {
  deck: unknown;
  page: PageDocument;
  doc: DocDocument;
}

export type ContentBlueprint<K extends ContentKind> = BlueprintBase & { kind: K } & {
  [P in K]: KindBodies[P];
};
export type DeckBlueprint = ContentBlueprint<'deck'>;
export type PageBlueprint = ContentBlueprint<'page'>;
export type DocBlueprint = ContentBlueprint<'doc'>;
/** Any parsed blueprint. Apps carry no `kind` once parsed; content kinds always do. */
export type AnyBlueprint = Blueprint | DeckBlueprint | PageBlueprint | DocBlueprint;

const contentSchemas = new Map<ContentKind, { body: z.ZodType; schema: z.ZodType }>();

function contentBlueprintSchema(kind: ContentKind, body: z.ZodType): z.ZodType {
  const cached = contentSchemas.get(kind);
  if (cached?.body === body) return cached.schema;
  const schema = z.strictObject({
    ...BLUEPRINT_BASE_SHAPE,
    kind: z.literal(kind),
    [kind]: body,
  });
  contentSchemas.set(kind, { body, schema });
  return schema;
}

function failure(message: string, input: unknown): z.ZodSafeParseResult<AnyBlueprint> {
  const error = new z.ZodError([{ code: 'custom', path: ['kind'], message, input }]);
  return { success: false, error: error as z.ZodError<AnyBlueprint> };
}

/** Validates any kind of blueprint. Never throws; an unknown kind fails on `kind`. */
export function safeParseAnyBlueprint(input: unknown): z.ZodSafeParseResult<AnyBlueprint> {
  const detected = detectBlueprintKind(input);
  const kind = (input as { kind?: unknown } | null)?.kind;
  if (!detected.ok) return failure(detected.message, kind);
  if (detected.kind === 'app') return BlueprintSchema.safeParse(input);
  const body = kindBodySchema(detected.kind);
  if (!body) {
    return failure(
      `Blueprint kind "${detected.kind}" is not available in this build of Protoyard yet.`,
      kind
    );
  }
  return contentBlueprintSchema(detected.kind, body).safeParse(
    input
  ) as z.ZodSafeParseResult<AnyBlueprint>;
}

/** Validates any kind of blueprint; throws a `ZodError` on failure. */
export function parseAnyBlueprint(input: unknown): AnyBlueprint {
  const result = safeParseAnyBlueprint(input);
  if (!result.success) throw result.error;
  return result.data;
}

/** The kind of a parsed blueprint (`app` when it has none). */
export function blueprintKind(blueprint: AnyBlueprint): BlueprintKind {
  return 'kind' in blueprint ? blueprint.kind : 'app';
}

export function isAppBlueprint(blueprint: AnyBlueprint): blueprint is Blueprint {
  return !('kind' in blueprint);
}

export function isContentBlueprint(
  blueprint: AnyBlueprint
): blueprint is DeckBlueprint | PageBlueprint | DocBlueprint {
  return 'kind' in blueprint;
}

export function isDeckBlueprint(blueprint: AnyBlueprint): blueprint is DeckBlueprint {
  return blueprintKind(blueprint) === 'deck';
}

export function isPageBlueprint(blueprint: AnyBlueprint): blueprint is PageBlueprint {
  return blueprintKind(blueprint) === 'page';
}

export function isDocBlueprint(blueprint: AnyBlueprint): blueprint is DocBlueprint {
  return blueprintKind(blueprint) === 'doc';
}
