import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeFunnel } from '../../analytics/src/funnel.ts';
import DonutChart from '../src/part-whole/DonutChart.svelte';
import FunnelChart from '../src/part-whole/FunnelChart.svelte';
import { groupSmallSlices } from '../src/part-whole/model.ts';
import PieChart from '../src/part-whole/PieChart.svelte';
import SankeyChart from '../src/part-whole/SankeyChart.svelte';
import Treemap from '../src/part-whole/Treemap.svelte';

class FixedWidthObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    this.callback(
      [{ target, contentRect: { width: 600, height: 300 } } as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver
    );
  }
  unobserve() {}
  disconnect() {}
}

beforeEach(() => vi.stubGlobal('ResizeObserver', FixedWidthObserver));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const live = () => document.querySelector('[data-chart-live]')?.textContent ?? '';
const chart = (name: RegExp) => screen.getByRole('group', { name });
const PLANS = [
  { id: 'free', label: 'Free', value: 620 },
  { id: 'pro', label: 'Pro', value: 280 },
  { id: 'team', label: 'Team', value: 80 },
  { id: 'edu', label: 'Education', value: 12 },
  { id: 'np', label: 'Nonprofit', value: 8 },
];

describe('groupSmallSlices', () => {
  it('folds slices under the threshold into one Other slice, last', () => {
    const grouped = groupSmallSlices(PLANS);
    expect(grouped.map((s) => [s.id, s.value])).toEqual([
      ['free', 620],
      ['pro', 280],
      ['team', 80],
      ['__other', 20],
    ]);
    expect(grouped.at(-1)?.members).toEqual(['edu', 'np']);
    // A single small slice is not worth an "Other".
    expect(groupSmallSlices(PLANS.slice(0, 4)).map((s) => s.id)).toEqual([
      'free',
      'pro',
      'team',
      'edu',
    ]);
    expect(groupSmallSlices(PLANS, 0)).toHaveLength(5);
    expect(groupSmallSlices(PLANS, 0.1, 'Rest').at(-1)?.label).toBe('Rest');
  });
});

describe('DonutChart and PieChart', () => {
  it('draws one slice per group, labels only the large ones and shows the total in the hole', () => {
    render(DonutChart, { title: 'Plans', data: PLANS });
    expect(document.querySelectorAll('[data-slice]')).toHaveLength(4);
    expect(
      [...document.querySelectorAll('[data-label]')].map((l) => l.getAttribute('data-label'))
    ).toEqual(['free', 'pro', 'team']);
    expect(document.body.textContent).toContain('1,000');
    const legend = screen.getByRole('list', { name: 'Plans values' });
    expect(legend.textContent).toContain('Other');
    expect(legend.textContent).toContain('62%');
    expect(
      screen.getByRole('figure', { name: 'Plans' }).getAttribute('aria-describedby')
    ).toBeTruthy();
  });

  it('moves between slices with the keyboard and selects one', async () => {
    const onselect = vi.fn();
    render(DonutChart, { title: 'Plans', data: PLANS, onselect });
    const svg = chart(/^Plans/);
    await fireEvent.focus(svg);
    expect(live()).toBe('Free, 620, 62%. 1 of 4.');
    await fireEvent.keyDown(svg, { key: 'ArrowRight' });
    await fireEvent.keyDown(svg, { key: 'End' });
    expect(live()).toBe('Other, 20, 2%. 4 of 4.');
    const id = svg.getAttribute('aria-activedescendant');
    expect(id && document.getElementById(id)?.getAttribute('aria-label')).toBe('Other, 20, 2%');
    await fireEvent.keyDown(svg, { key: 'Enter' });
    expect(onselect.mock.calls[0]?.[0]).toMatchObject({ id: '__other', members: ['edu', 'np'] });
  });

  it('draws a pie without a hole and shows the empty state', async () => {
    render(PieChart, { title: 'Pie', data: PLANS.slice(0, 3), otherThreshold: 0 });
    expect(document.querySelectorAll('[data-slice]')).toHaveLength(3);
    expect(document.body.textContent).not.toContain('Total');
    cleanup();
    render(DonutChart, {
      title: 'None',
      data: [{ id: 'a', label: 'A', value: 0 }],
      emptyMessage: 'No plans yet',
    });
    expect(screen.getByText('No plans yet')).toBeTruthy();
  });
});

