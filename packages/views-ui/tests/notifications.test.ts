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
  it('opens to unread notifications, switches to all, and groups by day', async () => {
    center();
    await fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(screen.getByText('Marta mentioned you')).toBeTruthy();
    expect(screen.queryByText('A task was assigned')).toBeNull();
    await fireEvent.click(screen.getByRole('tab', { name: 'All' }));
    expect(screen.getByText('A task was assigned')).toBeTruthy();
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('Yesterday')).toBeTruthy();
  });

  it('marks all read after the service resolves and rolls optimistic state back on failure', async () => {
    let finish: (value: boolean) => void = () => {};
    const onMarkAllRead = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        })
    );
    center({ onMarkAllRead });
    await fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    const markAll = screen.getByRole('button', { name: /Mark all read/ });
    await fireEvent.click(markAll);
    expect(markAll.hasAttribute('disabled')).toBe(true);
    finish(false);
    await waitFor(() => expect(screen.getByText('Marta mentioned you')).toBeTruthy());
    expect(screen.getByRole('tab', { name: /Unread/ }).getAttribute('aria-selected')).toBe('true');
    expect(onMarkAllRead).toHaveBeenCalledTimes(1);
  });

  it('updates mute preferences through the supplied service callback', async () => {
    const { onMuteChange } = center();
    await fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Mute mention' }));
    await waitFor(() => expect(onMuteChange).toHaveBeenCalledWith('mention', true));
    expect(
      screen.getByRole('button', { name: 'Unmute mention' }).getAttribute('aria-pressed')
    ).toBe('true');
  });
});
