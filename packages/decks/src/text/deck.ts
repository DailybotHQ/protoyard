import { safeHref, safeImageSrc } from '@protoyard/ai/markdown';
import type { Block } from '@protoyard/blocks';
import type { z } from 'zod';
import { parseLayoutProps } from '../layouts/catalog.ts';
import type {
  BigStatPropsSchema,
  ChartLayoutPropsSchema,
  ClosingCtaPropsSchema,
  CodeWithCalloutPropsSchema,
  ComparisonTablePropsSchema,
  ImageCenteredPropsSchema,
  ImageFullBleedPropsSchema,
  ImageSidePropsSchema,
  ProcessStepsPropsSchema,
  QuotePropsSchema,
  SectionDividerPropsSchema,
  TeamAvatarsPropsSchema,
  ThreeColumnCardsPropsSchema,
  TimelinePropsSchema,
  TitleHeroPropsSchema,
  TwoColumnSplitPropsSchema,
  VideoCenteredPropsSchema,
  VideoSidePropsSchema,
} from '../layouts/props.ts';
import type { Deck, DeckSlide } from '../schema/index.ts';
import { blocksMarkdown } from './blocks.ts';
import { chartTable } from './chart.ts';
import {
  codeFence,
  escapeInline,
  escapeText,
  inlineCode,
  linkTarget,
  stripInvisible,
  table,
} from './escape.ts';

/**
 * Text twins of a deck: `deckToMarkdown` (a readable Markdown document for
 * accessibility, artifact descriptions and LLM context) and `deckOutline` (one
 * compact row per slide). Both are pure and deterministic: the same deck always
 * gives the same text, with no dates, random ids or locale formatting.
 */

export interface DeckTextOptions {
  /** Document title when the deck outline has none. Default `"Deck"`. */
  title?: string;
  /** Include slides marked `hidden`. Default false. */
  includeHidden?: boolean;
  /** Include speaker notes under a "Notes" heading. Default true. */
  notes?: boolean;
}

type Infer<S extends z.ZodType> = z.output<S>;

const join = (parts: readonly (string | false | undefined)[]) =>
  parts
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join('\n\n');

const h = (level: number, text: string) =>
  `${'#'.repeat(Math.min(6, level))} ${escapeInline(text)}`;
const bullets = (items: readonly string[]) =>
  items.map((item) => `- ${escapeInline(item)}`).join('\n');

function image(alt: string, src: string): string {
  const safe = safeImageSrc(src);
  return safe && !safe.startsWith('data:')
    ? `![${escapeInline(alt)}](${linkTarget(safe)})`
    : `*\\[Image: ${escapeInline(alt)}\\]*`;
}

function video(label: string | undefined): string {
  return `*\\[Video${label ? `: ${escapeInline(label)}` : ''}\\]*`;
}

