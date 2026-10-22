/**
 * `@protoyard/blocks/diagram` — bounded, data-only diagram models and layout
 * math. Renderers turn these positions and edges into accessible HTML or SVG;
 * labels remain text and are never baked into images.
 */

export {
  type DiagramEdge,
  type DiagramLayout,
  type DiagramPosition,
  layoutBoard,
  layoutFlow,
  layoutTerminal,
  layoutTree,
} from './layout.ts';
export {
  type BoardDiagram,
  BoardDiagramSchema,
  type Diagram,
  type DiagramParseResult,
  DiagramSchema,
  diagramJsonPath,
  type FlowDiagram,
  FlowDiagramSchema,
  parseDiagram,
  type TerminalDiagram,
  TerminalDiagramSchema,
  type TreeDiagram,
  TreeDiagramSchema,
} from './schema.ts';
