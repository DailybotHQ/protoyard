import { cleanup, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import { definition } from '../src/prototype.ts';
import AppHost from './AppHost.svelte';

afterEach(() => {
  cleanup();
  location.hash = '';
});

describe('Atlas layout gallery', () => {
  // The host marks the layout on screen (data-py-layout); docs marks itself.
  const layoutMarkers: Record<string, string> = {
    sidebar: '[data-py-layout="sidebar"]',
    rail: '[data-py-layout="rail"]',
    'top-nav': '[data-py-layout="top-nav"]',
    'dual-sidebar': '[data-py-layout="dual-sidebar"]',
    'master-detail': '[data-py-layout="master-detail"]',
    'dashboard-grid': '[data-py-layout="dashboard-grid"]',
    docs: '[data-py-docs-layout]',
    marketing: '[data-py-layout="marketing"]',
    wizard: '[data-py-layout="wizard"]',
    'auth-split': '[data-py-layout="auth-split"]',
  };

  it('renders its default layout through LayoutHost', async () => {
    const harness = createHarness(definition);
    const runtime = await harness.boot('active');
    try {
      const { container } = render(AppHost, { runtime });
      await waitFor(() =>
        expect(container.querySelector('[data-py-layout="sidebar"]')).toBeTruthy()
      );
      expect(container.querySelector('[data-py-layout-host]')?.getAttribute('data-layout')).toBe(
        'sidebar'
      );
    } finally {
      harness.closeAll();
    }
  });

  it('loads each supported layout through the host on demand', async () => {
    const harness = createHarness(definition);
    const runtime = await harness.boot('active');
    const supported = definition.manifest.preview.layout?.supported ?? [];
    try {
      const { container } = render(AppHost, { runtime });
      for (const layout of supported) {
        const marker = layoutMarkers[layout];
        if (!marker) throw new Error(`Missing rendered marker for layout "${layout}"`);
        await runtime.theme.setOverride({ layout });
        await waitFor(() =>
          expect(
            container.querySelector('[data-py-layout-host]')?.getAttribute('data-layout')
          ).toBe(layout)
        );
        await waitFor(() => expect(container.querySelector(marker)).toBeTruthy());
      }
    } finally {
      harness.closeAll();
    }
  });
});
