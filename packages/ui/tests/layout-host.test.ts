import { type LayoutId, layoutForWidth } from '@protoyard/core';
import { cleanup, render, waitFor } from '@testing-library/svelte';
import { registerLayout } from 'texuli/layouts/host';
import { afterEach, describe, expect, it } from 'vitest';
import { LAYOUT_REGISTRY } from '../src/layouts/registry.ts';
import LayoutHostHarness from './fixtures/LayoutHostHarness.svelte';
import TestRailLayout from './fixtures/TestRailLayout.svelte';
import TestSidebarLayout from './fixtures/TestSidebarLayout.svelte';

// Tests swap in fixture layouts; put the real lazy entries back afterwards.
const realSidebar = LAYOUT_REGISTRY.sidebar;
const realRail = LAYOUT_REGISTRY.rail;

// registerLayout (not assignment) so texuli's per-id load cache follows the swap.
afterEach(() => {
  cleanup();
  if (realSidebar) registerLayout('sidebar', realSidebar);
  if (realRail) registerLayout('rail', realRail);
});

describe('LayoutHost', () => {
  it('lazy-loads the selected layout and shows its chrome skeleton while loading', async () => {
    let resolveLayout: ((module: { default: typeof TestSidebarLayout }) => void) | undefined;
    let loads = 0;
    registerLayout('sidebar', {
      load: () => {
        loads++;
        return new Promise((resolve) => {
          resolveLayout = resolve;
        });
      },
    });
    const view = render(LayoutHostHarness, { props: { layout: 'sidebar' } });
    expect(loads).toBe(1);
    expect(
      view.container.querySelector('[role="status"][aria-label="Loading layout"]')
    ).toBeTruthy();
    expect(view.container.textContent).toContain('count: 0');
    resolveLayout?.({ default: TestSidebarLayout });
    await waitFor(() =>
      expect(view.container.querySelector('[data-test-layout="sidebar"] main button')).toBeTruthy()
    );
  });

  it('uses catalog breakpoints to fall back responsively', async () => {
    const priorWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
    registerLayout('sidebar', { load: async () => ({ default: TestSidebarLayout }) });
    const view = render(LayoutHostHarness, { props: { layout: 'dual-sidebar' } });
    await waitFor(() =>
      expect(view.container.querySelector('[data-layout="sidebar"]')).toBeTruthy()
    );
    expect(layoutForWidth('sidebar', 700)).toBe('mobile-drawer');
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: priorWidth });
  });

  it('keeps the routed screen DOM and local state mounted across layout switches', async () => {
    registerLayout('sidebar', { load: async () => ({ default: TestSidebarLayout }) });
    registerLayout('rail', { load: async () => ({ default: TestRailLayout }) });
    const view = render(LayoutHostHarness, { props: { layout: 'sidebar' } });
    await waitFor(() =>
      expect(view.container.querySelector('[data-test-layout="sidebar"] main button')).toBeTruthy()
    );
    const button = view.container.querySelector('button');
    expect(button).toBeTruthy();
    if (!button) return;
    const screenInstance = button.textContent;
    await view.rerender({ layout: 'rail' as LayoutId });
    await waitFor(() =>
      expect(view.container.querySelector('[data-test-layout="rail"] main button')).toBeTruthy()
    );
    expect(view.container.querySelector('button')).toBe(button);
    expect(button.textContent).toBe(screenInstance);
  });
});
