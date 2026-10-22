import type { Block } from '@protoyard/blocks';
import { CODE_LANGUAGES, isBlockIcon, safeParseBlocks } from '@protoyard/blocks';
import { DECK_INTERACTIVE_ATTRIBUTE, parseLayoutProps } from '@protoyard/decks';
import { LAYOUT_FAMILIES, type LayoutFamily } from './families.ts';

export { LAYOUT_FAMILIES, type LayoutFamily } from './families.ts';

const asObject = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

/** Translate the public, data-only layout props to the shared block vocabulary. */
function blocksFor(id: string, input: unknown): unknown[] {
  const p = asObject(input);
  const title = typeof p.title === 'string' ? p.title : undefined;
  const text = (value: unknown) => (typeof value === 'string' ? value : undefined);
  const heading = (value: string, extra: Record<string, unknown> = {}) => ({
    type: 'heading',
    text: value,
    level: 2,
    ...extra,
  });
  const image = (value: unknown, extra: Record<string, unknown> = {}) => {
    const media = asObject(value);
    const alt = typeof media.alt === 'string' ? media.alt.trim() : '';
    return {
      type: 'image',
      src: media.src,
      ...(alt ? { alt } : { decorative: true }),
      width: media.width ?? 640,
      height: media.height ?? 480,
      ...extra,
    };
  };
  const video = (value: unknown, extra: Record<string, unknown> = {}) => {
    const media = asObject(value);
    return {
      type: 'video',
      src: media.src,
      label: media.label ?? title ?? 'Presentation video',
      width: media.width ?? 960,
      height: media.height ?? 540,
      muted: media.muted,
      autoplay: media.autoplay,
      loop: media.loop,
      controls: true,
      ...extra,
    };
  };

  switch (id) {
    case 'title-hero':
      return [
        heading(text(p.title) ?? '', { level: 1, subtitle: p.subtitle }),
        ...(p.meta ? [{ type: 'text', markdown: p.meta, size: 'md' }] : []),
      ];
    case 'section-divider':
      return [heading(text(p.title) ?? '', { level: 1, eyebrow: p.eyebrow })];
    case 'two-column-split': {
      const left = asObject(p.left);
      const right = asObject(p.right);
      return [
        ...(title ? [heading(title)] : []),
        {
          type: 'columns',
          columns: [
            [
              ...(text(left.heading) ? [heading(text(left.heading) ?? '')] : []),
              { type: 'text', markdown: text(left.body) ?? '' },
            ],
            [
              ...(text(right.heading) ? [heading(text(right.heading) ?? '')] : []),
              { type: 'text', markdown: text(right.body) ?? '' },
            ],
          ],
        },
      ];
    }
    case 'three-column-cards':
      return [
        ...(title ? [heading(title)] : []),
        {
          type: 'cards',
          items: Array.isArray(p.cards)
            ? p.cards.map((card) => {
                const item = asObject(card);
                return {
                  title: item.heading,
                  body: item.body,
                  icon: isBlockIcon(item.icon) ? item.icon : undefined,
                };
              })
            : [],
        },
      ];
    case 'image-left':
    case 'image-right': {
      const media = image(p.image);
      const copy = [
        ...(text(p.heading) ? [heading(text(p.heading) ?? '')] : []),
        { type: 'text', markdown: text(p.body) ?? '' },
      ];
      return [
        ...(title ? [heading(title)] : []),
        {
          type: 'columns',
          align: 'center',
          widths: id === 'image-left' ? 'wide-start' : 'wide-end',
          columns: id === 'image-left' ? [[media], copy] : [copy, [media]],
        },
      ];
    }
    case 'image-centered':
      return [
        ...(title ? [heading(title)] : []),
        image(p.image, { caption: p.caption, fit: 'contain' }),
      ];
    case 'image-full-bleed':
      return [image(p.image, { caption: p.caption, credit: p.credit, fit: 'cover' })];
    case 'quote':
      return [{ type: 'quote', quote: p.quote, cite: p.cite }];
    case 'code-with-callout': {
      const codeProps = asObject(p.code);
      const highlights = Array.isArray(codeProps.highlights) ? codeProps.highlights : undefined;
      return [
        ...(title ? [heading(title)] : []),
        {
          type: 'columns',
          widths: 'wide-start',
          columns: [
            [
              {
                type: 'code',
                code: codeProps.source,
                lang: (CODE_LANGUAGES as readonly unknown[]).includes(codeProps.lang)
                  ? codeProps.lang
                  : 'text',
                highlights: highlights && highlights.length > 0 ? highlights : undefined,
              },
            ],
            [
              ...(text(p.heading) ? [heading(text(p.heading) ?? '')] : []),
              {
                type: 'list',
                items: Array.isArray(p.bullets) ? p.bullets.map((item) => ({ text: item })) : [],
              },
            ],
          ],
        },
      ];
    }
    case 'big-stat':
      return [
        {
          type: 'stat',
          items: [{ value: p.number, label: p.label, context: p.context }],
          source: p.source,
        },
      ];
    case 'comparison-table':
      return [
        ...(title ? [heading(title)] : []),
        {
          type: 'comparison',
          columns: Array.isArray(p.columns) ? p.columns.map((label) => ({ label })) : [],
          rows: Array.isArray(p.rows)
            ? p.rows.map((row) => ({
                label: asObject(row).label,
                values: Array.isArray(asObject(row).values)
                  ? (asObject(row).values as unknown[]).map((value) => value ?? '—')
                  : [],
              }))
            : [],
        },
      ];
    case 'process-steps':
      return [
        { type: 'steps', title, numbered: true, items: Array.isArray(p.steps) ? p.steps : [] },
      ];
    case 'timeline':
      return [
        {
          type: 'timeline',
          title,
          orientation: 'horizontal',
          events: Array.isArray(p.events)
            ? p.events.map((event) => ({ time: asObject(event).time, title: asObject(event).text }))
            : [],
        },
      ];
    case 'team-avatars':
      return [{ type: 'people', title, layout: 'row', people: p.people }];
    case 'closing-cta':
      return [
        { type: 'cta', title, body: p.text, actions: [asObject(p.cta)], footnote: p.footnote },
      ];
    case 'video-centered':
      return [...(title ? [heading(title)] : []), video(p.video, { caption: p.caption })];
    case 'video-left':
    case 'video-right': {
      const media = video(p.video);
      const copy = [
        ...(text(p.heading) ? [heading(text(p.heading) ?? '')] : []),
        { type: 'text', markdown: text(p.body) ?? '' },
      ];
      return [
        ...(title ? [heading(title)] : []),
        {
          type: 'columns',
          align: 'center',
          widths: id === 'video-left' ? 'wide-start' : 'wide-end',
          columns: id === 'video-left' ? [[media], copy] : [copy, [media]],
        },
      ];
    }
    case 'chart':
      return [{ type: 'chart', spec: p.spec, height: p.height, showTable: p.showTable }];
    case 'free':
      return Array.isArray(p.blocks) ? p.blocks : [];
    default:
      return [];
  }
}

