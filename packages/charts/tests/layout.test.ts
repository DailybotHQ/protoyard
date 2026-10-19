import { describe, expect, it } from 'vitest';
import {
  calendarLayout,
  funnelLayout,
  gaugeLayout,
  matrixLayout,
  plotArea,
  SankeyError,
  sankey,
  TreemapError,
  treemap,
} from '../src/layout/index.ts';

const area = (r: { x0: number; y0: number; x1: number; y1: number }) =>
  (r.x1 - r.x0) * (r.y1 - r.y0);

describe('treemap', () => {
  const root = {
    id: 'all',
    children: [
      { id: 'a', value: 6 },
      { id: 'b', value: 6 },
      { id: 'c', value: 4 },
      { id: 'd', value: 3 },
      { id: 'e', value: 2 },
      { id: 'f', value: 2 },
      { id: 'g', value: 1 },
    ],
  };

  it('gives each leaf an area proportional to its value, tiling the whole box', () => {
    const rects = treemap(root, { width: 600, height: 400 });
    const leaves = rects.filter((r) => r.leaf);
    expect(rects[0]).toMatchObject({
      id: 'all',
      depth: 0,
      parentId: null,
      value: 24,
      x0: 0,
      y0: 0,
      x1: 600,
      y1: 400,
    });
    expect(leaves).toHaveLength(7);
    for (const leaf of leaves) expect(area(leaf)).toBeCloseTo((leaf.value / 24) * 600 * 400, 6);
    expect(leaves.reduce((s, r) => s + area(r), 0)).toBeCloseTo(600 * 400, 6);
    for (const leaf of leaves) {
      expect(leaf.x0).toBeGreaterThanOrEqual(-1e-9);
      expect(leaf.y1).toBeLessThanOrEqual(400 + 1e-9);
    }
  });

  it('keeps rectangles reasonably square (the point of squarifying)', () => {
    const many = {
      id: 'r',
      children: Array.from({ length: 30 }, (_, i) => ({ id: `n${i}`, value: 30 - i })),
    };
    const worst = Math.max(
      ...treemap(many, { width: 800, height: 500 })
        .filter((r) => r.leaf)
        .map((r) => Math.max((r.x1 - r.x0) / (r.y1 - r.y0), (r.y1 - r.y0) / (r.x1 - r.x0)))
    );
    expect(worst).toBeLessThan(4);
  });

  it('nests children inside their parent with padding', () => {
    const rects = treemap(
      {
        id: 'r',
        children: [
          {
            id: 'p',
            children: [
              { id: 'x', value: 1 },
              { id: 'y', value: 1 },
            ],
          },
          { id: 'q', value: 2 },
        ],
      },
      { width: 200, height: 100, padding: 4, paddingTop: 16 }
    );
    const p = rects.find((r) => r.id === 'p');
    const x = rects.find((r) => r.id === 'x');
    if (!p || !x) throw new Error('missing rects');
    expect(x.parentId).toBe('p');
    expect(x.depth).toBe(2);
    expect(x.x0).toBeGreaterThanOrEqual(p.x0 + 4 - 1e-9);
    expect(x.y0).toBeGreaterThanOrEqual(p.y0 + 16 - 1e-9);
  });

  it('validates sums, values and ids', () => {
    expect(() =>
      treemap({ id: 'r', value: 5, children: [{ id: 'a', value: 2 }] }, { width: 1, height: 1 })
    ).toThrow(TreemapError);
    expect(() =>
      treemap({ id: 'r', children: [{ id: 'a', value: -1 }] }, { width: 1, height: 1 })
    ).toThrow(/finite value/);
    expect(() =>
      treemap({ id: 'r', children: [{ id: 'r', value: 1 }] }, { width: 1, height: 1 })
    ).toThrow(/duplicate/);
    // A matching parent value and an all-zero tree are fine.
    expect(
      treemap({ id: 'r', value: 2, children: [{ id: 'a', value: 2 }] }, { width: 10, height: 10 })
    ).toHaveLength(2);
    expect(
      treemap({ id: 'r', children: [{ id: 'a', value: 0 }] }, { width: 10, height: 10 })[1]
    ).toMatchObject({ x0: 0, x1: 0 });
  });
});

