// @vitest-environment happy-dom
import type { ReviewComment, ReviewContext } from '@protoyard/core/review';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ReviewPanel from '../src/panel/ReviewPanel.svelte';
import ReviewToolbar from '../src/toolbar/ReviewToolbar.svelte';

afterEach(cleanup);

const anchor = (path: string, locator: string): ReviewComment['anchor'] => ({
  route: { pattern: path, path },
  locators: [{ kind: 'id', value: locator }],
  offset: { x: 0.5, y: 0.5 },
});
const context: ReviewContext = {
  scenario: 'busy-week',
  persona: 'persona_alex',
  shell: 'browser',
  theme: 'midnight',
  mode: 'dark',
  viewport: { width: 1280, height: 800 },
};
const comments: ReviewComment[] = [
  {
    formatVersion: 1,
    id: 'thread_root_123456789',
    threadId: 'thread_root_123456789',
    slug: 'demo-app',
    body: 'Review the quarterly report',
    author: { name: 'Alex Reviewer', clientId: 'review_alex_123456789' },
    createdAt: '2026-10-19T12:00:00Z',
    anchor: anchor('/reports', 'quarterly-report'),
    context,
  },
  {
    formatVersion: 1,
    id: 'thread_root_987654321',
    threadId: 'thread_root_987654321',
    slug: 'demo-app',
    body: 'Looks good now',
    author: { name: 'Marta Reviewer', clientId: 'review_marta_123456789' },
    createdAt: '2026-10-19T12:10:00Z',
    resolvedAt: '2026-10-19T12:30:00Z',
    anchor: anchor('/settings', 'settings-heading'),
    context: { ...context, scenario: 'quiet-week' },
  },
];

function runtimeMock(activeScenario = 'busy-week') {
  return {
    scenarios: {
      active: () => ({ scenario: { id: activeScenario } }),
      load: vi.fn(async (_id: string, _options?: { snapshotFirst?: boolean }) => {}),
    },
    session: {
      principal: () => ({ persona: { id: 'persona_current' } }),
      switchActor: vi.fn(async () => {}),
    },
    theme: {
      appearance: () => ({
        theme: { value: 'daylight' },
        mode: { value: 'light' as const },
        shell: { value: 'browser' as const },
      }),
      setOverride: vi.fn(async () => {}),
    },
  };
}

describe('review comments panel', () => {
  it('filters threads and shows per-screen counts and route, author, time and state', async () => {
    render(ReviewPanel, { comments, currentContext: context });
    expect(
      within(screen.getByRole('list', { name: 'Comment threads' })).getByText('/reports')
    ).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Thread counts by screen' }).textContent).toContain(
      '/reports1'
    );
    expect(
      within(screen.getByRole('list', { name: 'Comment threads' })).queryByText('/settings')
    ).toBeNull();
    await fireEvent.change(screen.getByLabelText('Filter by state'), {
      target: { value: 'resolved' },
    });
    expect(
      await within(screen.getByRole('list', { name: 'Comment threads' })).findByText('/settings')
    ).toBeTruthy();
    expect(
      within(screen.getByRole('list', { name: 'Comment threads' })).getByText(/Marta Reviewer/)
        .textContent
    ).toContain('Resolved');
    await fireEvent.input(screen.getByRole('searchbox', { name: 'Search comments' }), {
      target: { value: 'quarterly' },
    });
    await waitFor(() => expect(screen.getByText('No comments match these filters.')).toBeTruthy());
  });

  it('filters by screen, author and orphan status', async () => {
    render(ReviewPanel, { comments, orphanedThreadIds: [comments[1]?.id ?? ''] });
    await fireEvent.change(screen.getByLabelText('Filter by state'), {
      target: { value: 'all' },
    });
    await fireEvent.change(screen.getByLabelText('Filter by screen'), {
      target: { value: '/settings' },
    });
    expect(
      within(screen.getByRole('list', { name: 'Comment threads' })).getByText('Looks good now')
    ).toBeTruthy();
    await fireEvent.change(screen.getByLabelText('Filter by author'), {
      target: { value: 'Marta Reviewer' },
    });
    expect(
      within(screen.getByRole('list', { name: 'Comment threads' })).getByText(/Marta Reviewer/)
    ).toBeTruthy();
    await fireEvent.change(screen.getByLabelText('Filter by anchor status'), {
      target: { value: 'orphaned' },
    });
    expect(
      within(screen.getByRole('list', { name: 'Comment threads' })).getByText('Looks good now')
    ).toBeTruthy();
    await fireEvent.change(screen.getByLabelText('Filter by author'), {
      target: { value: 'Alex Reviewer' },
    });
    expect(screen.getByText('No comments match these filters.')).toBeTruthy();
  });

  it('navigates to the saved route, restores appearance and persona, then focuses the pin', async () => {
    const runtime = runtimeMock();
    const onNavigate = vi.fn();
    const focusThread = vi.fn();
    render(ReviewPanel, {
      comments,
      currentContext: {
        ...context,
        shell: 'phone',
        theme: 'daylight',
        mode: 'light',
        persona: 'persona_current',
      },
      runtime,
      onNavigate,
      focusThread,
    });
    await fireEvent.click(screen.getByRole('button', { name: /Review the quarterly report/ }));
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('/reports'));
    expect(
      await screen.findByRole('button', { name: 'Restore saved shell, theme and persona' })
    ).toBeTruthy();
    await fireEvent.click(
      screen.getByRole('button', { name: 'Restore saved shell, theme and persona' })
    );
    await waitFor(() => expect(runtime.session.switchActor).toHaveBeenCalledWith('persona_alex'));
    expect(runtime.theme.setOverride).toHaveBeenCalledWith({
      themeId: 'midnight',
      mode: 'dark',
      shell: 'browser',
    });
    await waitFor(() => expect(focusThread).toHaveBeenCalledWith(comments[0]?.id));
  });

  it('confirms destructive scenario changes and requests a safety snapshot', async () => {
    const runtime = runtimeMock();
    render(ReviewPanel, { comments, currentContext: context, runtime, onNavigate: vi.fn() });
    await fireEvent.change(screen.getByLabelText('Filter by state'), {
      target: { value: 'resolved' },
    });
    await fireEvent.click(screen.getByRole('button', { name: /Looks good now/ }));
    expect(runtime.scenarios.load).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog').textContent).toContain(
      'replaces this prototype’s current data'
    );
    await fireEvent.click(screen.getByRole('button', { name: 'Switch scenario and open comment' }));
    await waitFor(() =>
      expect(runtime.scenarios.load).toHaveBeenCalledWith('quiet-week', { snapshotFirst: true })
    );
  });

  it('shows live HTTP pending-sync counts from subscribePending', async () => {
    let pendingCount = 0;
    let notify: (() => void) | undefined;
    const adapter = {
      info: () => ({ kind: 'http' as const, shared: true, live: true }),
      pendingCount: () => pendingCount,
      subscribePending: (callback: () => void) => {
        notify = callback;
        return () => {
          notify = undefined;
        };
      },
    };
    render(ReviewToolbar, {
      adapter,
      count: comments.length,
      onCommentModeChange: vi.fn(),
      onPanelChange: vi.fn(),
      onExport: vi.fn(),
      onImport: vi.fn(),
    });
    expect(screen.getByRole('status').textContent).toBe('All comments synced');
    pendingCount = 2;
    notify?.();
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('2 comments waiting to sync')
    );
  });
});
