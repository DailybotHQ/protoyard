// @vitest-environment node
import { createRng } from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import { rankSequence } from '../src/board/index.ts';
import {
  buildTree,
  flatten,
  indent,
  isWithin,
  moveNode,
  moveSibling,
  newSibling,
  outdent,
  pathTo,
  validParents,
} from '../src/tree/index.ts';

interface Node {
  id: string;
  parentId: string | null;
  rank: string;
  title: string;
}

const ACCESSORS = {
  id: (n: Node) => n.id,
  parentId: (n: Node) => n.parentId,
  rank: (n: Node) => n.rank,
};
const [a, b, c] = rankSequence(3) as [string, string, string];

// docs
//   intro
//   guides
//     setup
//     deploy
// changelog
const NODES: Node[] = [
  { id: 'docs', parentId: null, rank: a, title: 'Docs' },
  { id: 'changelog', parentId: null, rank: b, title: 'Changelog' },
  { id: 'intro', parentId: 'docs', rank: a, title: 'Intro' },
  { id: 'guides', parentId: 'docs', rank: b, title: 'Guides' },
  { id: 'setup', parentId: 'guides', rank: a, title: 'Setup' },
  { id: 'deploy', parentId: 'guides', rank: b, title: 'Deploy' },
];
const tree = () => buildTree(NODES, ACCESSORS);
const ids = (nodes: { id: string }[]) => nodes.map((n) => n.id);

describe('buildTree and flatten', () => {
  it('orders siblings by rank and flattens open nodes depth first with ARIA facts', () => {
    const all = flatten(tree(), { expanded: 'all' });
    expect(ids(all)).toEqual(['docs', 'intro', 'guides', 'setup', 'deploy', 'changelog']);
    expect(all.find((n) => n.id === 'setup')).toMatchObject({
      level: 3,
      position: 1,
      siblings: 2,
      hasChildren: false,
    });
    expect(all.find((n) => n.id === 'guides')).toMatchObject({
      level: 2,
      position: 2,
      siblings: 2,
      hasChildren: true,
      expanded: true,
    });
    const closed = flatten(tree(), { expanded: new Set(['docs']) });
    expect(ids(closed)).toEqual(['docs', 'intro', 'guides', 'changelog']);
    expect(closed.find((n) => n.id === 'guides')?.expanded).toBe(false);
  });

  it('treats lazy nodes as parents and keeps orphans and cycles visible as roots', () => {
    const lazy = flatten(tree(), { expanded: new Set(), hasChildren: (n) => n.id === 'changelog' });
    expect(lazy.find((n) => n.id === 'changelog')?.hasChildren).toBe(true);
    const odd = buildTree(
      [
        ...NODES,
        { id: 'orphan', parentId: 'missing', rank: c, title: 'Orphan' },
        { id: 'loop-a', parentId: 'loop-b', rank: a, title: 'A' },
        { id: 'loop-b', parentId: 'loop-a', rank: b, title: 'B' },
      ],
      ACCESSORS
    );
    const roots = flatten(odd, { expanded: new Set() }).map((n) => n.id);
    expect(roots).toContain('orphan');
    expect(roots.filter((id) => id.startsWith('loop'))).toHaveLength(2);
  });

  it('answers ancestry questions', () => {
    expect(isWithin(tree(), 'docs', 'deploy')).toBe(true);
    expect(isWithin(tree(), 'guides', 'intro')).toBe(false);
    expect(pathTo(tree(), 'deploy')).toEqual(['docs', 'guides']);
  });
});