export type LayoutComposition =
  | { ok: true; blocks: Block[]; family: LayoutFamily }
  | { ok: false; message: string };

/** Validate at the untrusted boundary before any layout reaches a renderer. */
export function composeLayout(id: string, props: unknown): LayoutComposition {
  if (!Object.hasOwn(LAYOUT_FAMILIES, id))
    return { ok: false, message: 'This slide layout is not available.' };
  const family = LAYOUT_FAMILIES[id as keyof typeof LAYOUT_FAMILIES];
  const parsedProps = parseLayoutProps(id, props);
  if (!parsedProps.success) return { ok: false, message: 'This slide layout has invalid content.' };
  const parsedBlocks = safeParseBlocks(blocksFor(id, parsedProps.data));
  if (!parsedBlocks.success)
    return { ok: false, message: 'This slide layout could not be composed safely.' };
  return { ok: true, blocks: parsedBlocks.data, family };
}

const INTERACTIVE_TYPES = new Set([
  'tabs',
  'reveal',
  'poll',
  'quiz',
  'calculator',
  'counter',
  'chart-controls',
  'map',
  'embed-app',
  'form',
  'chart',
  'table',
  'stat',
  'code',
]);

function containsDeckControl(block: Block): boolean {
  if (INTERACTIVE_TYPES.has(block.type)) return true;
  if (block.type === 'columns')
    return block.columns.some((column) => column.some(containsDeckControl));
  if (block.type === 'tabs')
    return block.panels.some((panel) => panel.blocks.some(containsDeckControl));
  if (block.type === 'reveal') return block.blocks.some(containsDeckControl);
  return false;
}

/** Per-block attributes keep controls inside these blocks from advancing a deck. */
export function deckInputGuardAttributes(block: Block): Record<string, string> {
  return containsDeckControl(block) ? { [DECK_INTERACTIVE_ATTRIBUTE]: '' } : {};
}
