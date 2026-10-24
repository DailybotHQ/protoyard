import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { BarChart, LineChart, seriesFromRows, valueFormatter } from '../src/cartesian/index.ts';

afterEach(() => cleanup());

const series = [
  {
    id: 'signups',
    label: 'Signups',
    points: [
      { x: 'Mon', y: 10 },
      { x: 'Tue', y: 14 },
      { x: 'Wed', y: 12 },
    ],
  },
];

describe('cartesian adapters over @texuli/charts', () => {
  it('seriesFromRows and valueFormatter stay available', () => {
    const built = seriesFromRows([{ d: 'a', v: 2 }], {
      x: (r) => r.d,
      series: [{ id: 'v', label: 'V', y: (r) => r.v }],
    });
    expect(built[0]?.points[0]).toMatchObject({ x: 'a', y: 2 });
    expect(valueFormatter({ unit: 'cents' })(123_45)).toBe('$123.45');
  });

  it('LineChart renders a Texuli figure', () => {
    render(LineChart, { title: 'Signups', series, description: 'Daily signups' });
    expect(screen.getByRole('figure', { name: /Signups/ })).toBeTruthy();
  });

  it('BarChart renders a Texuli figure', () => {
    render(BarChart, { title: 'Mix', series, description: 'Category mix' });
    expect(screen.getByRole('figure', { name: /Mix/ })).toBeTruthy();
  });

  it('shows empty state without series points', () => {
    render(LineChart, {
      title: 'Empty',
      series: [{ id: 'a', label: 'A', points: [] }],
      emptyMessage: 'Nothing yet',
    });
    expect(screen.getByRole('status').textContent).toContain('Nothing yet');
  });
});