describe('moves', () => {
  it('moves a node under a new parent with a rank between its new siblings', () => {
    const result = moveNode(tree(), 'changelog', { parentId: 'guides', index: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.move.parentId).toBe('guides');
    expect(result.move.rank > a && result.move.rank < b).toBe(true);
    expect(result.unchanged).toBe(false);
  });

  it('rejects moving a node into itself or its own descendants', () => {
    expect(moveNode(tree(), 'docs', { parentId: 'docs', index: 0 })).toEqual({
      ok: false,
      reason: 'A node cannot move inside itself.',
    });
    expect(moveNode(tree(), 'docs', { parentId: 'setup', index: 0 }).ok).toBe(false);
    expect(moveNode(tree(), 'guides', { parentId: 'deploy', index: 0 }).ok).toBe(false);
    expect(moveNode(tree(), 'nope', { parentId: null, index: 0 }).ok).toBe(false);
    expect(moveNode(tree(), 'intro', { parentId: 'nope', index: 0 }).ok).toBe(false);
  });

  it('re-ranks siblings whose stored ranks cannot be split', () => {
    const legacy = buildTree(
      NODES.map((n) => (n.parentId === 'guides' ? { ...n, rank: 'a0' } : n)),
      ACCESSORS
    );
    const result = moveNode(legacy, 'intro', { parentId: 'guides', index: 1 });
    expect(result.ok && result.move.rerank?.map((r) => r.id)).toEqual(['deploy', 'intro', 'setup']);
  });

  it('indents, outdents and moves among siblings like an outline', () => {
    const indented = indent(tree(), 'guides');
    expect(indented.ok && indented.move).toMatchObject({ id: 'guides', parentId: 'intro' });
    expect(indent(tree(), 'intro')).toEqual({
      ok: false,
      reason: 'There is no item above to indent under.',
    });
    const outdented = outdent(tree(), 'setup');
    expect(outdented.ok && outdented.move.parentId).toBe('docs');
    // Right after its old parent: between guides (b) and nothing.
    expect(outdented.ok && outdented.move.rank > b).toBe(true);
    expect(outdent(tree(), 'docs').ok).toBe(false);
    const down = moveSibling(tree(), 'setup', 1);
    expect(down.ok && down.move.rank > b).toBe(true);
    expect(moveSibling(tree(), 'deploy', 1)).toEqual({
      ok: false,
      reason: 'Already the last item.',
    });
    expect(moveSibling(tree(), 'docs', -1)).toEqual({
      ok: false,
      reason: 'Already the first item.',
    });
  });

  it('places new siblings right after a node, and lists valid parents', () => {
    const next = newSibling(tree(), 'setup');
    expect(next.parentId).toBe('guides');
    expect(next.rank > a && next.rank < b).toBe(true);
    expect(newSibling(tree(), null).parentId).toBeNull();
    expect(newSibling(tree(), null).rank > b).toBe(true);
    expect(validParents(tree(), 'guides').map((p) => p.id)).toEqual([
      null,
      'docs',
      'intro',
      'changelog',
    ]);
  });
});

describe('speed', () => {
  it('flattens 10,000 nodes within budget', () => {
    const rng = createRng('tree-10k');
    const rows: Node[] = [];
    for (let i = 0; i < 10_000; i++) {
      const parent = i < 20 || rng.chance(0.1) ? null : (rows[rng.int(0, i - 1)] as Node).id;
      rows.push({
        id: `n${i}`,
        parentId: parent,
        rank: `a${String(i % 50).padStart(2, '1')}`,
        title: `Node ${i}`,
      });
    }
    const time = (work: () => unknown) => {
      work();
      let best = Number.POSITIVE_INFINITY;
      for (let i = 0; i < 3; i++) {
        const started = performance.now();
        work();
        best = Math.min(best, performance.now() - started);
      }
      return best;
    };
    const random = createRng('calibration');
    const baseline = time(() => Float64Array.from({ length: 100_000 }, () => random.next()).sort());
    const index = buildTree(rows, ACCESSORS);
    const ms = time(() => flatten(index, { expanded: 'all' }));
    expect(flatten(index, { expanded: 'all' })).toHaveLength(10_000);
    const factor = Number(process.env.PROTOYARD_PERF_FACTOR ?? 1);
    console.info(
      `tree flatten 10k: ${ms.toFixed(1)} ms (native 100k sort ${baseline.toFixed(1)} ms)`
    );
    // The task's 30 ms, scaled by a same-process calibration on a busy machine.
    expect(ms).toBeLessThan(Math.max(30 * factor, 3 * baseline));
  });
});
