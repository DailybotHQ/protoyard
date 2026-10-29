import { type Block, BlockListSchema, LinkHrefSchema } from '@protoyard/blocks';
import { DECK_TRANSITIONS } from '@texuli/deck/model';
import { z } from 'zod';
import { checkDeckMediaSrc } from '../backgrounds/media.ts';
import { DeckBackgroundSchema } from '../backgrounds/schema.ts';
import { DECK_ASPECTS } from '../canvas.ts';
import { checkProtoyardDeck } from '../texuli.ts';

/*
 * Protoyard's deck shape: the structure below (zod, for the blueprint
 * envelope, the TypeScript types and `DeckJsonSchema`) plus Protoyard's own
 * offline media and link policy. Everything else (each layout's props, step
 * markers, ids, outline references, backgrounds and steps) is validated by
 * `@texuli/deck`'s `parseDeck` on the migrated deck (`../texuli.ts`).
 */

/** Deck documents are intentionally capped before they reach a renderer. */
export const DECK_LIMITS = Object.freeze({
  slides: 200,
  sections: 200,
  sectionSlides: 200,
  slideTitle: 160,
  slideNotes: 2_000,
  sectionTitle: 120,
  stepLabel: 80,
  steps: 32,
  propsKeys: 100,
  propsArray: 200,
  propsDepth: 4,
  propsString: 2_000,
  freeBlocks: 2_000,
});

const SlugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
/** Catalog layout ids: `free` and `custom` are slide kinds of their own. */
const LayoutIdSchema = z.string().regex(/^(?!(?:free|custom)$)[a-z0-9][a-z0-9-]{0,63}$/);
const LayoutPropKeySchema = z
  .string()
  .max(64)
  .regex(/^(?!__proto__$|constructor$|prototype$)[\s\S]*$/);
/** The deck model's transitions (`@texuli/deck`): none, fade, fade-up, slide, zoom, morph. */
const TransitionSchema = z.enum(DECK_TRANSITIONS);
const ProgressSchema = z.enum(['none', 'top', 'bottom']);
export const DeckAspectSchema = z.enum(DECK_ASPECTS);
export const DeckDensitySchema = z.enum(['compact', 'comfortable', 'spacious']);
export const DeckRadiusSchema = z.enum(['none', 'small', 'medium', 'large', 'full']);
export const DeckMotionSchema = z.enum(['full', 'subtle', 'none']);

/** Theme and font ids resolve through the shared registries at render time. */
export const DeckStyleSchema = z.strictObject({
  theme: SlugSchema.optional(),
  paletteSeed: z.number().int().min(0).max(0xffff_ffff).optional(),
  fontPair: SlugSchema.optional(),
  aspect: DeckAspectSchema.optional(),
  density: DeckDensitySchema.optional(),
  radius: DeckRadiusSchema.optional(),
  motion: DeckMotionSchema.optional(),
  transition: TransitionSchema.optional(),
  background: SlugSchema.optional(),
  logo: z.string().max(256).optional(),
  footer: z.string().max(160).optional(),
  slideNumbers: z.boolean().optional(),
  progress: ProgressSchema.optional(),
});
export type DeckStyle = z.infer<typeof DeckStyleSchema>;

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function boundedJsonValue(depth: number): z.ZodType<JsonValue> {
  const scalar = z.union([
    z.string().max(DECK_LIMITS.propsString),
    z.number().finite(),
    z.boolean(),
    z.null(),
  ]);
  if (depth <= 0) return scalar as z.ZodType<JsonValue>;

  const child = boundedJsonValue(depth - 1);
  const array = z.array(child).max(DECK_LIMITS.propsArray);
  const record = z.record(LayoutPropKeySchema, child).superRefine((value, ctx) => {
    if (Object.keys(value).length > DECK_LIMITS.propsKeys) {
      ctx.addIssue({
        code: 'custom',
        message: `Layout props may contain at most ${DECK_LIMITS.propsKeys} keys.`,
      });
    }
  });
  return z.union([scalar, array, record]) as z.ZodType<JsonValue>;
}

const LayoutPropsSchema = z
  .record(LayoutPropKeySchema, boundedJsonValue(DECK_LIMITS.propsDepth))
  .superRefine((value, ctx) => {
    if (Object.keys(value).length > DECK_LIMITS.propsKeys) {
      ctx.addIssue({
        code: 'custom',
        message: `Layout props may contain at most ${DECK_LIMITS.propsKeys} keys.`,
      });
    }
  });

