/**
 * Map Protoyard structure/tabs/divider/cta/cards/columns to Texuli structure.
 */
import type { Block } from '@protoyard/blocks';

export function toTexuliStructureBlock(block: Block): unknown {
  if (block.type === 'columns') {
    return {
      type: 'columns',
      id: block.id,
      tone: block.tone,
      columns: block.columns,
    };
  }
  if (block.type === 'tabs') {
    return {
      type: 'tabs',
      id: block.id ?? 'tabs',
      tone: block.tone,
      label: block.label ?? 'Tabs',
      panels: (block.panels ?? []).map((p) => ({
        id: p.id,
        label: p.label,
        blocks: p.blocks ?? [],
      })),
      defaultPanel: block.defaultPanel,
    };
  }
  if (block.type === 'cards') {
    return {
      type: 'cards',
      id: block.id,
      tone: block.tone,
      title: block.title,
      columns: block.columns,
      items: (block.items ?? []).map((item) => ({
        title: item.title,
        eyebrow: item.eyebrow,
        body: item.body,
        href: item.href,
        tone: item.tone,
      })),
    };
  }
  if (block.type === 'cta') {
    return {
      type: 'cta',
      id: block.id,
      tone: block.tone,
      actions: block.actions,
    };
  }
  if (block.type === 'divider') {
    return { type: 'divider', id: block.id, tone: block.tone };
  }
  return block;
}

export const TEXULI_STRUCTURE_TYPES = new Set([
  'columns',
  'grid',
  'tabs',
  'accordion',
  'cards',
  'divider',
  'cta',
]);
export const PROTOYARD_STRUCTURE_EXTENSIONS = new Set(['timeline', 'steps', 'comparison', 'icon']);