/** Body Markdown per catalog layout, from its validated props. `level` is for sub-headings. */
const LAYOUT_BODY: Record<string, (props: never, level: number) => string> = {
  'title-hero': (p: Infer<typeof TitleHeroPropsSchema>) =>
    join([p.subtitle && escapeText(p.subtitle), p.meta && `*${escapeInline(p.meta)}*`]),
  'section-divider': (p: Infer<typeof SectionDividerPropsSchema>) =>
    join([p.eyebrow && `*${escapeInline(p.eyebrow)}*`]),
  'two-column-split': (p: Infer<typeof TwoColumnSplitPropsSchema>, level) =>
    join(
      [p.left, p.right].flatMap((side) => [
        side.heading && h(level, side.heading),
        escapeText(side.body),
      ])
    ),
  'three-column-cards': (p: Infer<typeof ThreeColumnCardsPropsSchema>, level) =>
    join(p.cards.flatMap((card) => [h(level, card.heading), escapeText(card.body)])),
  'image-left': imageSide,
  'image-right': imageSide,
  'image-centered': (p: Infer<typeof ImageCenteredPropsSchema>) =>
    join([image(p.image.alt, p.image.src), p.caption && `*${escapeInline(p.caption)}*`]),
  'image-full-bleed': (p: Infer<typeof ImageFullBleedPropsSchema>) =>
    join([
      image(p.image.alt, p.image.src),
      p.caption && `*${escapeInline(p.caption)}*`,
      p.credit && `*Credit: ${escapeInline(p.credit)}*`,
    ]),
  quote: (p: Infer<typeof QuotePropsSchema>) =>
    [...escapeText(p.quote).split('\n'), ...(p.cite ? ['', `— ${escapeInline(p.cite)}`] : [])]
      .map((line) => (line ? `> ${line}` : '>'))
      .join('\n'),
  'code-with-callout': (p: Infer<typeof CodeWithCalloutPropsSchema>, level) =>
    join([
      codeFence(p.code.source, p.code.lang),
      p.code.highlights?.length
        ? `*Highlighted lines, step by step: ${p.code.highlights.map(escapeInline).join(' → ')}*`
        : undefined,
      p.heading && h(level, p.heading),
      bullets(p.bullets),
    ]),
  'big-stat': (p: Infer<typeof BigStatPropsSchema>) =>
    join([
      `**${escapeInline(p.number)}** ${escapeInline(p.label)}`,
      p.context && escapeText(p.context),
      p.source && `*Source: ${escapeInline(p.source)}*`,
    ]),
  'comparison-table': (p: Infer<typeof ComparisonTablePropsSchema>) =>
    table(
      ['', ...p.columns],
      p.rows.map((row) => [
        row.label,
        ...row.values.map((v) => (v === true ? 'Yes' : v === false ? 'No' : (v ?? ''))),
      ])
    ),
  'process-steps': (p: Infer<typeof ProcessStepsPropsSchema>) =>
    p.steps
      .map(
        (step, i) =>
          `${i + 1}. **${escapeInline(step.title)}**${step.body ? ` ${escapeInline(step.body)}` : ''}`
      )
      .join('\n'),
  timeline: (p: Infer<typeof TimelinePropsSchema>) =>
    p.events
      .map((event) => `- **${escapeInline(event.time)}** ${escapeInline(event.text)}`)
      .join('\n'),
  'team-avatars': (p: Infer<typeof TeamAvatarsPropsSchema>) =>
    p.people
      .map(
        (person) =>
          `- **${escapeInline(person.name)}**${person.role ? ` — ${escapeInline(person.role)}` : ''}`
      )
      .join('\n'),
  'closing-cta': (p: Infer<typeof ClosingCtaPropsSchema>) => {
    const href = safeHref(p.cta.href);
    return join([
      p.text && escapeText(p.text),
      href ? `[${escapeInline(p.cta.label)}](${linkTarget(href)})` : escapeInline(p.cta.label),
      p.footnote && `*${escapeInline(p.footnote)}*`,
    ]);
  },
  'video-centered': (p: Infer<typeof VideoCenteredPropsSchema>) =>
    join([video(p.video.label), p.caption && `*${escapeInline(p.caption)}*`]),
  'video-left': videoSide,
  'video-right': videoSide,
  chart: (p: Infer<typeof ChartLayoutPropsSchema>) => chartTable(p.spec),
};

function imageSide(p: Infer<typeof ImageSidePropsSchema>, level: number): string {
  return join([
    image(p.image.alt, p.image.src),
    p.heading && h(level, p.heading),
    escapeText(p.body),
  ]);
}

function videoSide(p: Infer<typeof VideoSidePropsSchema>, level: number): string {
  return join([video(p.video.label), p.heading && h(level, p.heading), escapeText(p.body)]);
}

/** Props that fail their layout schema (or an unknown layout): every string, labelled by its key path. */
function genericProps(
  value: unknown,
  path: string[] = [],
  out: string[] = [],
  depth = 0
): string[] {
  if (depth > 6 || out.length >= 200) return out;
  if (typeof value === 'string') {
    out.push(`- ${path.length ? `${escapeInline(path.join('.'))}: ` : ''}${escapeInline(value)}`);
  } else if (typeof value === 'number' || typeof value === 'boolean') {
    out.push(`- ${escapeInline(path.join('.'))}: ${String(value)}`);
  } else if (Array.isArray(value)) {
    value.forEach((item, i) => {
      genericProps(item, [...path, String(i + 1)], out, depth + 1);
    });
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value))
      genericProps(item, [...path, key], out, depth + 1);
  }
  return out;
}

const isFree = (slide: DeckSlide): slide is DeckSlide & { blocks: Block[] } => 'blocks' in slide;