describe('sankey', () => {
  const nodes = ['visit', 'signup', 'bounce', 'trial', 'paid', 'churn'].map((id) => ({ id }));
  const links = [
    { source: 'visit', target: 'signup', value: 60 },
    { source: 'visit', target: 'bounce', value: 40 },
    { source: 'signup', target: 'trial', value: 45 },
    { source: 'signup', target: 'churn', value: 15 },
    { source: 'trial', target: 'paid', value: 30 },
    { source: 'trial', target: 'churn', value: 15 },
  ];
  const layout = sankey(nodes, links, { width: 600, height: 300, nodeWidth: 10, nodePadding: 10 });
  const node = (id: string) =>
    layout.nodes.find((n) => n.id === id) as (typeof layout.nodes)[number];

  it('places nodes in columns by longest path with sinks on the right', () => {
    expect(Object.fromEntries(layout.nodes.map((n) => [n.id, n.depth]))).toEqual({
      visit: 0,
      signup: 1,
      bounce: 3,
      trial: 2,
      paid: 3,
      churn: 3,
    });
    expect(node('visit').x0).toBe(0);
    expect(node('paid').x1).toBe(600);
  });

  it('conserves flow: node height equals the links on each side', () => {
    const height = (id: string) => node(id).y1 - node(id).y0;
    const widths = (pick: (l: (typeof layout.links)[number]) => boolean) =>
      layout.links.filter(pick).reduce((s, l) => s + l.width, 0);
    for (const id of ['signup', 'trial']) {
      expect(node(id).value).toBe(
        links.filter((l) => l.target === id).reduce((s, l) => s + l.value, 0)
      );
      expect(widths((l) => l.target === id)).toBeCloseTo(height(id), 1);
      expect(widths((l) => l.source === id)).toBeCloseTo(height(id), 1);
    }
    expect(node('churn').value).toBe(30);
  });

  it('keeps every node inside the area without overlaps in a column', () => {
    for (const n of layout.nodes) {
      expect(n.y0).toBeGreaterThanOrEqual(-0.01);
      expect(n.y1).toBeLessThanOrEqual(300.01);
    }
    const last = layout.nodes.filter((n) => n.depth === 3).sort((a, b) => a.y0 - b.y0);
    for (let i = 1; i < last.length; i++) {
      expect(last[i]?.y0).toBeGreaterThanOrEqual((last[i - 1]?.y1 as number) + 10 - 0.02);
    }
    expect(layout.links[0]?.path).toMatch(/^M10,[\d.]+C/);
  });

  it('rejects cycles, unknown nodes and bad values with typed errors', () => {
    const cycle = () =>
      sankey(
        [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        [
          { source: 'a', target: 'b', value: 1 },
          { source: 'b', target: 'c', value: 1 },
          { source: 'c', target: 'a', value: 1 },
        ],
        { width: 100, height: 100 }
      );
    expect(cycle).toThrow(SankeyError);
    try {
      cycle();
    } catch (error) {
      expect((error as SankeyError).code).toBe('cycle');
      expect([...(error as SankeyError).nodes].sort()).toEqual(['a', 'b', 'c']);
    }
    expect(() =>
      sankey([{ id: 'a' }], [{ source: 'a', target: 'z', value: 1 }], { width: 1, height: 1 })
    ).toThrow(/unknown node "z"/);
    expect(() =>
      sankey([{ id: 'a' }, { id: 'b' }], [{ source: 'a', target: 'b', value: 0 }], {
        width: 1,
        height: 1,
      })
    ).toThrow(/value > 0/);
  });

  it('is deterministic', () => {
    expect(sankey(nodes, links, { width: 600, height: 300 })).toEqual(
      sankey(nodes, links, { width: 600, height: 300 })
    );
  });
});

describe('funnelLayout', () => {
  const steps = [
    { id: 'visit', value: 1000 },
    { id: 'signup', value: 400 },
    { id: 'activate', value: 0 },
    { id: 'pay', value: 0 },
  ];

  it('computes conversion and drop-off, null where the base is zero', () => {
    const out = funnelLayout(steps, { width: 300, height: 200, gap: 8 });
    expect(out.map((s) => s.conversion)).toEqual([1, 0.4, 0, 0]);
    expect(out.map((s) => s.stepConversion)).toEqual([1, 0.4, 0, null]);
    expect(out.map((s) => s.dropOff)).toEqual([0, 600, 400, 0]);
    expect(out.map((s) => s.dropOffRate)).toEqual([0, 0.6, 1, null]);
  });

  it('sizes and centres bars in either orientation', () => {
    const vertical = funnelLayout(steps.slice(0, 2), { width: 300, height: 108, gap: 8 });
    expect(vertical[0]).toMatchObject({ x: 0, y: 0, width: 300, height: 50 });
    expect(vertical[1]).toMatchObject({ x: 90, y: 58, width: 120, height: 50 });
    const horizontal = funnelLayout(steps.slice(0, 2), {
      width: 108,
      height: 200,
      gap: 8,
      orientation: 'horizontal',
    });
    expect(horizontal[1]).toMatchObject({ x: 58, y: 120, width: 50, height: 80 });
    // A zero step keeps a minimum size so it stays visible and focusable.
    expect(funnelLayout(steps, { width: 300, height: 200 })[2]?.width).toBe(2);
    expect(funnelLayout([], { width: 1, height: 1 })).toEqual([]);
  });
});

describe('calendarLayout and matrixLayout', () => {
  it('lays out a year in week columns: 53 for 2026, 54 for 2012 with Monday weeks', () => {
    const y2026 = calendarLayout({ start: '2026-01-01', end: '2026-12-31' });
    expect(y2026.cells).toHaveLength(365);
    expect(y2026.weeks).toBe(53);
    // 2026-01-01 is a Thursday: row 3 when weeks start on Monday.
    expect(y2026.cells[0]).toMatchObject({ date: '2026-01-01', week: 0, weekday: 3, value: null });
    expect(y2026.months).toHaveLength(12);
    expect(y2026.months[1]).toEqual({ month: '2026-02', week: 4 });
    // Leap year starting on a Sunday spans 54 Monday-based weeks.
    expect(calendarLayout({ start: '2012-01-01', end: '2012-12-31' }).weeks).toBe(54);
    expect(
      calendarLayout({ start: '2012-01-01', end: '2012-12-31' }, { weekStartsOn: 0 }).weeks
    ).toBe(53);
  });

  it('keeps missing days null and zero days zero, and positions cells', () => {
    const out = calendarLayout(
      { start: '2026-03-01', end: '2026-03-03' },
      { values: { '2026-03-01': 0, '2026-03-02': 7 }, cellSize: 10, gap: 2, weekStartsOn: 0 }
    );
    expect(out.cells.map((c) => [c.date, c.value, c.week, c.weekday, c.x, c.y])).toEqual([
      ['2026-03-01', 0, 0, 0, 0, 0],
      ['2026-03-02', 7, 0, 1, 0, 12],
      ['2026-03-03', null, 0, 2, 0, 24],
    ]);
    expect(out.width).toBe(10);
    expect(out.height).toBe(82);
    expect(calendarLayout({ start: '2026-03-02', end: '2026-03-01' }).cells).toEqual([]);
    expect(() => calendarLayout({ start: 'nope', end: '2026-03-01' })).toThrow(RangeError);
  });

  it('builds an equal-cell matrix', () => {
    const m = matrixLayout(['w1', 'w2'], ['d0', 'd1', 'd2'], { width: 92, height: 41, gap: 1 });
    expect(m.cellWidth).toBe(30);
    expect(m.cellHeight).toBe(20);
    expect(m.cells).toHaveLength(6);
    expect(m.cells[5]).toMatchObject({ row: 'w2', col: 'd2', x: 62, y: 21 });
    expect(plotArea(100, 50, { top: 5, right: 5, bottom: 5, left: 5 })).toEqual({
      x: 5,
      y: 5,
      width: 90,
      height: 40,
    });
  });
});

describe('gaugeLayout', () => {
  it('maps the value onto the sweep and finds its threshold band', () => {
    const g = gaugeLayout(72, { thresholds: [60, 85] });
    expect(g.ratio).toBeCloseTo(0.72, 10);
    expect(g.angle).toBeCloseTo(-0.75 * Math.PI + 0.72 * 1.5 * Math.PI, 10);
    expect(g.valueArc.startAngle).toBeCloseTo(-0.75 * Math.PI, 10);
    expect(g.bands.map((b) => [b.from, b.to])).toEqual([
      [0, 60],
      [60, 85],
      [85, 100],
    ]);
    expect(g.band).toBe(1);
    expect(gaugeLayout(100, { thresholds: [60, 85] }).band).toBe(2);
    expect(gaugeLayout(60, { thresholds: [60, 85] }).band).toBe(1);
  });

  it('clamps values, ignores thresholds outside the range and rejects empty ranges', () => {
    expect(gaugeLayout(150).value).toBe(100);
    expect(gaugeLayout(Number.NaN).value).toBe(0);
    expect(gaugeLayout(-5, { min: -10, max: 10, thresholds: [-20, 0, 0, 30] }).bands).toHaveLength(
      2
    );
    expect(() => gaugeLayout(1, { min: 5, max: 5 })).toThrow(RangeError);
  });
});
