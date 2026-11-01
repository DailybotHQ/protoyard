/**
 * Diagram layout math — `@texuli/blocks/diagram/engine`, with one mapping:
 * Protoyard's tree block keeps `style` (the blueprint format), Texuli's tree
 * names it `variant` since 0.9 (`layoutTree` reads only `variant`).
 * Renderers turn positions and edges into accessible HTML or SVG; labels
 * stay text.
 */

import { layoutTree as texuliLayoutTree } from '@texuli/blocks/diagram/engine';
import type { TreeDiagram } from './schema.ts';

export {
  type DiagramEdge,
  type DiagramLayout,
  type DiagramPosition,
  layoutBoard,
  layoutFlow,
  layoutTerminal,
} from '@texuli/blocks/diagram/engine';

type TexuliTree = Parameters<typeof texuliLayoutTree>[0];

/** A Protoyard tree block as Texuli's tree: `style` becomes `variant`. */
export function toTexuliTree(tree: TreeDiagram): TexuliTree {
  const { style, ...rest } = tree;
  return { ...rest, variant: style } as TexuliTree;
}

/** Any block, ready for Texuli's diagram renderer (only trees change). */
export function toTexuliDiagram<B extends { type: string }>(block: B): B {
  return block.type === 'tree'
    ? (toTexuliTree(block as unknown as TreeDiagram) as unknown as B)
    : block;
}

export function layoutTree(tree: TreeDiagram) {
  return texuliLayoutTree(toTexuliTree(tree));
}
