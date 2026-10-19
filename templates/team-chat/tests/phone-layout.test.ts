import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { TeamChatDatabase } from '../src/database/schema.ts';
import { definition } from '../src/prototype.ts';
import AppHost from './AppHost.svelte';

/*
 * The below-md flow (same structure as relay-chat-demo): the channel list and
 * the channel are separate full-width screens, the header tools sit behind a
 * "More actions" disclosure below sm, and focus returns where it came from.
 * happy-dom applies no CSS, so the screens are asserted through the classes
 * that hide them below md (`hidden … md:flex`).
 */
describe('team-chat phone layout', () => {
  let harness = createHarness<TeamChatDatabase>(definition);
  afterEach(() => {
    cleanup();
    harness.closeAll();
    harness = createHarness<TeamChatDatabase>(definition);
  });

  async function open() {
    const runtime = await harness.boot('busy-day');
    const view = render(AppHost, { runtime });
    const channels = await screen.findByRole('navigation', { name: 'Channels' });
    await waitFor(() => expect(within(channels).getAllByRole('button').length).toBeGreaterThan(1));
    const aside = channels.closest('aside') as HTMLElement;
    const main = view.container.querySelector('main') as HTMLElement;
    return { channels, aside, main };
  }

  it('opens on the channel; Back shows the list with focus on the current channel', async () => {
    const { channels, aside, main } = await open();
    // Phone: the channel screen shows, the list is hidden (both show from md up).
    expect(main.className).toMatch(/(^|\s)flex(\s|$)/);
    expect(aside.className).toMatch(/(^|\s)hidden(\s|$)/);
    expect(aside.className).toContain('md:flex');

    await fireEvent.click(screen.getByRole('button', { name: 'Back to channels' }));
    await waitFor(() => expect(aside.className).toContain('w-full'));
    expect(main.className).toMatch(/(^|\s)hidden(\s|$)/);
    const current = within(channels).getByRole('button', { current: 'page' });
    await waitFor(() => expect(document.activeElement).toBe(current));
  });

  it('picking a channel from the list returns to it with focus on its heading', async () => {
    const { channels, aside, main } = await open();
    await fireEvent.click(screen.getByRole('button', { name: 'Back to channels' }));
    await waitFor(() => expect(aside.className).toContain('w-full'));
    const other = within(channels)
      .getAllByRole('button')
      .find((b) => b.getAttribute('aria-current') !== 'page') as HTMLElement;
    const name = other.textContent?.replace(/[#·]/g, '').trim() as string;
    await fireEvent.click(other);
    const heading = screen.getByRole('heading', { level: 1 });
    await waitFor(() => expect(heading.textContent?.trim()).toBe(name));
    expect(main.className).toMatch(/(^|\s)flex(\s|$)/);
    expect(aside.className).toMatch(/(^|\s)hidden(\s|$)/);
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(other.getAttribute('aria-current')).toBe('page');
  });

  it('"More actions" discloses search, files and huddle; Escape closes it and returns focus', async () => {
    await open();
    const trigger = screen.getByRole('button', { name: 'More actions' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('group', { name: 'More actions' })).toBeNull();
    await fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const panel = screen.getByRole('group', { name: 'More actions' });
    expect(trigger.getAttribute('aria-controls')).toBe(panel.id);
    expect(within(panel).getByLabelText('Search messages')).toBeTruthy();
    expect(within(panel).getByRole('button', { name: 'Start huddle' })).toBeTruthy();
    within(panel).getByLabelText('Search messages').focus();
    await fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('group', { name: 'More actions' })).toBeNull());
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it('closing a thread returns focus to the "Reply in thread" button that opened it', async () => {
    await open();
    const replies = await screen.findAllByRole('button', { name: 'Reply in thread' });
    const opener = replies[0] as HTMLElement;
    const messageId = opener.closest('[data-message-id]')?.getAttribute('data-message-id');
    await fireEvent.click(opener);
    const close = await screen.findByRole('button', { name: 'Close thread' });
    await fireEvent.click(close);
    await waitFor(() =>
      expect(
        document.activeElement?.closest('[data-message-id]')?.getAttribute('data-message-id')
      ).toBe(messageId)
    );
    expect(document.activeElement?.hasAttribute('data-thread-trigger')).toBe(true);
  });
});
