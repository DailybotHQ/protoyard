// @vitest-environment node
/**
 * @protoyard/views engines are thin re-exports of @texuli/data (T-adopt-views).
 */
import { groupByDay as txGroupByDay } from '@texuli/data/activity/engine';
import {
  groupBoard as txGroupBoard,
  rankBetween as txRankBetween,
} from '@texuli/data/board/engine';
import { monthGrid as txMonthGrid } from '@texuli/data/calendar';
import { childrenOf as txChildrenOf } from '@texuli/data/files/engine';
import { PORT_MERIDIAN as txMeridian } from '@texuli/data/geo';
import { resolveColumns as txResolveColumns } from '@texuli/data/grid';
import { cascade as txCascade } from '@texuli/data/timeline/engine';
import { buildTree as txBuildTree } from '@texuli/data/tree';
import { describe, expect, it } from 'vitest';
import { groupByDay } from '../src/activity/index.ts';
import { groupBoard, rankBetween, rankSequence } from '../src/board/index.ts';
import { monthGrid, parseIsoDate } from '../src/calendar/index.ts';
import { childrenOf, formatSize } from '../src/files/index.ts';
import { defaultColumnState, resolveColumns } from '../src/grid/index.ts';
import { haversine, PORT_MERIDIAN } from '../src/map/index.ts';
import { cascade, workDays } from '../src/timeline/index.ts';
import { buildTree, flatten } from '../src/tree/index.ts';

describe('@protoyard/views re-exports @texuli/data engines', () => {
  it('board, calendar, grid, tree, map, timeline, activity and files share texuli implementations', () => {
    expect(groupBoard).toBe(txGroupBoard);
    expect(rankBetween).toBe(txRankBetween);
    expect(monthGrid).toBe(txMonthGrid);
    expect(resolveColumns).toBe(txResolveColumns);
    expect(buildTree).toBe(txBuildTree);
    expect(PORT_MERIDIAN).toBe(txMeridian);
    expect(cascade).toBe(txCascade);
    expect(groupByDay).toBe(txGroupByDay);
    expect(childrenOf).toBe(txChildrenOf);
  });

  it('still behaves for a minimal board rank and calendar cell', () => {
    const ranks = rankSequence(3);
    expect(ranks).toHaveLength(3);
    const first = ranks[0];
    expect(first).toBeTruthy();
    expect(rankBetween(null, first ?? null)).toBeTruthy();
    const day = parseIsoDate('2026-03-15');
    expect(
      monthGrid(day.year, day.month, { weekStartsOn: 0 })
        .flat()
        .some((c) => c.date === '2026-03-15')
    ).toBe(true);
    expect(formatSize(1024)).toMatch(/1/);
    const origin = { lat: PORT_MERIDIAN.bbox[1] ?? 0, lng: PORT_MERIDIAN.bbox[0] ?? 0 };
    expect(haversine(origin, origin)).toBe(0);
    expect(workDays).toBeTruthy();
    expect(defaultColumnState([{ key: 'a', type: 'text', header: 'A' }])).toBeTruthy();
    const [r0, r1] = rankSequence(2) as [string, string];
    const rows = [
      { id: 'a', parentId: null as string | null, rank: r0 },
      { id: 'b', parentId: 'a' as string | null, rank: r1 },
    ];
    const accessors = {
      id: (n: (typeof rows)[0]) => n.id,
      parentId: (n: (typeof rows)[0]) => n.parentId,
      rank: (n: (typeof rows)[0]) => n.rank,
    };
    const tree = buildTree(rows, accessors);
    expect(flatten(tree, { expanded: 'all' }).length).toBe(2);
  });
});
