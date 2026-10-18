import type { InboxService, SaasInboxMessage } from '@protoyard/saas';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import InboxBadge from '../src/components/InboxBadge.svelte';
import ProvideInboxHarness from './fixtures/ProvideInboxHarness.svelte';

afterEach(() => {
  cleanup();
  location.hash = '';
});

describe('InboxBadge', () => {
  it('exposes the unread count in its accessible name and opens on click', async () => {
    const onopen = vi.fn();
    render(InboxBadge, { props: { unreadCount: 3, onopen } });
    const button = screen.getByRole('button', { name: 'Open simulated inbox, 3 unread messages' });
    await fireEvent.click(button);
    expect(onopen).toHaveBeenCalledOnce();
    expect(button.textContent).toContain('3');
  });
});

describe('Inbox UI', () => {
  it('opens a floating signed-out inbox after entering a fictional recipient', async () => {
    const service = inboxService();
    render(ProvideInboxHarness, { props: { service } });
    await fireEvent.click(screen.getByRole('button', { name: 'Open simulated inbox' }));
    expect(screen.getByRole('dialog', { name: 'Simulated inbox' })).toBeTruthy();
    expect(
      screen.getByText('Enter the address used by this prototype to view its simulated messages.')
    ).toBeTruthy();

    await fireEvent.input(screen.getByRole('textbox', { name: 'Fictional inbox email' }), {
      target: { value: 'ada@example.com' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Open inbox' }));
    await screen.findByText('Your simulated sign-in link');
    expect(service.list).toHaveBeenCalledWith({ recipient: 'ada@example.com' });
  });

  it('marks a message read and archives it through the inbox service', async () => {
    const service = inboxService();
    render(ProvideInboxHarness, {
      props: { service, recipient: 'ada@example.com', embedded: true },
    });
    await screen.findByText('Your simulated sign-in link');

    await fireEvent.click(screen.getByRole('button', { name: 'Mark as read' }));
    await waitFor(() => expect(service.markRead).toHaveBeenCalledWith('message-1'));
    expect(screen.queryByText('Unread')).toBeNull();

    await fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(service.archive).toHaveBeenCalledWith('message-1'));
    await waitFor(() => expect(screen.queryByText('Your simulated sign-in link')).toBeNull());
  });

  it('opens an action link in the in-app hash route and marks its message read', async () => {
    const service = inboxService();
    render(ProvideInboxHarness, {
      props: { service, recipient: 'ada@example.com', embedded: true },
    });
    await screen.findByText('Your simulated sign-in link');
    await fireEvent.click(screen.getByRole('button', { name: 'Open Sign in' }));
    await waitFor(() => expect(location.hash).toBe('#/auth/magic?token=magic-demo'));
    expect(service.markRead).toHaveBeenCalledWith('message-1');
  });

  it('renders message bodies as text rather than interpreting markup', async () => {
    const service = inboxService({ body: '<img src=x onerror=alert(1)>' });
    render(ProvideInboxHarness, {
      props: { service, recipient: 'ada@example.com', embedded: true },
    });
    expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
  });
});

function inboxService(overrides: Partial<SaasInboxMessage> = {}): InboxService {
  const row: SaasInboxMessage = {
    id: 'message-1',
    recipient: 'ada@example.com',
    personaId: null,
    kind: 'magic-link',
    subject: 'Your simulated sign-in link',
    body: 'Use this in-app link to sign in.',
    action: { label: 'Sign in', href: '#/auth/magic?token=magic-demo' },
    at: '2026-10-17T12:00:00.000Z',
    readAt: null,
    archivedAt: null,
    ...overrides,
  };
  let current: SaasInboxMessage | undefined = row;
  const service: InboxService = {
    deliver: vi.fn(async () => row),
    write: vi.fn(async () => row),
    list: vi.fn(async ({ recipient } = {}) =>
      current && current.recipient === recipient && !current.archivedAt ? [current] : []
    ),
    get: vi.fn(async () => current),
    markRead: vi.fn(async () => {
      if (current) current = { ...current, readAt: '2026-10-17T12:01:00.000Z' };
      return current as SaasInboxMessage;
    }),
    archive: vi.fn(async () => {
      if (current) {
        current = {
          ...current,
          archivedAt: '2026-10-17T12:02:00.000Z',
          readAt: current.readAt ?? '2026-10-17T12:02:00.000Z',
        };
      }
      return current as SaasInboxMessage;
    }),
  };
  return service;
}
