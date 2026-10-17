import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { CATALOG_IDS } from '../src/catalog/entries.ts';
import { DEMOS } from '../src/catalog/registry.ts';
import FormsPage from '../src/screens/FormsPage.svelte';

afterEach(() => cleanup());

describe('catalog registry', () => {
  it('has exactly one demo per catalog id', () => {
    expect(Object.keys(DEMOS).sort()).toEqual([...CATALOG_IDS].sort());
  });

  it.each(Object.keys(DEMOS))('%s has a snippet importing @protoyard/ui and a11y notes', (id) => {
    const demo = DEMOS[id];
    expect(demo?.snippet).toContain("from '@protoyard/ui'");
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
