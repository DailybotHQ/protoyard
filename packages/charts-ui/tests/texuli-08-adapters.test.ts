import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { LineChart } from '../src/cartesian/index.ts';
import { Sparkline } from '../src/compact/index.ts';
import { TEXULI_CHART_TOKENS } from '../src/compat/theme-tokens.ts';

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

describe('charts-ui on Texuli 0.8', () => {
  it('maps the theme series colors onto the --tx-chart-N names Texuli charts read', () => {
    // Protoyard themes write --tx-chart1…8; Texuli charts read --tx-chart-1…8.
    expect(TEXULI_CHART_TOKENS).toContain('--tx-chart-1:var(--tx-chart1)');
    expect(TEXULI_CHART_TOKENS).toContain('--tx-chart-8:var(--tx-chart8, var(--tx-chart3))');
    const { container } = render(LineChart, { title: 'Signups', series });
    const root = container.querySelector<HTMLElement>('[data-py-chart]');
    expect(root?.style.getPropertyValue('--tx-chart-1').trim()).toBe('var(--tx-chart1)');
    expect(root?.style.getPropertyValue('--tx-chart-5').trim()).toBe('var(--tx-chart5)');
    cleanup();
    const spark = render(Sparkline, { values: [1, 3, 2], label: 'Trend' });
    const sparkRoot = spark.container.querySelector<HTMLElement>('[data-py-sparkline]');
    expect(sparkRoot?.style.getPropertyValue('--tx-chart-1').trim()).toBe('var(--tx-chart1)');
  });
});
