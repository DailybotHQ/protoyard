import { createRng } from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import {
  type BoardColumnDef,
  type BoardOptions,
  evaluateWip,
  groupBoard,
  IDLE,
  isRank,
  type KeyboardMoveState,
  moveIntent,
  pickUp,
  RankError,
  rankBetween,
  rankSequence,
  validateMove,
} from '../src/board/index.ts';

interface Card {
  id: string;
  title: string;
  status: string;
  team: string;
  rank: string;
}

const COLUMNS: BoardColumnDef[] = [
  { id: 'todo', title: 'To do' },
  { id: 'doing', title: 'Doing', wip: { soft: 2, hard: 3 } },
  { id: 'done', title: 'Done' },
];
const LANES = [
  { id: 'web', title: 'Web' },
  { id: 'mobile', title: 'Mobile' },
];

const OPTIONS: BoardOptions<Card> = {
  columns: COLUMNS,
  lanes: LANES,
  id: (card) => card.id,
  column: (card) => card.status,
  lane: (card) => card.team,
  rank: (card) => card.rank,
  label: (card) => card.title,
};

function cards(): Card[] {
  const [r1, r2, r3] = rankSequence(3);
  return [
    { id: 'c1', title: 'Login form', status: 'todo', team: 'web', rank: r1 as string },
    { id: 'c2', title: 'Pricing page', status: 'todo', team: 'web', rank: r2 as string },
    { id: 'c3', title: 'Push alerts', status: 'todo', team: 'mobile', rank: r1 as string },
    { id: 'c4', title: 'Audit log', status: 'doing', team: 'web', rank: r1 as string },
    { id: 'c5', title: 'Offline mode', status: 'doing', team: 'mobile', rank: r1 as string },
    { id: 'c6', title: 'Dark theme', status: 'done', team: 'web', rank: r3 as string },
  ];
}

const ids = (items: readonly Card[]) => items.map((card) => card.id);

describe('rank keys', () => {
  it('starts, appends, prepends and splits in code-unit order', () => {
    const first = rankBetween(null, null);
    const next = rankBetween(first, null);
    const before = rankBetween(null, first);
    const middle = rankBetween(first, next);
    expect([next, middle, first, before].sort()).toEqual([before, first, middle, next]);
    for (const key of [first, next, before, middle]) expect(isRank(key)).toBe(true);
  });

  it('rejects inverted, equal and invalid neighbors', () => {
    const [a, b] = rankSequence(2) as [string, string];
    expect(() => rankBetween(b, a)).toThrow(RankError);
    expect(() => rankBetween(a, a)).toThrow(RankError);
    expect(() => rankBetween('a0', 'not a key!')).toThrow(RankError);
    expect(isRank('a10')).toBe(false); // a fraction may not end in 0
    expect(isRank('')).toBe(false);
    expect(isRank(42)).toBe(false);
  });

  it('keeps 10,000 appends unique, ordered and short', () => {
    const keys = rankSequence(10_000);
    expect(new Set(keys).size).toBe(10_000);
    expect([...keys].sort()).toEqual(keys);
    expect(Math.max(...keys.map((key) => key.length))).toBeLessThanOrEqual(4);
  });

  it('keeps 10,000 prepends unique, ordered and short', () => {
    const keys = [rankBetween(null, null)];
    for (let i = 0; i < 9_999; i++) keys.unshift(rankBetween(null, keys[0] as string));
    expect(new Set(keys).size).toBe(10_000);
    expect([...keys].sort()).toEqual(keys);
    expect(Math.max(...keys.map((key) => key.length))).toBeLessThanOrEqual(4);
  });

  it('never collides across 10,000 inserts at seeded random positions', () => {
    const rng = createRng('board-rank');
    const keys: string[] = [];
    for (let i = 0; i < 10_000; i++) {
      const at = rng.int(0, keys.length);
      keys.splice(at, 0, rankBetween(keys[at - 1] ?? null, keys[at] ?? null));
    }
    expect(new Set(keys).size).toBe(10_000);
    expect([...keys].sort()).toEqual(keys);
    expect(keys.every(isRank)).toBe(true);
  });

  it('is deterministic', () => {
    expect(rankSequence(50)).toEqual(rankSequence(50));
  });
});

