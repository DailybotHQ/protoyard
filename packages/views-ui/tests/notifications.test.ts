import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationCenter, type NotificationItem } from '../src/notifications/index.ts';

afterEach(cleanup);

const ROWS: NotificationItem[] = [
  {
    id: 'n1',
    kind: 'mention',
    title: 'Marta mentioned you',
    subjectId: 'task-1',
    at: '2026-10-19T10:00:00Z',
    readAt: null,
  },
  {
    id: 'n2',
    kind: 'assigned',
    title: 'A task was assigned',
    subjectId: 'task-2',
    createdAt: '2026-10-18T10:00:00Z',
    readAt: '2026-10-18T11:00:00Z',
  },
];

function center(overrides: Record<string, unknown> = {}) {
  const handlers = {
    onMarkRead: vi.fn(async () => true),
    onMarkAllRead: vi.fn(async () => 1),
    onMuteChange: vi.fn(async () => true),
  };
  const view = render(NotificationCenter, {
    query: { current: ROWS, loading: false, error: undefined },
    now: '2026-10-19T12:00:00Z',
    ...handlers,
    ...overrides,
  });
  return { ...handlers, ...view };
}

describe('NotificationCenter', () => {
  it('names its trigger starting with the visible unread count (label in name)', () => {
    center();
    const trigger = screen.getByRole('button', { name: /Notifications$/ });
    const visible = trigger.textContent?.trim() ?? '';
    expect(visible).toMatch(/^\d+$/);
    expect(trigger.getAttribute('aria-label')).toBe(`${visible} unread, Notifications`);
  });

  it("opens to unread notifications in Texuli's inbox and switches to all", async () => {
    center();
    await fireEvent.click(screen.getByRole('button', { name: /Notifications$/ }));
    expect(document.querySelector('[data-tx-inbox]')).toBeTruthy();
    expect(screen.getByText('Marta mentioned you')).toBeTruthy();
    expect(screen.queryByText('A task was assigned')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('A task was assigned')).toBeTruthy();
    // Each row carries its own machine-readable time from `at` or `createdAt`.
    const times = [...document.querySelectorAll('time')].map((t) => t.getAttribute('datetime'));
    expect(times).toEqual(['2026-10-19T10:00:00.000Z', '2026-10-18T10:00:00.000Z']);
  });

  it('marks one row read through onMarkRead and never offers mark unread (G50)', async () => {
    const { onMarkRead } = center();
    await fireEvent.click(screen.getByRole('button', { name: /Notifications$/ }));
    await fireEvent.click(
      screen.getByRole('button', { name: 'Mark as read: Marta mentioned you' })
    );
    await waitFor(() => expect(onMarkRead).toHaveBeenCalledWith('n1'));
    await fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.queryByRole('button', { name: /^Mark as unread/ })).toBeNull();
  });

  it('opens a row: marks it read and navigates to its subject', async () => {
    const { onMarkRead } = center({
      hrefFor: (item: NotificationItem) => `#/tasks/${item.subjectId}`,
    });
    await fireEvent.click(screen.getByRole('button', { name: /Notifications$/ }));
    await fireEvent.click(screen.getByRole('button', { name: 'Marta mentioned you' }));
    await waitFor(() => expect(onMarkRead).toHaveBeenCalledWith('n1'));
    expect(location.hash).toBe('#/tasks/task-1');
  });

  it('marks all read through the service and rolls optimistic state back on failure', async () => {
    let finish: (value: boolean) => void = () => {};
    const onMarkAllRead = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        })
    );
    const rows = [...ROWS, { ...ROWS[0], id: 'n3', title: 'Second unread' } as NotificationItem];
    center({ onMarkAllRead, query: { current: rows, loading: false, error: undefined } });
    await fireEvent.click(screen.getByRole('button', { name: /Notifications$/ }));
    const markAll = screen.getByRole('button', { name: 'Mark all as read' });
    await fireEvent.click(markAll);
    // Optimistic: nothing unread is left while the service runs.
    expect(markAll.getAttribute('aria-disabled')).toBe('true');
    finish(false);
    await waitFor(() => expect(markAll.getAttribute('aria-disabled')).toBe('false'));
    expect(screen.getByRole('button', { name: 'Unread' }).getAttribute('aria-pressed')).toBe(
      'true'
    );
    expect(onMarkAllRead).toHaveBeenCalledTimes(1);
  });

  it('updates mute preferences through the supplied service callback', async () => {
    const { onMuteChange } = center();
    await fireEvent.click(screen.getByRole('button', { name: /Notifications$/ }));
    await fireEvent.click(screen.getByRole('button', { name: 'Mute mention' }));
    await waitFor(() => expect(onMuteChange).toHaveBeenCalledWith('mention', true));
    expect(
      screen.getByRole('button', { name: 'Unmute mention' }).getAttribute('aria-pressed')
    ).toBe('true');
  });
});