/** The title a slide is known by: its own, else the layout's title prop, else the first heading. */
export function slideTitle(slide: DeckSlide): string | null {
  const own = slide.title?.trim();
  if (own) return own;
  if (isFree(slide)) {
    const first = slide.blocks.find((block) => block.type === 'heading');
    return first && first.type === 'heading' ? first.text.trim() || null : null;
  }
  const props = slide.props as Record<string, unknown>;
  for (const key of ['title', 'heading', 'number']) {
    const value = props[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  if (slide.layout === 'quote' && typeof props.quote === 'string') {
    const quote = props.quote.trim().replace(/\s+/g, ' ');
    return quote.length > 60 ? `${quote.slice(0, 59)}…` : quote;
  }
  return null;
}

function slideBody(slide: DeckSlide, level: number): string {
  if (isFree(slide)) return blocksMarkdown(slide.blocks, level);
  const render = LAYOUT_BODY[slide.layout];
  const parsed = parseLayoutProps(slide.layout, slide.props);
  if (render && parsed.success) return render(parsed.data as never, level);
  const lines = genericProps(slide.props);
  return lines.length ? `*Layout ${inlineCode(slide.layout)}*\n\n${lines.join('\n')}` : '';
}

/** Visible slides in deck order, with the section each one opens (if any). */
function visibleSlides(deck: Deck, includeHidden: boolean) {
  const sectionOf = new Map<string, { id: string; title?: string }>();
  for (const section of deck.outline?.sections ?? []) {
    for (const slideId of section.slideIds) {
      if (!sectionOf.has(slideId)) sectionOf.set(slideId, { id: section.id, title: section.title });
    }
  }
  return deck.slides
    .filter((slide) => includeHidden || !slide.hidden)
    .map((slide, i) => ({ slide, number: i + 1, section: sectionOf.get(slide.id) ?? null }));
}

/** Never a valid section id (ids are lowercase slugs). */
const UNGROUPED = '#ungrouped';

/** The deck as a Markdown document. */
export function deckToMarkdown(deck: Deck, options: DeckTextOptions = {}): string {
  const includeNotes = options.notes ?? true;
  const slides = visibleSlides(deck, options.includeHidden ?? false);
  const hasSections = slides.some((entry) => entry.section !== null);
  const slideLevel = hasSections ? 3 : 2;
  const parts: string[] = [h(1, deck.outline?.title?.trim() || options.title?.trim() || 'Deck')];
  let currentSection: string | null = null;
  for (const { slide, number, section } of slides) {
    if (hasSections && section && section.id !== currentSection) {
      currentSection = section.id;
      parts.push(h(2, section.title?.trim() || section.id));
    } else if (hasSections && !section && currentSection !== null && currentSection !== UNGROUPED) {
      // A slide outside every section must not read as part of the previous one.
      currentSection = UNGROUPED;
      parts.push(h(2, 'Other slides'));
    }
    const title = slideTitle(slide);
    parts.push(
      join([
        `${'#'.repeat(slideLevel)} ${number}. ${title ? escapeInline(title) : `Slide ${number}`}`,
        slideBody(slide, slideLevel + 1),
        includeNotes &&
          slide.notes?.trim() &&
          join([h(slideLevel + 1, 'Notes'), escapeText(slide.notes)]),
      ])
    );
  }
  return `${parts.join('\n\n')}\n`;
}

export interface DeckOutlineSlide {
  /** 1-based position among the listed slides. */
  number: number;
  id: string;
  layout: string;
  /** `slideTitle`, or null when the slide has none. */
  title: string | null;
  /** The outline section the slide belongs to, if any. */
  section: string | null;
  hidden: boolean;
}

export interface DeckOutlineText {
  title: string | null;
  slides: DeckOutlineSlide[];
}

/** One compact row per slide: id, layout and title (for authoring hints, MCP and agents). */
export function deckOutline(
  deck: Deck,
  options: Pick<DeckTextOptions, 'includeHidden'> = {}
): DeckOutlineText {
  return {
    title: deck.outline?.title?.trim() || null,
    slides: visibleSlides(deck, options.includeHidden ?? true).map(
      ({ slide, number, section }) => ({
        number,
        id: slide.id,
        layout: slide.layout,
        title: slideTitle(slide),
        section: section?.id ?? null,
        hidden: slide.hidden === true,
      })
    ),
  };
}

/** The outline as plain lines: `3. pricing · comparison-table · Plans compared`. */
export function formatDeckOutline(outline: DeckOutlineText): string {
  const clean = (text: string) => stripInvisible(text).replace(/\s+/g, ' ').trim();
  return outline.slides
    .map(
      (slide) =>
        `${slide.number}. ${slide.id} · ${slide.layout}${slide.title ? ` · ${clean(slide.title)}` : ''}${slide.hidden ? ' (hidden)' : ''}`
    )
    .join('\n');
}