describe('FunnelChart', () => {
  const steps = [
    { id: 'visit', label: 'Visited', eventType: 'visit' },
    { id: 'signup', label: 'Signed up', eventType: 'signup' },
    { id: 'paid', label: 'Paid', eventType: 'checkout' },
  ];
  const events = [
    ...['a', 'b', 'c', 'd', 'e'].map((u) => ({ userId: u, type: 'visit', at: 1 })),
    ...['a', 'b', 'c'].map((u) => ({ userId: u, type: 'signup', at: 2 })),
    { userId: 'a', type: 'checkout', at: 3 },
  ];

  it('shows the same conversion the analytics engine computes', async () => {
    const result = computeFunnel(events, steps);
    render(FunnelChart, { title: 'Signup funnel', steps: result.steps });
    expect(document.querySelectorAll('[data-step]')).toHaveLength(3);
    // Engine: 5 → 3 → 1, i.e. 100 %, 60 %, 20 % of entered.
    expect(result.steps.map((s) => s.conversion)).toEqual([1, 0.6, 0.2]);
    const text = document.body.textContent ?? '';
    for (const label of ['100%', '60%', '20%']) expect(text).toContain(label);
    const svg = chart(/^Signup funnel/);
    await fireEvent.focus(svg);
    await fireEvent.keyDown(svg, { key: 'ArrowDown' });
    expect(live()).toBe(
      'Signed up, 3, 60% of entered, 60% of the previous step, 2 dropped off. 2 of 3.'
    );
    await fireEvent.keyDown(svg, { key: 'ArrowDown' });
    expect(live()).toContain('Paid, 1, 20% of entered, 33.3% of the previous step');
    const tip = document.querySelector('[data-chart-tooltip]')?.textContent ?? '';
    expect(tip).toContain('2 dropped off');
  });

  it('sizes steps by value in both orientations', () => {
    render(FunnelChart, {
      title: 'Funnel',
      steps: [
        { id: 'a', label: 'A', value: 100 },
        { id: 'b', label: 'B', value: 50 },
      ],
    });
    const [a, b] = [...document.querySelectorAll('[data-step]')];
    expect(Number(b?.getAttribute('width'))).toBeCloseTo(Number(a?.getAttribute('width')) / 2, 5);
    cleanup();
    render(FunnelChart, {
      title: 'Funnel',
      orientation: 'horizontal',
      steps: [
        { id: 'a', label: 'A', value: 100 },
        { id: 'b', label: 'B', value: 25 },
      ],
    });
    const [ha, hb] = [...document.querySelectorAll('[data-step]')];
    expect(Number(hb?.getAttribute('height'))).toBeCloseTo(
      Number(ha?.getAttribute('height')) / 4,
      5
    );
  });
});

describe('Treemap', () => {
  const root = {
    id: 'all',
    label: 'All revenue',
    children: [
      {
        id: 'americas',
        label: 'Americas',
        children: [
          { id: 'us', label: 'US', value: 400 },
          { id: 'ca', label: 'Canada', value: 100 },
        ],
      },
      {
        id: 'emea',
        label: 'EMEA',
        children: [
          { id: 'de', label: 'Germany', value: 200 },
          { id: 'uk', label: 'UK', value: 150 },
        ],
      },
      { id: 'tiny', label: 'Tiny', value: 2 },
    ],
  };

  it('draws one cell per child, labels only cells that fit, and drills into groups with Enter', async () => {
    const onselect = vi.fn();
    render(Treemap, { title: 'Revenue', root, onselect });
    expect(document.querySelectorAll('[data-cell]')).toHaveLength(3);
    expect(document.querySelector('[data-cell="tiny"] [data-cell-label]')).toBeNull();
    expect(
      document.querySelector('[data-cell="americas"] [data-cell-label]')?.textContent
    ).toContain('Americas ›');
    const svg = chart(/^Revenue: All revenue/);
    await fireEvent.focus(svg);
    expect(live()).toContain('Americas, 500, 58.7%, group: press Enter to open');
    await fireEvent.keyDown(svg, { key: 'Enter' });
    expect(
      [...document.querySelectorAll('[data-cell]')].map((c) => c.getAttribute('data-cell'))
    ).toEqual(['us', 'ca']);
    expect(screen.getByRole('navigation', { name: 'Revenue level' }).textContent).toContain(
      'Americas'
    );
    // Enter on a leaf selects it; Backspace goes back up.
    const inner = chart(/^Revenue: Americas/);
    await fireEvent.focus(inner);
    await fireEvent.keyDown(inner, { key: 'Enter' });
    expect(onselect.mock.calls[0]?.[0].id).toBe('us');
    expect(onselect.mock.calls[0]?.[1].map((n: { id: string }) => n.id)).toEqual([
      'all',
      'americas',
      'us',
    ]);
    await fireEvent.keyDown(inner, { key: 'Backspace' });
    expect(document.querySelectorAll('[data-cell]')).toHaveLength(3);
  });

  it('goes back with the breadcrumb and shows invalid trees as an error', async () => {
    render(Treemap, { title: 'Revenue', root });
    await fireEvent.click(document.querySelector('[data-cell="emea"]') as Element);
    await fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(document.querySelectorAll('[data-cell]')).toHaveLength(3);
    cleanup();
    render(Treemap, {
      title: 'Bad',
      root: { id: 'r', value: 9, children: [{ id: 'a', value: 1 }] },
    });
    expect(screen.getByRole('alert').textContent).toContain('children sum to 1');
  });
});

