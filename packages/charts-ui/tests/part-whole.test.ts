import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { DonutChart, FunnelChart, groupSmallSlices, PieChart } from '../src/part-whole/index.ts';

afterEach(() => cleanup());

const data = [
  { id: 'a', label: 'Web', value: 40 },
  { id: 'b', label: 'iOS', value: 30 },
  { id: 'c', label: 'Android', value: 30 },
];

describe('part-whole adapters over @texuli/charts', () => {
  it('groupSmallSlices folds tiny slices', () => {
    const grouped = groupSmallSlices([...data, { id: 'tiny', label: 'Tiny', value: 0.5 }], 0.05);
    expect(grouped.some((s) => s.id === 'other')).toBe(true);
  });

  it('PieChart and DonutChart render accessible graphics', () => {
    render(PieChart, { title: 'Platforms', data, description: 'By platform' });
    expect(screen.getByRole('img', { name: /Platforms|By platform/ })).toBeTruthy();
    cleanup();
    render(DonutChart, { title: 'Plans', data, description: 'By plan' });
    expect(screen.getByRole('img', { name: /Plans|By plan/ })).toBeTruthy();
  });

  it('FunnelChart maps count to value', () => {
    render(FunnelChart, {
      title: 'Activation',
      description: 'Signup funnel',
      steps: [
        { id: 's', label: 'Signup', count: 100 },
        { id: 'a', label: 'Active', count: 40 },
      ],
    });
    expect(screen.getByRole('img', { name: /Activation|Signup funnel/ })).toBeTruthy();
  });
});
