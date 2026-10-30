import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { applyAppearance, BUILTIN_THEMES, clearAppearance } from '../../themes/src/index.ts';
import { LineChart } from '../src/cartesian/index.ts';

afterEach(() => {
  cleanup();
  clearAppearance(document.documentElement);
});

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
  it('needs no local color map: the theme writes the --tx-chart-N names Texuli charts read', () => {
    const theme = BUILTIN_THEMES.find((t) => t.id === 'ocean') ?? BUILTIN_THEMES[0];
    if (!theme) throw new Error('no built-in theme');
    applyAppearance(document.documentElement, { theme, resolvedMode: 'dark' });
    const root = document.documentElement.style;
    expect(root.getPropertyValue('--tx-chart-1')).toBe(theme.dark.chart1);
    expect(root.getPropertyValue('--tx-chart-5')).toBe(theme.dark.chart5);
    expect(root.getPropertyValue('--tx-chart1')).toBe('');
    const { container } = render(LineChart, { title: 'Signups', series });
    const chart = container.querySelector<HTMLElement>('[data-py-chart]');
    expect(chart).not.toBeNull();
    // Nothing between the theme and Texuli's chart redefines the series colors.
    expect(chart?.getAttribute('style') ?? '').not.toContain('--tx-chart');
  });
});
