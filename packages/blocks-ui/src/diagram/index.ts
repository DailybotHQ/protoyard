/**
 * `@protoyard/blocks-ui/diagram` — flow, tree, board and terminal blocks.
 * Flow and org trees are drawn from `@protoyard/blocks/diagram` layouts (SVG
 * connectors, HTML boxes); file trees, boards and terminals are semantic
 * lists. Labels always stay text, and every diagram has a text alternative.
 */
export { default as BoardDiagram } from './BoardDiagram.svelte';
export { default as BlockFamilyRenderer } from './DiagramFamily.svelte';
export { default as FlowDiagram } from './FlowDiagram.svelte';
export { default as TerminalDiagram } from './TerminalDiagram.svelte';
export { default as TreeDiagram } from './TreeDiagram.svelte';
export { TONE_BORDER } from './tones.ts';
