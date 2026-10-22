import {
  BLOCK_REVEALS,
  type Block,
  BlockListSchema,
  duplicateBlockIdIssues,
  LinkHrefSchema,
} from '@protoyard/blocks';
import { z } from 'zod';
import { checkDeckMediaSrc } from '../backgrounds/media.ts';
import { DeckBackgroundSchema } from '../backgrounds/schema.ts';
import { DECK_ASPECTS } from '../canvas.ts';
import { parseLayoutProps } from '../layouts/catalog.ts';
import { stripStepMarkers } from '../layouts/props.ts';
import { FRAGMENT_EFFECTS } from '../motion/effects.ts';

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
const TransitionSchema = z.enum(['none', 'fade', 'slide', 'zoom', 'morph']);
const ProgressSchema = z.enum(['none', 'top', 'bottom']);
const StepMarkerSchema = z
  .strictObject({
    step: z.number().int().min(0).max(1_000),
    fragment: z.enum(FRAGMENT_EFFECTS).optional(),
    reveal: z.enum(BLOCK_REVEALS).optional(),
  })
  .refine((marker) => !(marker.fragment !== undefined && marker.reveal !== undefined), {
    message: 'A step marker may set fragment or reveal, not both.',
  });

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

/** Validate step metadata before removing it from catalog content props. */
function validateStepMarkers(
  value: unknown,
  path: (string | number)[],
  ctx: z.RefinementCtx
): void {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      validateStepMarkers(item, [...path, index], ctx);
    }
    return;
  }
  if (value === null || typeof value !== 'object') return;

  const record = value as Record<string, unknown>;
  if (Object.hasOwn(record, 'step')) {
    const marker = Object.fromEntries(
      ['step', 'fragment', 'reveal']
        .filter((key) => Object.hasOwn(record, key))
        .map((key) => [key, record[key]])
    );
    const parsedMarker = StepMarkerSchema.safeParse(marker);
    if (!parsedMarker.success) {
      for (const issue of parsedMarker.error.issues) {
        ctx.addIssue({
          code: 'custom',
          path: [...path, ...issue.path],
          message: issue.message,
        });
      }
    }
  }

  for (const [key, item] of Object.entries(record)) {
    validateStepMarkers(item, [...path, key], ctx);
  }
}

/**
 * Media and links inside catalog props follow the deck policies: a `src` or
 * `poster` passes `checkDeckMediaSrc` (relative paths, bounded data: URIs,
 * avatars; a `src` under a `video` key is a video), and an `href` passes the
 * blocks link policy (http(s), mailto, #anchor or relative; never
 * `javascript:` or protocol-relative).
 */
function checkPropUrls(
  value: unknown,
  path: (string | number)[],
  ctx: z.RefinementCtx,
  inVideo = false
): void {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries())
      checkPropUrls(item, [...path, index], ctx, inVideo);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const here = [...path, key];
    if ((key === 'src' || key === 'poster') && typeof child === 'string') {
      const check = checkDeckMediaSrc(child, key === 'src' && inVideo ? 'video' : 'image');
      if (!check.ok) ctx.addIssue({ code: 'custom', path: here, message: check.reason });
    } else if (key === 'href' && typeof child === 'string') {
      if (!LinkHrefSchema.safeParse(child).success) {
        ctx.addIssue({
          code: 'custom',
          path: here,
          message: 'Use an http(s), mailto, #anchor or relative link',
        });
      }
    } else {
      checkPropUrls(child, here, ctx, inVideo || key === 'video');
    }
  }
}

export const DeckSchema = z
  .strictObject({
    style: DeckStyleSchema,
    slides: z.array(DeckSlideSchema).min(1).max(DECK_LIMITS.slides),
    outline: DeckOutlineSchema.optional(),
  })
  .superRefine((deck, ctx) => {
    // Block ids key interactive state and embedded-app storage: unique across slides.
    for (const issue of duplicateBlockIdIssues(
      deck.slides.flatMap((slide, index) =>
        'blocks' in slide
          ? [{ path: ['slides', index, 'blocks'], blocks: slide.blocks as Block[] }]
          : []
      ),
      { crossListOnly: true }
    )) {
      ctx.addIssue({ code: 'custom', ...issue });
    }
    const slidePaths = new Map<string, number>();
    deck.slides.forEach((slide, index) => {
      if (isCustomSlide(slide)) {
        // The owned component reads its data as given; links and media follow the deck policies.
        checkPropUrls(slide.props.data ?? {}, ['slides', index, 'props', 'data'], ctx);
      } else if ('props' in slide) {
        validateStepMarkers(slide.props, ['slides', index, 'props'], ctx);
        const props = stripStepMarkers(slide.props);
        checkPropUrls(props, ['slides', index, 'props'], ctx);
        const parsedProps = parseLayoutProps(slide.layout, props);
        if (!parsedProps.success) {
          for (const issue of parsedProps.issues) {
            ctx.addIssue({
              code: 'custom',
              path:
                issue.path[0] === 'layout'
                  ? ['slides', index, 'layout']
                  : ['slides', index, 'props', ...issue.path],
              message: issue.message,
            });
          }
        }
      }

      const first = slidePaths.get(slide.id);
      if (first !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['slides', index, 'id'],
          message: `Duplicate slide id "${slide.id}" (first used at slides[${first}].id).`,
        });
      } else {
        slidePaths.set(slide.id, index);
      }
    });

    if (!deck.outline) return;
    const sectionIds = new Set<string>();
    deck.outline.sections.forEach((section, sectionIndex) => {
      if (sectionIds.has(section.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['outline', 'sections', sectionIndex, 'id'],
          message: `Duplicate section id "${section.id}".`,
        });
      }
      sectionIds.add(section.id);

      const seenSlideIds = new Set<string>();
      section.slideIds.forEach((slideId, slideIndex) => {
        if (seenSlideIds.has(slideId)) {
          ctx.addIssue({
            code: 'custom',
            path: ['outline', 'sections', sectionIndex, 'slideIds', slideIndex],
            message: `Duplicate slide id "${slideId}" in section "${section.id}".`,
          });
        }
        seenSlideIds.add(slideId);
        if (!slidePaths.has(slideId)) {
          ctx.addIssue({
            code: 'custom',
            path: ['outline', 'sections', sectionIndex, 'slideIds', slideIndex],
            message: `Unknown slide id "${slideId}" in section "${section.id}".`,
          });
        }
      });
    });
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
      code: item.code,
      path: [...item.path] as (string | number)[],
      jsonPath: toJsonPath(item.path as (string | number)[]),
      message: item.message,
    })),
  };
}