const SlideBaseShape = {
  id: SlugSchema,
  title: z.string().max(DECK_LIMITS.slideTitle).optional(),
  /**
   * A preset id or a validated media spec. Any other slug still parses, as it
   * did before media backgrounds: the slide renders `solid-color` and
   * `checkDeckStatic` warns (`unknown-background`), so an older deck still opens.
   */
  background: z.union([DeckBackgroundSchema, SlugSchema]).optional(),
  transition: TransitionSchema.optional(),
  steps: z.array(z.string().max(DECK_LIMITS.stepLabel)).max(DECK_LIMITS.steps).optional(),
  notes: z.string().max(DECK_LIMITS.slideNotes).optional(),
  hidden: z.boolean().optional(),
} as const;

export const CatalogSlideSchema = z.strictObject({
  ...SlideBaseShape,
  layout: LayoutIdSchema,
  props: LayoutPropsSchema,
});
export type CatalogSlide = z.infer<typeof CatalogSlideSchema>;

export const FreeSlideSchema = z.strictObject({
  ...SlideBaseShape,
  layout: z.literal('free'),
  blocks: BlockListSchema.max(DECK_LIMITS.freeBlocks),
});
export type FreeSlide = Omit<z.infer<typeof FreeSlideSchema>, 'blocks'> & { blocks: Block[] };

/** The id a generated deck registers its own slide component under (`src/custom-slides.ts`). */
export const CustomSlideComponentIdSchema = SlugSchema;

/**
 * A slide rendered by a component the generated prototype owns (level 2),
 * registered under `props.component`. `data` is bounded JSON, capped like
 * catalog props, and is all the component receives besides its own slide and
 * step. The player (level 1) has no owned code and shows a labelled
 * placeholder. Reveal steps come from the slide's `steps` labels.
 */
export const CustomSlideSchema = z.strictObject({
  ...SlideBaseShape,
  layout: z.literal('custom'),
  props: z.strictObject({
    component: CustomSlideComponentIdSchema,
    data: LayoutPropsSchema.optional(),
  }),
});
export type CustomSlide = z.infer<typeof CustomSlideSchema>;

export const DeckSlideSchema = z.union([CatalogSlideSchema, FreeSlideSchema, CustomSlideSchema]);

/** True for a `layout: "custom"` slide. */
export function isCustomSlide(slide: { layout: string }): slide is CustomSlide {
  return slide.layout === 'custom';
}
export type DeckSlide = z.infer<typeof DeckSlideSchema>;

export const DeckSectionSchema = z.strictObject({
  id: SlugSchema,
  title: z.string().max(DECK_LIMITS.sectionTitle).optional(),
  slideIds: z.array(SlugSchema).min(1).max(DECK_LIMITS.sectionSlides),
});
export type DeckSection = z.infer<typeof DeckSectionSchema>;

export const DeckOutlineSchema = z.strictObject({
  title: z.string().max(DECK_LIMITS.sectionTitle).optional(),
  sections: z.array(DeckSectionSchema).min(1).max(DECK_LIMITS.sections),
});
export type DeckOutline = z.infer<typeof DeckOutlineSchema>;

/**
 * Media and links inside catalog props follow the deck policies: a `src` or
 * `poster` passes `checkDeckMediaSrc` (relative paths, bounded data: URIs,
 * avatars; a `src` under a `video` key is a video), and an `href` passes the
 * blocks link policy (http(s), mailto, #anchor or relative; never
 * `javascript:` or protocol-relative).
 */
type UrlIssueSink = (path: (string | number)[], message: string) => void;

function checkPropUrls(
  value: unknown,
  path: (string | number)[],
  report: UrlIssueSink,
  inVideo = false
): void {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries())
      checkPropUrls(item, [...path, index], report, inVideo);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const here = [...path, key];
    if ((key === 'src' || key === 'poster') && typeof child === 'string') {
      const check = checkDeckMediaSrc(child, key === 'src' && inVideo ? 'video' : 'image');
      if (!check.ok) report(here, check.reason);
    } else if (key === 'href' && typeof child === 'string') {
      if (!LinkHrefSchema.safeParse(child).success) {
        report(here, 'Use an http(s), mailto, #anchor or relative link');
      }
    } else {
      checkPropUrls(child, here, report, inVideo || key === 'video');
    }
  }
}

/**
 * A `fragment` or `reveal` without a `step` in catalog props is refused: it
 * would reveal nothing, and the strict layout props do not take it as
 * content. (`@texuli/deck` drops a lone effect key silently, so Protoyard
 * keeps this check.)
 */
