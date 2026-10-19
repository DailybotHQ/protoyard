import { chartBlock } from '@protoyard/ai/chart';
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChartAnswer from '../src/components/ChartAnswer.svelte';
import RichAnswer from '../src/components/RichAnswer.svelte';

class FixedWidthObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    this.callback(
      [{ target, contentRect: { width: 480, height: 220 } } as unknown as ResizeObserverEntry],
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

const signups = chartBlock({
  kind: 'bar',
  title: 'Signups last week',
  labels: ['Mon', 'Tue', 'Wed'],
  series: [{ label: 'Signups', values: [12, 18, 30] }],
});

describe('chart answers in RichAnswer', () => {
  it('renders a chart block with the charts kit, keyboard focusable, after a table fallback', async () => {
    render(RichAnswer, {
      content: `Here are last week's signups:\n\n${signups}\n\nWednesday peaked.`,
    });
    expect(screen.getByText("Here are last week's signups:")).toBeTruthy();
    const chart = await screen.findByRole(
      'group',
      { name: /^Signups last week\./ },
      { timeout: 10_000 }
    );
    expect(chart.getAttribute('tabindex')).toBe('0');
    expect(
      document.querySelectorAll(
        '[data-chart-kind="bar"] rect[data-bar], [data-chart-kind="bar"] [data-bar]'
      ).length
    ).toBeGreaterThan(0);
    expect(screen.getByText('Wednesday peaked.')).toBeTruthy();
  });

  it('shows a status while the chart fence is still streaming', () => {
    render(RichAnswer, { content: '```chart\n{"kind":"bar","title":"Sig' });
    expect(screen.getByRole('status').textContent).toContain('Preparing chart');
    expect(document.querySelector('pre')).toBeNull();
  });
});

describe('ChartAnswer', () => {
  it('shows an error note and the raw data as text for an invalid spec, never markup', () => {
    const text = '{"kind":"bar","title":"<img src=x onerror=alert(1)>","labels":["a"],"series":[]}';
    render(ChartAnswer, { text });
    const note = screen.getByRole('note');
    expect(note.textContent).toContain('This chart could not be shown.');
    expect(note.textContent).toContain('series');
    expect(note.querySelector('img')).toBeNull();
    expect(note.querySelector('pre')?.textContent).toBe(text);
  });

  it('formats the table fallback by unit and renders part-whole kinds', async () => {
    render(ChartAnswer, {
      text: JSON.stringify({
        kind: 'donut',
        title: 'Revenue by plan',
        unit: 'cents',
        labels: ['Pro', 'Team'],
        series: [{ label: 'Revenue', values: [129_900, 45_050] }],
      }),
    });
    // The table shows first (the chart chunk loads on demand) with money from integer cents.
    const table = screen.getByRole('table');
    expect(within(table).getByText('$1,299.00')).toBeTruthy();
    expect(within(table).getByText('$450.50')).toBeTruthy();
    expect(
      await screen.findByRole('group', { name: /^Revenue by plan/ }, { timeout: 10_000 })
    ).toBeTruthy();
    expect(document.querySelector('[data-chart-kind="donut"]')).toBeTruthy();
  });
});
