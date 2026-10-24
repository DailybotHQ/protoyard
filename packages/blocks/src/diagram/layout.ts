/**
 * Diagram layout math — thin re-export of `@texuli/blocks/diagram`.
 * Renderers turn positions and edges into accessible HTML or SVG; labels
 * stay text.
 */

export {
  type DiagramEdge,
  type DiagramLayout,
  type DiagramPosition,
  layoutBoard,
  layoutFlow,
  layoutTerminal,
  layoutTree,
} from '@texuli/blocks/diagram';
