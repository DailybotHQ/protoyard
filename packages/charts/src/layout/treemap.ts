/*
 * Squarified treemap (Bruls, Huizing & van Wijk 2000; the same row-building
 * rule as d3.treemapSquarify): rectangles close to square, areas
 * proportional to values. Pure; children are laid out largest first.
 */

export interface TreemapNode {
  id: string;
  label?: string;
  /** Leaf size. On a parent it is optional and, when given, must equal the sum of its children. */
  value?: number;
  children?: readonly TreemapNode[];
}

export interface TreemapRect {
  id: string;
  label?: string;
  parentId: string | null;
  depth: number;
  value: number;
  leaf: boolean;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface TreemapOptions {
  width: number;
  height: number;
  /** Space inside each parent around its children (default 0). */
  padding?: number;
  /** Extra space at the top of each parent, e.g. for its label (default: `padding`). */
  paddingTop?: number;
}

export class TreemapError extends Error {
  readonly nodeId: string;
  constructor(message: string, nodeId: string) {
    super(message);
    this.name = 'TreemapError';
    this.nodeId = nodeId;
  }
}

interface Sized {
  node: TreemapNode;
  value: number;
  children: Sized[];
}

function size(node: TreemapNode, seen: Set<string>): Sized {
  if (seen.has(node.id)) throw new TreemapError(`treemap(): duplicate id "${node.id}"`, node.id);
  seen.add(node.id);
  const children = (node.children ?? []).map((child) => size(child, seen));
  if (children.length === 0) {
    const value = node.value ?? 0;
    if (!Number.isFinite(value) || value < 0) {
      throw new TreemapError(`treemap(): "${node.id}" needs a finite value ≥ 0`, node.id);
    }
    return { node, value, children };
  }
  const sum = children.reduce((total, child) => total + child.value, 0);
  if (node.value !== undefined && Math.abs(node.value - sum) > 1e-9 * Math.max(1, Math.abs(sum))) {
    throw new TreemapError(
      `treemap(): "${node.id}" is ${node.value} but its children sum to ${sum}`,
      node.id
    );
  }
  return { node, value: sum, children };
}

const PHI = (1 + Math.sqrt(5)) / 2;

/** Lays `nodes` (sorted by value, descending) into the rectangle. */
function squarify(
  nodes: Sized[],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  out: Map<Sized, number[]>
) {
  let value = nodes.reduce((total, n) => total + n.value, 0);
  let i0 = 0;
  let i1 = 0;
  const n = nodes.length;
  while (i0 < n) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    let sum = 0;
    do sum = (nodes[i1++] as Sized).value;
    while (!sum && i1 < n);
    let min = sum;
    let max = sum;
    const alpha = Math.max(dy / dx, dx / dy) / (value * PHI);
    let beta = sum * sum * alpha;
    let best = Math.max(max / beta, beta / min);
    for (; i1 < n; i1++) {
      const v = (nodes[i1] as Sized).value;
      sum += v;
      if (v < min) min = v;
      if (v > max) max = v;
      beta = sum * sum * alpha;
      const ratio = Math.max(max / beta, beta / min);
      if (ratio > best) {
        sum -= v;
        break;
      }
      best = ratio;
    }
    const row = nodes.slice(i0, i1);
    if (dx < dy) {
      // Lay the row across the full width, taking a horizontal band.
      const band = value ? (dy * sum) / value : dy;
      let x = x0;
      for (const node of row) {
        const w = sum ? (dx * node.value) / sum : 0;
        out.set(node, [x, y0, x + w, y0 + band]);
        x += w;
      }
      y0 += band;
    } else {
      const band = value ? (dx * sum) / value : dx;
      let y = y0;
      for (const node of row) {
        const h = sum ? (dy * node.value) / sum : 0;
        out.set(node, [x0, y, x0 + band, y + h]);
        y += h;
      }
      x0 += band;
    }
    value -= sum;
    i0 = i1;
  }
}

/** Every node's rectangle, parents before their children (root first). */
export function treemap(root: TreemapNode, options: TreemapOptions): TreemapRect[] {
  const tree = size(root, new Set());
  const padding = Math.max(0, options.padding ?? 0);
  const paddingTop = Math.max(0, options.paddingTop ?? padding);
  const out: TreemapRect[] = [];
  const visit = (node: Sized, parentId: string | null, depth: number, box: number[]) => {
    const [x0, y0, x1, y1] = box as [number, number, number, number];
    out.push({
      id: node.node.id,
      ...(node.node.label === undefined ? {} : { label: node.node.label }),
      parentId,
      depth,
      value: node.value,
      leaf: node.children.length === 0,
      x0,
      y0,
      x1,
      y1,
    });
    if (node.children.length === 0) return;
    const inner: [number, number, number, number] = [
      x0 + padding,
      y0 + paddingTop,
      Math.max(x0 + padding, x1 - padding),
      Math.max(y0 + paddingTop, y1 - padding),
    ];
    const ordered = [...node.children].sort((a, b) => b.value - a.value);
    const boxes = new Map<Sized, number[]>();
    if (node.value > 0)
      squarify(
        ordered,
        inner[0] as number,
        inner[1] as number,
        inner[2] as number,
        inner[3] as number,
        boxes
      );
    for (const child of ordered) {
      visit(
        child,
        node.node.id,
        depth + 1,
        boxes.get(child) ?? [inner[0], inner[1], inner[0], inner[1]]
      );
    }
  };
  visit(tree, null, 0, [0, 0, Math.max(0, options.width), Math.max(0, options.height)]);
  return out;
}
