import { BLOCK_REVEALS, type Block, BlockListSchema, LinkHrefSchema } from '@protoyard/blocks';
import { z } from 'zod';
import { checkDeckMediaSrc } from '../backgrounds/media.ts';
import { DECK_ASPECTS } from '../canvas.ts';
import { parseLayoutProps } from '../layouts/catalog.ts';
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
const LayoutIdSchema = z.string().regex(/^(?!free$)[a-z0-9][a-z0-9-]{0,63}$/);
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
  background: SlugSchema.optional(),
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

export const DeckSlideSchema = z.union([CatalogSlideSchema, FreeSlideSchema]);
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

const STEP_MARKER_KEYS = new Set(['step', 'fragment', 'reveal']);

/** Remove animation metadata before checking a catalog's strict content props. */
function stripStepMarkers(
  value: unknown,
  path: (string | number)[],
  ctx: z.RefinementCtx
): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) => stripStepMarkers(item, [...path, index], ctx));
  }
  if (value === null || typeof value !== 'object') return value;

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

  const cleaned: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(record)) {
    if (Object.hasOwn(record, 'step') && STEP_MARKER_KEYS.has(key)) continue;
    cleaned[key] = stripStepMarkers(item, [...path, key], ctx);
  }
  return cleaned;
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
    const slidePaths = new Map<string, number>();
    deck.slides.forEach((slide, index) => {
      if ('props' in slide) {
        const props = stripStepMarkers(slide.props, ['slides', index, 'props'], ctx);
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

/** A JSON Schema document for agent prompts and editor integrations. */
export const DeckJsonSchema = z.toJSONSchema(DeckSchema, {
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
