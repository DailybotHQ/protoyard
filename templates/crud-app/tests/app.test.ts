import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createEntityServices } from '@protoyard/blueprint';
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import { blueprint } from '../src/generated/blueprint.ts';
import { definition } from '../src/prototype.ts';
import AppHost from './AppHost.svelte';

// The app shell loads as its own chunk; give it time on a busy machine.
configure({ asyncUtilTimeout: 10_000 });

let harness = createHarness(definition);
beforeEach(() => {
  harness = createHarness(definition);
  location.hash = '#/';
});
afterEach(() => {
  cleanup();
  harness.closeAll();
  location.hash = '';
});

const go = (path: string) => {
  location.hash = `#${path}`;
  window.dispatchEvent(new HashChangeEvent('hashchange'));
};

const titleCase = (plural: string) =>
  plural.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

describe('crud-app App', () => {
  it('renders the shared blueprint app shell and mounts no second toaster', async () => {
    const source = await readFile(resolve('templates/crud-app/src/App.svelte'), 'utf8');
    expect(source).toContain("import('@protoyard/crud/app')");
    expect(source).toContain('<BlueprintApp {blueprint} {themeLibrary} />');
    expect(source).not.toMatch(/<Toaster\s*\/>/);
    expect(source).not.toMatch(/import\s+\{[^}]*\bToaster\b/);
  });

  it('shows the blueprint home and a title-case heading on each entity list', async () => {
    render(AppHost, { runtime: await harness.boot('active') });
    expect(await screen.findByRole('heading', { level: 1, name: blueprint.name })).toBeTruthy();
    for (const entity of blueprint.entities) {
      go(`/${entity.plural}`);
      expect(
        await screen.findByRole('heading', { level: 1, name: titleCase(entity.plural) })
      ).toBeTruthy();
    }
  });

  it('searches blueprint entities and opens the selected record', async () => {
    const runtime = await harness.boot('active');
    const entity = blueprint.entities[0]!;
    const title = 'Generated record result';
    const row = await createEntityServices(runtime, blueprint)[entity.name]!.create({
      [entity.titleField]: title,
    });
    render(AppHost, { runtime });
    await fireEvent.click(await screen.findByRole('button', { name: /^Search/ }));
    const search = await screen.findByRole('combobox', { name: 'Search commands' });
    await fireEvent.input(search, { target: { value: title } });
    await fireEvent.click(await screen.findByRole('option', { name: new RegExp(title) }));
    await waitFor(() =>
      expect(location.hash).toBe(`#/${entity.plural}/${encodeURIComponent(String(row.id))}`)
    );
    expect(await screen.findByRole('button', { name: 'Save' })).toBeTruthy();
  });
});
