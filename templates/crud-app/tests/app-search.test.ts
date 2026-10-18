import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createEntityServices } from '@protoyard/blueprint';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import { blueprint } from '../src/generated/blueprint.ts';
import { definition } from '../src/prototype.ts';
import AppSearchHarness from './fixtures/AppSearchHarness.svelte';

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));

vi.mock('@protoyard/renderer-svelte', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@protoyard/renderer-svelte')>()),
  navigate: navigateMock,
}));

const harness = createHarness(definition);

afterEach(() => {
  cleanup();
  harness.closeAll();
  navigateMock.mockReset();
});

describe('CRUD app search', () => {
  it('does not mount a second toaster inside the app', async () => {
    const appSource = await readFile(resolve('templates/crud-app/src/App.svelte'), 'utf8');
    expect(appSource).not.toMatch(/<Toaster\s*\/>/);
    expect(appSource).not.toMatch(/import\s+\{[^}]*\bToaster\b/);
  });

  it('searches blueprint entities and opens the selected result route', async () => {
    const runtime = await harness.boot('active');
    const entity = blueprint.entities[0]!;
    const services = createEntityServices(runtime, blueprint);
    const titleField = entity.titleField;
    const title = 'Generated record result';
    const row = await services[entity.name]!.create({ [titleField]: title });

    render(AppSearchHarness, { runtime });
    await fireEvent.keyDown(window, { key: 'k', metaKey: true });
    const search = await screen.findByRole('combobox', { name: 'Search commands' });
    await fireEvent.input(search, { target: { value: title } });
    const result = await screen.findByRole('option', { name: title });
    await fireEvent.click(result);

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(
        `/${entity.plural}/${encodeURIComponent(String(row.id))}`
      )
    );
  });
});
