/**
 * `@protoyard/blocks/diagram` — layout math from `@texuli/blocks/diagram`,
 * Zod schema adapters for flow/tree/board/terminal block documents.
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
