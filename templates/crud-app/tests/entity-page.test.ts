import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import { blueprint } from '../src/generated/blueprint.ts';
import { definition } from '../src/prototype.ts';
import EntityPageHarness from './fixtures/EntityPageHarness.svelte';

const harness = createHarness(definition);

afterEach(() => {
  cleanup();
  harness.closeAll();
});

describe('CRUD app entity page', () => {
  it('renders the template blueprint plural as a title-case list heading', async () => {
    const runtime = await harness.boot('active');
    const entity = blueprint.entities[0]!;
    const expected = entity.plural
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
    render(EntityPageHarness, { runtime, entityName: entity.name });
    expect(screen.getByRole('heading', { name: expected, level: 1 })).toBeTruthy();
    expect(screen.queryByText(/Blueprint-driven list and forms/)).toBeNull();
  });
});
