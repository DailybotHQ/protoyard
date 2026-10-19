import { cleanup, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import { definition } from '../src/prototype.ts';
import AppHost from './AppHost.svelte';

afterEach(() => {
  cleanup();
  location.hash = '';
});

describe('crud-app layout', () => {
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
});
