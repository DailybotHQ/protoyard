/**
 * Map Protoyard text-family blocks to shapes Texuli TextBlockView accepts.
 * Divider is structure in Texuli; callers route it separately.
 */
import type { Block } from '@protoyard/blocks';

export function toTexuliTextBlock(block: Block): unknown {
  switch (block.type) {
    case 'heading':
      return {
        type: 'heading',
        id: block.id,
        tone: block.tone,
        level: block.level ?? 2,
        text: block.text,
        eyebrow: block.eyebrow,
        subtitle: block.subtitle,
      };
    case 'text':
      return {
        type: 'text',
        id: block.id,
        tone: block.tone,
        markdown: block.markdown,
      };
    case 'list':
      return {
        type: 'list',
        id: block.id,
        tone: block.tone,
        ordered: block.style === 'number',
        items: (block.items ?? []).map((item) => ({
          text: item.text,
        })),
      };
    case 'quote':
      return {
        type: 'quote',
        id: block.id,
        tone: block.tone,
        quote: block.quote,
        cite: block.cite,
      };
    case 'callout':
      return {
        type: 'callout',
        id: block.id,
        tone: block.tone,
        title: block.title,
        body: block.body,
      };
    default:
      return block;
  }
}

export function isTexuliTextType(type: string): boolean {
  return (
    type === 'heading' ||
    type === 'text' ||
    type === 'list' ||
    type === 'quote' ||
    type === 'callout'
  );
}