describe('SankeyChart', () => {
  const nodes = ['visit', 'signup', 'bounce', 'paid'].map((id) => ({
    id,
    label: id[0]?.toUpperCase() + id.slice(1),
  }));
  const links = [
    { source: 'visit', target: 'signup', value: 60 },
    { source: 'visit', target: 'bounce', value: 40 },
    { source: 'signup', target: 'paid', value: 25 },
  ];

  it('draws nodes and links colored by their source node, and announces flows', async () => {
    render(SankeyChart, { title: 'Flow', nodes, links });
    expect(document.querySelectorAll('[data-node]')).toHaveLength(4);
    const linkEls = [...document.querySelectorAll('[data-link]')];
    expect(linkEls).toHaveLength(3);
    const color = (id: string) =>
      document.querySelector(`[data-node="${id}"]`)?.getAttribute('fill');
    expect(linkEls[0]?.getAttribute('stroke')).toBe(color('visit'));
    expect(linkEls[2]?.getAttribute('stroke')).toBe(color('signup'));
    const svg = chart(/^Flow/);
    await fireEvent.focus(svg);
    await fireEvent.keyDown(svg, { key: 'ArrowRight' });
    expect(live()).toBe('Signup, 60 in, 25 out. 2 of 4.');
  });

  it('shows cycles as an error instead of throwing', () => {
    render(SankeyChart, {
      title: 'Loop',
      nodes: [{ id: 'a' }, { id: 'b' }],
      links: [
        { source: 'a', target: 'b', value: 1 },
        { source: 'b', target: 'a', value: 1 },
      ],
    });
    expect(screen.getByRole('alert').textContent).toContain('cycle');
  });
});

describe('tabular alternative for part-whole charts', () => {
  const rowsOf = (table: HTMLElement) =>
    [...table.querySelectorAll('tbody tr')].map((tr) =>
      [...tr.children].map((c) => c.textContent?.trim())
    );
  const openTable = async () => {
    const toggle = await screen.findByRole('button', { name: 'View as table' });
    await fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.textContent?.trim()).toBe('View as chart');
    return screen.findByRole('table');
  };

  it('Donut and Pie list every slice with its value and share', async () => {
    render(DonutChart, { title: 'Plans', data: PLANS });
    const table = await openTable();
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent)
    ).toEqual(['Slice', 'Value', 'Share']);
    expect(rowsOf(table)[0]).toEqual(['Free', '620', '62%']);
    expect(rowsOf(table).at(-1)?.[0]).toBe('Other');
    expect(document.querySelector('[data-slice]')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'View as chart' }));
    expect(document.querySelectorAll('[data-slice]').length).toBeGreaterThan(0);
    cleanup();
    render(PieChart, { title: 'Pie', data: PLANS.slice(0, 2), otherThreshold: 0 });
    expect(rowsOf(await openTable())).toEqual([
      ['Free', '620', '68.9%'],
      ['Pro', '280', '31.1%'],
    ]);
  });

  it('Funnel lists steps with counts, conversions and drop-off', async () => {
    render(FunnelChart, {
      title: 'Signup funnel',
      steps: [
        { id: 'visit', label: 'Visit', count: 1000 },
        { id: 'signup', label: 'Sign up', count: 400 },
        { id: 'paid', label: 'Paid', count: 100 },
      ],
    });
    const table = await openTable();
    expect(rowsOf(table)).toEqual([
      ['Visit', '1,000', '100%', '—', '—'],
      ['Sign up', '400', '40%', '40%', '600'],
      ['Paid', '100', '10%', '25%', '300'],
    ]);
  });

  it('Sankey lists every link source → target with its value', async () => {
    render(SankeyChart, {
      title: 'Flow',
      nodes: [
        { id: 'visit', label: 'Visit' },
        { id: 'signup', label: 'Signup' },
        { id: 'paid', label: 'Paid' },
      ],
      links: [
        { source: 'visit', target: 'signup', value: 60 },
        { source: 'signup', target: 'paid', value: 25 },
      ],
    });
    expect(rowsOf(await openTable())).toEqual([
      ['Visit → Signup', 'Visit', 'Signup', '60'],
      ['Signup → Paid', 'Signup', 'Paid', '25'],
    ]);
  });

  it('offers no table toggle while loading', async () => {
    render(DonutChart, { title: 'Plans', data: PLANS, loading: true });
    await Promise.resolve();
    expect(screen.queryByRole('button', { name: 'View as table' })).toBeNull();
  });
});
