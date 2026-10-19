import { rankSequence } from '../board/rank.ts';
import { countFor, type ViewsCtx, type ViewsLevel, viewsLevel, viewsRng } from './shared.ts';

export interface OutlineNode {
  id: string;
  parentId: string | null;
  /** Order among siblings (board rank keys). */
  rank: string;
  title: string;
  depth: number;
}

export interface OutlineOptions {
  level?: ViewsLevel;
  /** Deepest nesting (default 3, edge 6). */
  maxDepth?: number;
}

const SECTIONS = [
  'Overview',
  'Goals',
  'Scope',
  'Timeline',
  'Risks',
  'Decisions',
  'Open questions',
  'Appendix',
];
const ITEMS = [
  'Background',
  'Owners',
  'Metrics',
  'Dependencies',
  'Notes',
  'Examples',
  'Next steps',
  'FAQ',
];

/** A document outline or page tree: parent ids plus sibling ranks, depth-bounded, every parent listed first. */
export function generateOutline(ctx: ViewsCtx, options: OutlineOptions = {}): OutlineNode[] {
  const level = viewsLevel(ctx, 'outline', options.level);
  const count = countFor(level, [0, 30, 400, 24]);
  if (count === 0) return [];
  const rng = viewsRng(ctx, 'outline');
  const maxDepth = options.maxDepth ?? (level === 'edge' ? 6 : 3);
  const nodes: OutlineNode[] = [];
  const childCount = new Map<string | null, number>();

  for (let i = 0; i < count; i++) {
    // Edge: the first nodes form one deep chain.
    let parent: OutlineNode | null;
    if (level === 'edge' && i < maxDepth) parent = nodes[i - 1] ?? null;
    else {
      const open = nodes.filter((n) => n.depth < maxDepth - 1);
      parent =
        i < 4 || open.length === 0 || rng.chance(0.25) ? null : (rng.pick(open) as OutlineNode);
    }
    const parentId = parent?.id ?? null;
    childCount.set(parentId, (childCount.get(parentId) ?? 0) + 1);
    nodes.push({
      id: ctx.ids.next('node'),
      parentId,
      rank: '',
      title: parent ? `${rng.pick(ITEMS)}` : rng.pick(SECTIONS),
      depth: parent ? parent.depth + 1 : 0,
    });
  }
  // Ranks per parent, in creation order.
  const ranks = new Map<string | null, string[]>();
  for (const [parentId, n] of childCount) ranks.set(parentId, rankSequence(n));
  const used = new Map<string | null, number>();
  for (const node of nodes) {
    const index = used.get(node.parentId) ?? 0;
    node.rank = (ranks.get(node.parentId) as string[])[index] as string;
    used.set(node.parentId, index + 1);
  }
  return nodes;
}