describe('groupBoard', () => {
  it('places items into lane × column cells ordered by rank, then id', () => {
    const grid = groupBoard(cards(), OPTIONS);
    expect(grid.cells).toHaveLength(2);
    expect(grid.cells[0]?.map((cell) => ids(cell.items))).toEqual([['c1', 'c2'], ['c4'], ['c6']]);
    expect(grid.cells[1]?.map((cell) => ids(cell.items))).toEqual([['c3'], ['c5'], []]);
    expect(grid.columnCounts.get('doing')).toBe(2);
    expect(grid.positions.get('c2')).toEqual({ columnIndex: 0, laneIndex: 0, index: 1 });
  });

  it('breaks equal ranks by id, so legacy data still sorts the same way', () => {
    const tied = cards().map((card) => ({ ...card, rank: 'a0' }));
    const grid = groupBoard(tied.reverse(), OPTIONS);
    expect(ids(grid.cells[0]?.[0]?.items ?? [])).toEqual(['c1', 'c2']);
  });

  it('lists items with an unknown column or lane instead of dropping them', () => {
    const extra = [
      ...cards(),
      { id: 'c9', title: 'Stray', status: 'archived', team: 'web', rank: 'a0' },
    ];
    const grid = groupBoard(extra, OPTIONS);
    expect(ids(grid.unplaced)).toEqual(['c9']);
    expect(grid.positions.has('c9')).toBe(false);
  });

  it('uses one implicit lane when the board has none', () => {
    const grid = groupBoard(cards(), { ...OPTIONS, lanes: undefined });
    expect(grid.lanes).toHaveLength(1);
    expect(grid.cells[0]?.map((cell) => cell.items.length)).toEqual([3, 2, 1]);
  });
});

describe('evaluateWip', () => {
  const doing = COLUMNS[1] as BoardColumnDef;

  it('is ok below the soft limit and without limits', () => {
    expect(evaluateWip(doing, 1)).toEqual({ status: 'ok', count: 1 });
    expect(evaluateWip(COLUMNS[0] as BoardColumnDef, 500).status).toBe('ok');
  });

  it('warns at the soft limit and blocks when full or over', () => {
    expect(evaluateWip(doing, 2)).toEqual({
      status: 'warn',
      count: 2,
      limit: 2,
      reason: 'Doing has reached its soft WIP limit (2 of 2).',
    });
    expect(evaluateWip(doing, 3).reason).toBe('Doing has reached its WIP limit (3 of 3).');
    expect(evaluateWip(doing, 4)).toMatchObject({
      status: 'blocked',
      reason: 'Doing is over its WIP limit (4 of 3).',
    });
  });
});