function checkSteplessEffects(value: unknown, path: (string | number)[], report: UrlIssueSink) {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      checkSteplessEffects(item, [...path, index], report);
    }
    return;
  }
  if (value === null || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  if (!Object.hasOwn(record, 'step')) {
    for (const key of ['fragment', 'reveal']) {
      if (Object.hasOwn(record, key)) {
        report(path, `\`${key}\` needs a \`step\`: add one, or remove \`${key}\`.`);
        break;
      }
    }
  }
  for (const [key, child] of Object.entries(record))
    checkSteplessEffects(child, [...path, key], report);
}

export const DeckSchema = z
  .strictObject({
    style: DeckStyleSchema,
    slides: z.array(DeckSlideSchema).min(1).max(DECK_LIMITS.slides),
    outline: DeckOutlineSchema.optional(),
  })
  .superRefine((deck, ctx) => {
    // Protoyard's offline media and link policy (Texuli checks URL syntax only).
    const policy = new Set<string>();
    const report: UrlIssueSink = (path, message) => {
      policy.add(JSON.stringify(path));
      ctx.addIssue({ code: 'custom', path, message });
    };
    deck.slides.forEach((slide, index) => {
      if (isCustomSlide(slide)) {
        checkPropUrls(slide.props.data ?? {}, ['slides', index, 'props', 'data'], report);
      } else if ('props' in slide) {
        checkPropUrls(slide.props, ['slides', index, 'props'], report);
        checkSteplessEffects(slide.props, ['slides', index, 'props'], report);
      }
    });
    // The deck model: layouts and their props, step markers, ids and outline references.
    // A URL the policy already refused is reported once, with the policy's reason.
    for (const issue of checkProtoyardDeck(deck).errors) {
      if (policy.has(JSON.stringify(issue.path))) continue;
      // Links follow Protoyard's policy (checked above for every `href` in props): it also
      // allows http(s) and the deck's own `#/<slide-id>/<step>` routes, which the model refuses.
      if (issue.path[issue.path.length - 1] === 'href') continue;
      // The model's diagnostic code rides along (`safeParseDeck` reports it as the issue code).
      ctx.addIssue({
        code: 'custom',
        path: [...issue.path],
        message: issue.message,
        params: { deckCode: issue.code },
      });
    }
  });

export type Deck = z.infer<typeof DeckSchema>;

/**
 * A JSON Schema document for agent prompts and editor integrations. Pure: a
 * renderer that never reads it (DeckApp) leaves zod's JSON Schema converter out
 * of its bundle.
 */
export const DeckJsonSchema = /* @__PURE__ */ z.toJSONSchema(DeckSchema, {
  io: 'input',
  target: 'draft-2020-12',
});

export type DeckIssue = {
  code: string;
  path: (string | number)[];
  jsonPath: string;
  message: string;
};

export type DeckParseResult =
  | { success: true; deck: Deck; issues: [] }
  | { success: false; deck: null; issues: DeckIssue[] };

function toJsonPath(path: readonly (string | number)[]): string {
  return path.reduce<string>((result, part) => {
    if (typeof part === 'number') return `${result}[${part}]`;
    return /^[A-Za-z_$][\w$]*$/.test(part)
      ? `${result}.${part}`
      : `${result}[${JSON.stringify(part)}]`;
  }, '$');
}

function unsafePropertyPath(
  value: unknown,
  path: (string | number)[] = [],
  seen = new WeakSet<object>()
): (string | number)[] | null {
  if (value === null || typeof value !== 'object') return null;
  if (seen.has(value)) return null;
  seen.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !('value' in descriptor)) continue;
      const found = unsafePropertyPath(descriptor.value, [...path, index], seen);
      if (found) return found;
    }
    return null;
  }
  for (const key of Object.keys(value)) {
    const currentPath = [...path, key];
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') return currentPath;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) continue;
    const found = unsafePropertyPath(descriptor.value, currentPath, seen);
    if (found) return found;
  }
  return null;
}

/** Parse an unknown deck and expose stable JSON paths for authoring feedback. */
export function safeParseDeck(input: unknown): DeckParseResult {
  const unsafePath = unsafePropertyPath(input);
  if (unsafePath) {
    return {
      success: false,
      deck: null,
      issues: [
        {
          code: 'unsafe-key',
          path: unsafePath,
          jsonPath: toJsonPath(unsafePath),
          message: 'Deck input contains a prototype-related key.',
        },
      ],
    };
  }
  const result = DeckSchema.safeParse(input);
  if (result.success) return { success: true, deck: result.data, issues: [] };
  return {
    success: false,
    deck: null,
    issues: result.error.issues.map((item) => ({
      code:
        item.code === 'custom' && typeof item.params?.deckCode === 'string'
          ? item.params.deckCode
          : item.code,
      path: [...item.path] as (string | number)[],
      jsonPath: toJsonPath(item.path as (string | number)[]),
      message: item.message,
    })),
  };
}
