import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CATALOG, CATALOG_IDS } from '../src/catalog/entries.ts';
import { DEMOS } from '../src/catalog/registry.ts';
import FormsPage from '../src/screens/FormsPage.svelte';

afterEach(() => cleanup());

describe('catalog registry', () => {
  it('has exactly one demo per catalog id', () => {
    expect(Object.keys(DEMOS).sort()).toEqual([...CATALOG_IDS].sort());
  });

  it.each(Object.keys(DEMOS))('%s has a snippet importing the kit and a11y notes', (id) => {
    const demo = DEMOS[id];
    // Chart entries import their family subpath; the states snippet shows chart props only.
    if (id.startsWith('chart-')) {
      if (id !== 'chart-states') expect(demo?.snippet).toContain("from '@protoyard/charts-ui/");
    } else if (CATALOG.find((entry) => entry.id === id)?.group === 'views')
      expect(demo?.snippet).toContain("from '@protoyard/views-ui/");
    else expect(demo?.snippet).toContain("from '@protoyard/ui'");
    expect((demo?.a11y?.length ?? 0) > 0).toBe(true);
  });
});

describe('demos', () => {
  it.each(Object.entries(DEMOS))('%s renders without throwing', async (_id, demo) => {
    const { container } = render(await demo.load(), {});
    expect(container.textContent?.trim().length).toBeGreaterThan(0);
  });

  it('chat thread sends a message and receives a scripted reply', async () => {
    const demo = DEMOS['chat-thread'];
    if (!demo) throw new Error('missing chat-thread demo');
    render(await demo.load(), {});
    const box = screen.getByRole('textbox', { name: 'Message' });
    await fireEvent.input(box, { target: { value: 'Ship it?' } });
    await fireEvent.keyDown(box, { key: 'Enter' });
    const log = screen.getByRole('log');
    expect(await within(log).findByText('Ship it?')).toBeTruthy();
    expect(
      await within(log).findByText(
        'Sounds good, I will take a look after lunch.',
        {},
        { timeout: 3000 }
      )
    ).toBeTruthy();
  });

  it('grid demo toggles to the 100,000-row virtualized data set', async () => {
    const demo = DEMOS.grid;
    if (!demo) throw new Error('missing grid demo');
    render(await demo.load(), {});
    await fireEvent.click(screen.getByRole('button', { name: 'Load 100,000 rows' }));
    expect(screen.getAllByText(/100,000 rows/).length).toBeGreaterThan(0);
  });
});

describe('forms page', () => {
  it('shows inline errors on an empty submit and clears them as fields are fixed', async () => {
    render(FormsPage, {});
    expect(screen.getByRole('heading', { level: 1, name: 'Forms' })).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    expect(await screen.findByText('Workspace name is required.')).toBeTruthy();
    const name = screen.getByRole('textbox', { name: /Workspace name/ });
    expect(name.getAttribute('aria-invalid')).toBe('true');
    await fireEvent.input(name, { target: { value: 'Acme Research' } });
    expect(screen.queryByText('Workspace name is required.')).toBeNull();
    expect(name.getAttribute('aria-invalid')).toBeNull();
    // The slug follows the name until edited manually, so its error clears too.
    expect(screen.queryByText('URL slug is required.')).toBeNull();
    expect(screen.getByText('Owner email is required.')).toBeTruthy();
  });
});

describe('chart demos', () => {
  // happy-dom has no layout: give chart frames a width so they draw their plots.
  class FixedWidthObserver {
    callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe(target: Element) {
      this.callback(
        [{ target, contentRect: { width: 640, height: 260 } } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver
      );
    }
    unobserve() {}
    disconnect() {}
  }
  beforeEach(() => vi.stubGlobal('ResizeObserver', FixedWidthObserver));
  afterEach(() => vi.unstubAllGlobals());

  it('stress demo draws 10k deterministic points and switches between SVG and Canvas', async () => {
    const demo = DEMOS['chart-stress'];
    if (!demo) throw new Error('missing chart-stress demo');
    render(await demo.load(), {});
    expect(screen.getByText(/10,000 points per chart · seed 20261019/)).toBeTruthy();
    const svg = screen.getByRole('button', { name: 'SVG' });
    await fireEvent.click(svg);
    expect(svg.getAttribute('aria-pressed')).toBe('true');
    // SVG mode draws a downsampled path; Canvas mode hands pixels to a decorative canvas.
    expect(document.querySelector('path[data-line]')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Canvas' }));
    expect(screen.getByRole('button', { name: 'Canvas' }).getAttribute('aria-pressed')).toBe(
      'true'
    );
  });

  it('states demo switches a chart to its error state and recovers on retry', async () => {
    const demo = DEMOS['chart-states'];
    if (!demo) throw new Error('missing chart-states demo');
    render(await demo.load(), {});
    await fireEvent.click(screen.getByRole('button', { name: 'Error' }));
    const retry = screen.getAllByRole('button', { name: /retry/i })[0] as HTMLElement;
    expect(
      screen.getAllByText('The orders service did not answer (simulated).').length
    ).toBeGreaterThan(0);
    await fireEvent.click(retry);
    expect(
      await screen.findByRole('group', { name: /^Orders this week/ }, { timeout: 3000 })
    ).toBeTruthy();
  });
});
