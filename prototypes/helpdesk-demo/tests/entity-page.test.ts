import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import { definition } from '../src/prototype.ts';
import AppHost from './fixtures/AppHost.svelte';

// The app shell and screens load as their own chunks; give them time on a busy machine.
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

describe('help desk app', () => {
  it('opens on the SLA dashboard and keeps its own search in the header', async () => {
    render(AppHost, { runtime: await harness.boot('active') });
    expect(await screen.findByRole('heading', { level: 1, name: 'Beacon Help Desk' })).toBeTruthy();
    expect(await screen.findByText('SLA breached')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Search workspace/ })).toBeTruthy();
  });

  it('renders blueprint plural names as title-case list headings', async () => {
    render(AppHost, { runtime: await harness.boot('active') });
    go('/tickets');
    expect(await screen.findByRole('heading', { name: 'Tickets', level: 1 })).toBeTruthy();
  });

  it('opens a ticket row in the ticket workspace', async () => {
    render(AppHost, { runtime: await harness.boot('active') });
    go('/tickets');
    const rows = await screen.findAllByRole('row', { name: /^Open / });
    const subject = (rows[0]!.getAttribute('aria-label') ?? '').replace(/^Open /, '');
    await fireEvent.click(rows[0]!);
    await waitFor(() => expect(location.hash).toMatch(/^#\/tickets\/[^/]+\/workspace$/));
    expect(await screen.findAllByRole('heading', { level: 1, name: subject })).not.toHaveLength(0);
  });
});
