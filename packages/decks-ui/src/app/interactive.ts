import type { Block } from '@protoyard/blocks';

/** Blocks with their own controls: clicks and keys inside them never move the deck. */
const INTERACTIVE_TYPES: ReadonlySet<string> = new Set([
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

/** True when `block` (or a block nested in it) has its own controls. */
export function containsDeckControl(block: Block): boolean {
  if (INTERACTIVE_TYPES.has(block.type)) return true;
  if (block.type === 'columns')
    return block.columns.some((column) => column.some(containsDeckControl));
  return false;
}
