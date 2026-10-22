import type { BoardDiagram, FlowDiagram, TerminalDiagram, TreeDiagram } from './schema.ts';

export interface DiagramPosition {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  tone?: string;
  kind?: 'prompt' | 'output' | 'comment';
}

export interface DiagramEdge {
  from: string;
  to: string;
  kind: 'flow' | 'parent' | 'loop-back';
}

export interface DiagramLayout {
  width: number;
  height: number;
  positions: DiagramPosition[];
  edges: DiagramEdge[];
}

const FLOW_NODE_WIDTH = 160;
const FLOW_NODE_HEIGHT = 64;
const FLOW_GAP = 48;
const TREE_NODE_WIDTH = 176;
const TREE_NODE_HEIGHT = 56;
const TREE_X_GAP = 48;
const TREE_Y_GAP = 40;
const BOARD_COLUMN_WIDTH = 224;
const BOARD_CARD_WIDTH = 200;
const BOARD_CARD_HEIGHT = 64;
const BOARD_ROW_GAP = 16;

export function layoutFlow(diagram: FlowDiagram): DiagramLayout {
  const positions = diagram.nodes.map((node, index) => ({
    id: node.id,
    x: index * (FLOW_NODE_WIDTH + FLOW_GAP),
    y: 0,
    width: FLOW_NODE_WIDTH,
    height: FLOW_NODE_HEIGHT,
    label: node.label,
    ...(node.tone === undefined ? {} : { tone: node.tone }),
  }));
  const edges: DiagramEdge[] = diagram.nodes.slice(1).map((node, index) => ({
    from: diagram.nodes[index]?.id ?? '',
    to: node.id,
    kind: 'flow' as const,
  }));
  if (diagram.loopBack && diagram.nodes.length > 1) {
    edges.push({
      from: diagram.nodes.at(-1)?.id ?? '',
      to: diagram.nodes[0]?.id ?? '',
      kind: 'loop-back',
    });
  }
  return {
    width: diagram.nodes.length * FLOW_NODE_WIDTH + (diagram.nodes.length - 1) * FLOW_GAP,
    height: FLOW_NODE_HEIGHT + (diagram.loopBack ? 40 : 0),
    positions,
    edges,
  };
}

export function layoutTree(diagram: TreeDiagram): DiagramLayout {
  const byId = new Map(diagram.nodes.map((node) => [node.id, node]));
  const children = new Map<string | null, string[]>();
  for (const node of diagram.nodes) {
    const list = children.get(node.parentId) ?? [];
    list.push(node.id);
    children.set(node.parentId, list);
  }
  const roots = children.get(null) ?? [];
  const positions = new Map<string, DiagramPosition>();
  const edges: DiagramEdge[] = [];
  if (diagram.style === 'file-tree') {
    let row = 0;
    const walk = (id: string, depth: number) => {
      const node = byId.get(id);
      if (!node) return;
      positions.set(id, {
        id,
        x: depth * (TREE_NODE_WIDTH / 2),
        y: row * (TREE_NODE_HEIGHT + TREE_Y_GAP),
        width: TREE_NODE_WIDTH,
        height: TREE_NODE_HEIGHT,
        label: node.label,
        ...(node.tone === undefined ? {} : { tone: node.tone }),
      });
      row += 1;
      for (const childId of children.get(id) ?? []) {
        edges.push({ from: id, to: childId, kind: 'parent' });
        walk(childId, depth + 1);
      }
    };
    for (const root of roots) walk(root, 0);
    const width = Math.max(
      TREE_NODE_WIDTH,
      ...[...positions.values()].map((position) => position.x + position.width)
    );
    const height = Math.max(
      TREE_NODE_HEIGHT,
      positions.size * (TREE_NODE_HEIGHT + TREE_Y_GAP) - TREE_Y_GAP
    );
    return { width, height, positions: [...positions.values()], edges };
  }

  let leaf = 0;
  let maxDepth = 0;
  const place = (id: string, depth: number): number => {
    const node = byId.get(id);
    if (!node) return 0;
    maxDepth = Math.max(maxDepth, depth);
    const childIds = children.get(id) ?? [];
    let x: number;
    if (childIds.length === 0) {
      x = leaf * (TREE_NODE_WIDTH + TREE_X_GAP);
      leaf += 1;
    } else {
      const childXs = childIds.map((childId) => {
        edges.push({ from: id, to: childId, kind: 'parent' });
        return place(childId, depth + 1);
      });
      x = ((childXs[0] ?? 0) + (childXs.at(-1) ?? 0)) / 2;
    }
    positions.set(id, {
      id,
      x,
      y: depth * (TREE_NODE_HEIGHT + TREE_Y_GAP),
      width: TREE_NODE_WIDTH,
      height: TREE_NODE_HEIGHT,
      label: node.label,
      ...(node.tone === undefined ? {} : { tone: node.tone }),
    });
    return x;
  };
  for (const root of roots) place(root, 0);
  const values = [...positions.values()];
  // Each leaf receives a stable top-left slot; parents center between their
  // first and last child slots.
  const width = Math.max(TREE_NODE_WIDTH, leaf * (TREE_NODE_WIDTH + TREE_X_GAP) - TREE_X_GAP);
  const height = (maxDepth + 1) * (TREE_NODE_HEIGHT + TREE_Y_GAP) - TREE_Y_GAP;
  return { width, height, positions: values, edges };
}

export function layoutBoard(diagram: BoardDiagram): DiagramLayout {
  const positions: DiagramPosition[] = [];
  const edges: DiagramEdge[] = [];
  diagram.columns.forEach((column, columnIndex) => {
    const x = columnIndex * BOARD_COLUMN_WIDTH;
    positions.push({
      id: column.id,
      x,
      y: 0,
      width: BOARD_CARD_WIDTH,
      height: BOARD_CARD_HEIGHT,
      label: column.title,
    });
    column.cards.forEach((card, cardIndex) => {
      positions.push({
        id: card.id,
        x,
        y: (cardIndex + 1) * (BOARD_CARD_HEIGHT + BOARD_ROW_GAP),
        width: BOARD_CARD_WIDTH,
        height: BOARD_CARD_HEIGHT,
        label: card.title,
        ...(card.tone === undefined ? {} : { tone: card.tone }),
      });
      edges.push({ from: column.id, to: card.id, kind: 'parent' });
    });
  });
  const maxCards = Math.max(0, ...diagram.columns.map((column) => column.cards.length));
  return {
    width: diagram.columns.length * BOARD_COLUMN_WIDTH - (BOARD_COLUMN_WIDTH - BOARD_CARD_WIDTH),
    height: (maxCards + 1) * (BOARD_CARD_HEIGHT + BOARD_ROW_GAP) - BOARD_ROW_GAP,
    positions,
    edges,
  };
}

export function layoutTerminal(diagram: TerminalDiagram): DiagramLayout {
  const lineHeight = 28;
  const positions = diagram.lines.map((line, index) => ({
    id: `line-${index + 1}`,
    x: 0,
    y: index * lineHeight,
    width: 720,
    height: lineHeight,
    label: line.text,
    kind: line.kind,
  }));
  return { width: 720, height: diagram.lines.length * lineHeight, positions, edges: [] };
}
