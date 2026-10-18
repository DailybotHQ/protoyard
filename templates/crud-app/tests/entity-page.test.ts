import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import { definition } from '../src/prototype.ts';
import EntityPageHarness from './fixtures/EntityPageHarness.svelte';

const harness = createHarness(definition);

afterEach(() => {
  cleanup();
  harness.closeAll();
});

describe('CRUD app entity page', () => {
  it('renders blueprint plural names as title-case list headings', async () => {
    const runtime = await harness.boot('active');
    render(EntityPageHarness, { runtime, entityName: 'project' });
    expect(screen.getByRole('heading', { name: 'Projects', level: 1 })).toBeTruthy();
  });
});
