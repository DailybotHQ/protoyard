/*
 * A small sankey layout: nodes in columns by longest path from the sources
 * (sinks pushed to the last column), heights proportional to flow, a few
 * passes of relaxation toward linked nodes, then links stacked at both ends.
 * Flows must form a DAG; cycles are rejected.
 */

export interface SankeyNodeInput {
  id: string;
  label?: string;
}

export interface SankeyLinkInput {
  source: string;
  target: string;
  value: number;
}

export interface SankeyNode {
  id: string;
  label?: string;
  /** Column index, 0 = sources. */
  depth: number;
  /** max(flow in, flow out). */
  value: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
  /** Stroke width. */
  width: number;
  /** Centre of the link where it leaves the source and enters the target. */
  y0: number;
  y1: number;
  /** Horizontal cubic centreline; stroke it with `width`. */
  path: string;
}

export interface SankeyOptions {
  width: number;
  height: number;
  nodeWidth?: number;
  nodePadding?: number;
  iterations?: number;
}

export type SankeyErrorCode = 'cycle' | 'unknown-node' | 'invalid-value' | 'duplicate-node';

export class SankeyError extends Error {
  readonly code: SankeyErrorCode;
  /** For cycles: the node ids around the loop. */
  readonly nodes: readonly string[];
  constructor(code: SankeyErrorCode, message: string, nodes: readonly string[] = []) {
    super(message);
    this.name = 'SankeyError';
    this.code = code;
    this.nodes = nodes;
  }
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export function sankey(
  nodesIn: readonly SankeyNodeInput[],
  linksIn: readonly SankeyLinkInput[],
  options: SankeyOptions
): { nodes: SankeyNode[]; links: SankeyLink[] } {
  const nodeWidth = options.nodeWidth ?? 12;
  const padding = options.nodePadding ?? 8;
  const index = new Map<string, number>();
  nodesIn.forEach((n, i) => {
    if (index.has(n.id))
      throw new SankeyError('duplicate-node', `sankey(): duplicate node "${n.id}"`, [n.id]);
    index.set(n.id, i);
  });
  const out: number[][] = nodesIn.map(() => []);
  const inn: number[][] = nodesIn.map(() => []);
  linksIn.forEach((l, k) => {
    const s = index.get(l.source);
    const t = index.get(l.target);
    if (s === undefined || t === undefined) {
      const missing = s === undefined ? l.source : l.target;
      throw new SankeyError('unknown-node', `sankey(): link to unknown node "${missing}"`, [
        missing,
      ]);
    }
    if (!(l.value > 0) || !Number.isFinite(l.value)) {
      throw new SankeyError(
        'invalid-value',
        `sankey(): link ${l.source} → ${l.target} needs a value > 0`
      );
    }
    (out[s] as number[]).push(k);
    (inn[t] as number[]).push(k);
  });

  // Longest-path depth with cycle detection (iterative DFS keeps deep graphs off the stack).
  const n = nodesIn.length;
  const depth = new Array<number>(n).fill(0);
  const state = new Array<0 | 1 | 2>(n).fill(0);
  const order: number[] = [];
  for (let start = 0; start < n; start++) {
    if (state[start]) continue;
    const stack: [number, number][] = [[start, 0]];
    const path: number[] = [];
    state[start] = 1;
    path.push(start);
    while (stack.length) {
      const frame = stack[stack.length - 1] as [number, number];
      const [v, next] = frame;
      const edges = out[v] as number[];
      if (next < edges.length) {
        frame[1]++;
        const w = index.get((linksIn[edges[next] as number] as SankeyLinkInput).target) as number;
        if (state[w] === 1) {
          const loop = path.slice(path.indexOf(w)).map((i) => (nodesIn[i] as SankeyNodeInput).id);
          throw new SankeyError(
            'cycle',
            `sankey(): flows form a cycle (${[...loop, loop[0]].join(' → ')})`,
            loop
          );
        }
        if (state[w] === 0) {
          state[w] = 1;
          path.push(w);
          stack.push([w, 0]);
        }
      } else {
        state[v] = 2;
        order.push(v);
        path.pop();
        stack.pop();
      }
    }
  }
  for (const v of order.reverse()) {
    for (const k of out[v] as number[]) {
      const w = index.get((linksIn[k] as SankeyLinkInput).target) as number;
      depth[w] = Math.max(depth[w] as number, (depth[v] as number) + 1);
    }
  }
  const columns = Math.max(0, ...depth) + 1;
  // Sinks go to the last column so every flow ends on the right edge.
  for (let v = 0; v < n; v++)
    if ((out[v] as number[]).length === 0 && (inn[v] as number[]).length > 0)
      depth[v] = columns - 1;

  const sum = (ks: number[]) => ks.reduce((t, k) => t + (linksIn[k] as SankeyLinkInput).value, 0);
  const value = nodesIn.map((_, v) => Math.max(sum(inn[v] as number[]), sum(out[v] as number[])));
  const byColumn: number[][] = Array.from({ length: columns }, () => []);
  for (let v = 0; v < n; v++) (byColumn[depth[v] as number] as number[]).push(v);

  const { width, height } = options;
  const ky = Math.min(
    ...byColumn.map((col) => {
      const total = col.reduce((t, v) => t + (value[v] as number), 0);
      return total > 0
        ? Math.max(0, height - (col.length - 1) * padding) / total
        : Number.POSITIVE_INFINITY;
    })
  );
  const scale = Number.isFinite(ky) ? ky : 0;
  const step = columns > 1 ? (width - nodeWidth) / (columns - 1) : 0;
  const y0 = new Array<number>(n).fill(0);
  const h = value.map((v) => v * scale);
  for (const col of byColumn) {
    let y = 0;
    for (const v of col) {
      y0[v] = y;
      y += (h[v] as number) + padding;
    }
  }

  const centre = (v: number) => (y0[v] as number) + (h[v] as number) / 2;
  const resolve = (col: number[]) => {
    col.sort((a, b) => (y0[a] as number) - (y0[b] as number));
    let y = 0;
    for (const v of col) {
      y0[v] = Math.max(y0[v] as number, y);
      y = (y0[v] as number) + (h[v] as number) + padding;
    }
    // Push back up from the bottom edge if the column overflowed.
    let bottom = height;
    for (let i = col.length - 1; i >= 0; i--) {
      const v = col[i] as number;
      y0[v] = Math.min(y0[v] as number, bottom - (h[v] as number));
      bottom = (y0[v] as number) - padding;
    }
  };
  const iterations = options.iterations ?? 6;
  for (let i = 0; i < iterations; i++) {
    const alpha = 0.99 ** i;
    for (const [cols, links, end] of [
      [byColumn.slice(1), inn, 'source'],
      [byColumn.slice(0, -1).reverse(), out, 'target'],
    ] as const) {
      for (const col of cols) {
        for (const v of col) {
          const ks = links[v] as number[];
          const weight = sum(ks);
          if (weight === 0) continue;
          const target =
            ks.reduce((t, k) => {
              const l = linksIn[k] as SankeyLinkInput;
              return t + centre(index.get(l[end]) as number) * l.value;
            }, 0) / weight;
          y0[v] = (y0[v] as number) + (target - centre(v)) * alpha;
        }
        resolve(col);
      }
    }
  }

  const x0 = (v: number) => (depth[v] as number) * step;
  const nodes: SankeyNode[] = nodesIn.map((node, v) => ({
    id: node.id,
    ...(node.label === undefined ? {} : { label: node.label }),
    depth: depth[v] as number,
    value: value[v] as number,
    x0: r2(x0(v)),
    x1: r2(x0(v) + nodeWidth),
    y0: r2(y0[v] as number),
    y1: r2((y0[v] as number) + (h[v] as number)),
  }));

  // Stack links at each end in the order of the node at the other end.
  const sy = new Map<number, number>();
  const ty = new Map<number, number>();
  for (let v = 0; v < n; v++) {
    let y = y0[v] as number;
    const outgoing = [...(out[v] as number[])].sort(
      (a, b) =>
        centre(index.get((linksIn[a] as SankeyLinkInput).target) as number) -
        centre(index.get((linksIn[b] as SankeyLinkInput).target) as number)
    );
    for (const k of outgoing) {
      const w = (linksIn[k] as SankeyLinkInput).value * scale;
      sy.set(k, y + w / 2);
      y += w;
    }
    y = y0[v] as number;
    const incoming = [...(inn[v] as number[])].sort(
      (a, b) =>
        centre(index.get((linksIn[a] as SankeyLinkInput).source) as number) -
        centre(index.get((linksIn[b] as SankeyLinkInput).source) as number)
    );
    for (const k of incoming) {
      const w = (linksIn[k] as SankeyLinkInput).value * scale;
      ty.set(k, y + w / 2);
      y += w;
    }
  }
  const links: SankeyLink[] = linksIn.map((l, k) => {
    const s = index.get(l.source) as number;
    const t = index.get(l.target) as number;
    const xa = x0(s) + nodeWidth;
    const xb = x0(t);
    const xm = (xa + xb) / 2;
    const ya = sy.get(k) as number;
    const yb = ty.get(k) as number;
    return {
      source: l.source,
      target: l.target,
      value: l.value,
      width: r2(l.value * scale),
      y0: r2(ya),
      y1: r2(yb),
      path: `M${r2(xa)},${r2(ya)}C${r2(xm)},${r2(ya)},${r2(xm)},${r2(yb)},${r2(xb)},${r2(yb)}`,
    };
  });
  return { nodes, links };
}
