import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { Heatmap, Histogram, RampLegend, rampScale } from '../src/matrix/index.ts';

afterEach(() => cleanup());

describe('matrix adapters over @texuli/charts', () => {
  it('rampScale returns fill CSS variables when no palette hexes', () => {
    const scale = rampScale([0, 5, 10], null);
    expect(scale.fill(5)).toMatch(/^var\(--tx-seq-/);
    expect(scale.min).toBe(0);
    expect(scale.max).toBe(10);
  });

  it('Heatmap and Histogram render', () => {
    render(Heatmap, {
      title: 'Load',
      description: 'Team load',
      cells: [
        { x: 'Mon', y: 'A', value: 1 },
        { x: 'Tue', y: 'A', value: 3 },
      ],
    });
    expect(screen.getByRole('figure', { name: /Load/ })).toBeTruthy();
    cleanup();
    render(Histogram, { title: 'Dist', description: 'Values', values: [1, 2, 2, 3, 5, 5, 5] });
    expect(screen.getByRole('figure', { name: /Dist/ })).toBeTruthy();
  });

  it('keeps the Protoyard legend default while using Texuli ramp details', () => {
    render(RampLegend, { label: 'Weekly activity', min: 0, max: 12 });
    const legend = screen.getByRole('img', { name: 'Weekly activity, color scale from 0 to 12' });
    expect(legend.getAttribute('data-ramp')).toBe('sequential');
    expect(legend.querySelectorAll('[data-step]')).toHaveLength(9);
  });
});