describe('validateMove', () => {
  it('ranks the item between its new neighbors', () => {
    const grid = groupBoard(cards(), OPTIONS);
    const result = validateMove(grid, 'c6', { columnId: 'todo', laneId: 'web', index: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [c1, c2] = grid.cells[0]?.[0]?.items ?? [];
    expect(result.move.rank > (c1?.rank ?? '')).toBe(true);
    expect(result.move.rank < (c2?.rank ?? '')).toBe(true);
    expect(result.move).toMatchObject({
      fromColumnId: 'done',
      columnId: 'todo',
      laneId: 'web',
      index: 1,
    });
    expect(result.move.rerank).toBeUndefined();
  });

  it('warns at the soft limit, reports a column it fills, and blocks a full column', () => {
    const one = groupBoard(
      cards().map((card) => (card.id === 'c5' ? { ...card, status: 'done' } : card)),
      OPTIONS
    );
    const second = validateMove(one, 'c1', { columnId: 'doing', index: 0 });
    expect(second.ok && second.wip).toMatchObject({ status: 'warn', count: 2 });
    const grid = groupBoard(cards(), OPTIONS);
    const third = validateMove(grid, 'c1', { columnId: 'doing', index: 0 });
    expect(third.ok && third.wip.status).toBe('blocked'); // allowed: 3 of 3 after it, now full
    const full = groupBoard(
      cards().map((card) => (card.id === 'c1' ? { ...card, status: 'doing' } : card)),
      OPTIONS
    );
    expect(validateMove(full, 'c2', { columnId: 'doing', index: 0 })).toEqual({
      ok: false,
      reason: 'Cannot move Pricing page: Doing has reached its WIP limit (3 of 3).',
    });
  });

  it('never blocks reordering inside a full column', () => {
    const full = groupBoard(
      cards().map((card) => (card.id === 'c1' ? { ...card, status: 'doing' } : card)),
      OPTIONS
    );
    const result = validateMove(full, 'c4', { columnId: 'doing', laneId: 'web', index: 1 });
    expect(result.ok).toBe(true);
  });

  it('applies the caller rule, with its reason', () => {
    const grid = groupBoard(cards(), OPTIONS);
    const rules = {
      canMove: (_card: Card, to: { columnId: string }) =>
        to.columnId !== 'done' || 'Only owners can close cards.',
    };
    expect(validateMove(grid, 'c1', { columnId: 'done', index: 0 }, rules)).toEqual({
      ok: false,
      reason: 'Only owners can close cards.',
    });
    expect(
      validateMove(grid, 'c1', { columnId: 'done', index: 0 }, { canMove: () => false })
    ).toEqual({
      ok: false,
      reason: 'Login form cannot move to Done.',
    });
  });

  it('reports unknown items, columns and lanes', () => {
    const grid = groupBoard(cards(), OPTIONS);
    expect(validateMove(grid, 'nope', { columnId: 'todo', index: 0 }).ok).toBe(false);
    expect(validateMove(grid, 'c1', { columnId: 'nope', index: 0 }).ok).toBe(false);
    expect(validateMove(grid, 'c1', { columnId: 'todo', laneId: 'nope', index: 0 }).ok).toBe(false);
  });

  it('marks a drop in place as unchanged and clamps the index', () => {
    const grid = groupBoard(cards(), OPTIONS);
    const same = validateMove(grid, 'c2', { columnId: 'todo', index: 1 });
    expect(same.ok && same.unchanged).toBe(true);
    const clamped = validateMove(grid, 'c1', { columnId: 'done', index: 99 });
    expect(clamped.ok && clamped.move.index).toBe(1);
  });

  it('re-ranks the whole cell when neighbor ranks cannot be split', () => {
    const tied = cards().map((card) => (card.status === 'todo' ? { ...card, rank: 'a0' } : card));
    const grid = groupBoard(tied, OPTIONS);
    const result = validateMove(grid, 'c6', { columnId: 'todo', laneId: 'web', index: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.move.rerank?.map((entry) => entry.itemId)).toEqual(['c1', 'c6', 'c2']);
    const ranks = result.move.rerank?.map((entry) => entry.rank) ?? [];
    expect([...ranks].sort()).toEqual(ranks);
    expect(result.move.rank).toBe(ranks[1]);
  });
});

describe('keyboard moves', () => {
  const press = (key: string, shiftKey = false) => ({ key, shiftKey });

  function run(keys: { key: string; shiftKey?: boolean }[], itemId = 'c1') {
    const grid = groupBoard(cards(), OPTIONS);
    let result = pickUp(grid, itemId);
    const log = [result.announcement];
    for (const key of keys) {
      result = moveIntent(grid, result.state, key);
      log.push(result.announcement);
    }
    return { grid, result, log };
  }

  it('picks up with a position announcement', () => {
    const { log, result } = run([]);
    expect(result.state.mode).toBe('held');
    expect(log[0]).toBe(
      'Picked up Login form. To do, lane Web, position 1 of 2. Use the arrow keys to move, Space to drop, Escape to cancel.'
    );
  });

  it('moves across columns, positions and lanes, then drops with a commit', () => {
    const { result, log } = run([
      press('ArrowRight'),
      press('ArrowRight'),
      press('ArrowDown', true),
      press(' '),
    ]);
    expect(log.slice(1, 4)).toEqual([
      'Doing, lane Web, position 1 of 2.',
      'Done, lane Web, position 1 of 2.',
      'Done, lane Mobile, position 1 of 1.',
    ]);
    expect(result.state).toEqual(IDLE);
    expect(result.commit).toMatchObject({
      itemId: 'c1',
      columnId: 'done',
      laneId: 'mobile',
      index: 0,
    });
    expect(log[4]).toBe('Dropped Login form in Done, lane Mobile, position 1 of 1.');
  });

  it('moves up and down inside a cell, with Home and End, and announces edges', () => {
    const { log } = run([press('ArrowDown'), press('ArrowDown'), press('Home'), press('ArrowUp')]);
    expect(log.slice(1)).toEqual([
      'To do, lane Web, position 2 of 2.',
      'Already at the bottom.',
      'To do, lane Web, position 1 of 2.',
      'Already at the top.',
    ]);
    const end = run([press('ArrowRight'), press('End')]);
    expect(end.log[2]).toBe('Doing, lane Web, position 2 of 2.');
    expect(run([press('ArrowLeft')]).log[1]).toBe('Already at the last column that way.');
    expect(run([press('ArrowUp', true)]).log[1]).toBe('Already at the last lane that way.');
  });

  it('cancels with Escape and puts the card back', () => {
    const { result, log } = run([press('ArrowRight'), press('Escape')]);
    expect(result.state).toEqual(IDLE);
    expect(result.commit).toBeUndefined();
    expect(log[2]).toBe('Move cancelled. Login form is back in To do, lane Web, position 1 of 2.');
  });

  it('keeps holding the card when the drop is rejected, with the reason', () => {
    const grid = groupBoard(
      cards().map((card) => (card.id === 'c2' ? { ...card, status: 'doing' } : card)),
      OPTIONS
    );
    let result = pickUp(grid, 'c1');
    result = moveIntent(grid, result.state, press('ArrowRight'));
    expect(result.announcement).toBe(
      'Doing, lane Web, position 1 of 3. Doing has reached its WIP limit (3 of 3). Dropping here is not allowed.'
    );
    result = moveIntent(grid, result.state, press('Enter'));
    expect(result.state.mode).toBe('held');
    expect(result.commit).toBeUndefined();
    expect(result.announcement).toBe(
      'Cannot move Login form: Doing has reached its WIP limit (3 of 3). Still holding Login form.'
    );
  });

  it('says when a successful drop fills the column', () => {
    const { result } = run([press('ArrowRight'), press('Enter')]);
    expect(result.commit?.columnId).toBe('doing');
    expect(result.announcement).toBe(
      'Dropped Login form in Doing, lane Web, position 1 of 2. Doing has reached its WIP limit (3 of 3).'
    );
  });

  it('drops in place without a commit, and ignores other keys and idle states', () => {
    const { result } = run([press('Enter')]);
    expect(result.commit).toBeUndefined();
    expect(result.announcement).toBe('Dropped Login form in its original place.');
    const grid = groupBoard(cards(), OPTIONS);
    const held = pickUp(grid, 'c1').state;
    expect(moveIntent(grid, held, press('a'))).toEqual({ state: held, handled: false });
    expect(moveIntent(grid, IDLE as KeyboardMoveState, press('ArrowRight')).handled).toBe(false);
    expect(pickUp(grid, 'missing').handled).toBe(false);
  });
});
