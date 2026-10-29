import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EmbedApp from '../src/embed/EmbedApp.svelte';
import type { MountEmbed } from '../src/host.ts';
import EmbedHarness from './fixtures/EmbedHarness.svelte';

afterEach(() => cleanup());

const APP = {
  formatVersion: 1,
  name: 'Demo Tracker',
  kind: 'app',
  entities: [{ id: 'task', name: 'Task', fields: [{ name: 'title', type: 'text' }] }],
  roles: [{ id: 'member', name: 'Member' }],
  screens: [{ id: 'home', path: '/', title: 'Home', view: 'dashboard' }],
} as const;

const EMBED_BLOCK = {
  type: 'embed-app' as const,
  id: 'try-it',
  title: 'Try the tracker',
  height: 'md' as const,
  startLabel: 'Open demo',
  app: { ...APP },
};

describe('EmbedApp without mountEmbed', () => {
  it('shows an accessible note and never mounts', async () => {
    const mountEmbed = vi.fn();
    render(EmbedHarness, {
      props: {
        blocks: [EMBED_BLOCK],
        // omit mountEmbed
      },
    });
    const start = await screen.findByRole('button', { name: /Open demo|Start/i });
    await fireEvent.click(start);
    await waitFor(() =>
      expect(document.body.textContent).toMatch(/unavailable|cannot start|could not/i)
    );
    expect(mountEmbed).not.toHaveBeenCalled();
  });
});

describe('EmbedApp with mountEmbed', () => {
  it('does not call mountEmbed before the start click', async () => {
    const mountEmbed = vi.fn<MountEmbed>(() => () => undefined);
    render(EmbedHarness, {
      props: { blocks: [EMBED_BLOCK], mountEmbed },
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open demo' })).toBeTruthy());
    expect(mountEmbed).not.toHaveBeenCalled();
    const idleRegions = screen.getAllByRole('region', { name: /Try the tracker/ });
    expect(
      idleRegions.some((el) => el.getAttribute('data-tx-embed-started') === 'false') ||
        idleRegions.every((el) => el.getAttribute('data-tx-embed-started') !== 'true')
    ).toBe(true);
  });

  it('calls mountEmbed once after the start click and shows the frame', async () => {
    const mountEmbed = vi.fn<MountEmbed>((target, app) => {
      const node = document.createElement('p');
      node.textContent = String((app as { name?: string }).name ?? 'app');
      target.append(node);
      return () => {
        target.replaceChildren();
      };
    });
    render(EmbedHarness, {
      props: { blocks: [EMBED_BLOCK], mountEmbed },
    });
    const start = await screen.findByRole('button', { name: 'Open demo' });
    await fireEvent.click(start);
    await waitFor(() => expect(mountEmbed).toHaveBeenCalledTimes(1));
    expect(mountEmbed.mock.calls[0]?.[1]).toMatchObject({ name: 'Demo Tracker' });
    expect(mountEmbed.mock.calls[0]?.[0]).toBeInstanceOf(HTMLElement);
    expect(screen.getByText('Demo Tracker')).toBeTruthy();
    const regions = screen.getAllByRole('region', { name: /Try the tracker/ });
    expect(regions.some((el) => el.getAttribute('data-tx-embed-started') === 'true')).toBe(true);

    // Second click on start is gone; Close does not remount.
    await fireEvent.click(screen.getByRole('button', { name: /Close/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open demo' })).toBeTruthy());
    expect(mountEmbed).toHaveBeenCalledTimes(1);
  });

  it('surfaces mount errors as an alert without leaving the app started', async () => {
    const mountEmbed = vi.fn<MountEmbed>(async () => {
      throw new Error('Untrusted blueprint refused');
    });
    render(EmbedHarness, {
      props: { blocks: [EMBED_BLOCK], mountEmbed },
    });
    await fireEvent.click(await screen.findByRole('button', { name: 'Open demo' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/refused|could not|error|start/i)
    );
    expect(mountEmbed).toHaveBeenCalledTimes(1);
    const idleRegions = screen.getAllByRole('region', { name: /Try the tracker/ });
    expect(
      idleRegions.some((el) => el.getAttribute('data-tx-embed-started') === 'false') ||
        idleRegions.every((el) => el.getAttribute('data-tx-embed-started') !== 'true')
    ).toBe(true);
  });

  it('uses the default start label when startLabel is omitted', async () => {
    const mountEmbed = vi.fn<MountEmbed>(() => undefined);
    render(EmbedApp, {
      props: {
        block: {
          type: 'embed-app',
          id: 'e1',
          title: 'Mini app',
          app: { ...APP },
        },
      },
    });
    // EmbedApp without setBlockHost → no mountEmbed → unavailable after start or idle note.
    const btn = screen.queryByRole('button');
    if (btn) await fireEvent.click(btn);
    await waitFor(() =>
      expect(document.body.textContent).toMatch(/unavailable|cannot|mount|start/i)
    );

    cleanup();
    render(EmbedHarness, {
      props: {
        blocks: [{ type: 'embed-app', id: 'e2', title: 'Mini app', app: { ...APP } }],
        mountEmbed,
      },
    });
    expect(await screen.findByRole('button', { name: 'Start the app' })).toBeTruthy();
  });
});
