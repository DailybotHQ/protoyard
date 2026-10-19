// @vitest-environment happy-dom
import type { ReviewComment } from '@protoyard/core/review';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ReviewThread from '../src/thread/ReviewThread.svelte';

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

const ROOT_ID = 'thread_root_123456789';
const OTHER_ID = 'reply_item_123456789';
const AUTHOR = { name: 'Alex Reviewer', clientId: 'review_123456789abcdef0' };
const anchor: ReviewComment['anchor'] = {
  route: { pattern: '/', path: '/' },
  locators: [{ kind: 'id', value: 'target' }],
  offset: { x: 0.5, y: 0.5 },
};
const comments: ReviewComment[] = [
  {
    formatVersion: 1,
    id: ROOT_ID,
    threadId: ROOT_ID,
    slug: 'demo-app',
    body: '<script>window.pwned = true</script> See <a href="javascript:alert(1)">unsafe</a>',
    author: AUTHOR,
    createdAt: '2026-10-19T12:00:00Z',
    anchor,
    context: { viewport: { width: 1280, height: 800 } },
  },
  {
    formatVersion: 1,
    id: OTHER_ID,
    threadId: ROOT_ID,
    slug: 'demo-app',
    body: 'I will take a look.',
    author: { name: 'Marta Reviewer', clientId: 'review_abcdef0123456789' },
    createdAt: '2026-10-19T12:05:00Z',
  },
];

function setup(props: Record<string, unknown> = {}) {
  const handlers = {
    onSend: vi.fn(async () => {}),
    onEdit: vi.fn(async () => {}),
    onDelete: vi.fn(async () => {}),
    onResolve: vi.fn(async () => {}),
  };
  const result = render(ReviewThread, {
    slug: 'demo-app',
    threadId: ROOT_ID,
    comments,
    now: '2026-10-19T13:00:00Z',
    onResolve: handlers.onResolve,
    onSend: handlers.onSend,
    onEdit: handlers.onEdit,
    onDelete: handlers.onDelete,
    ...props,
  });
  return { ...handlers, ...result };
}

describe('review pin thread', () => {
  it('prompts for a display name, stores it locally and reuses the shared thread UI', async () => {
    const { onSend } = setup();
    expect(
      screen.getByText('Your name is shown to other reviewers. It is not a login.')
    ).toBeTruthy();
    await fireEvent.input(screen.getByLabelText('Your name'), {
      target: { value: 'Alex Reviewer' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(JSON.parse(localStorage.getItem('py-review-author:demo-app') ?? '{}')).toMatchObject({
      name: 'Alex Reviewer',
    });
    expect(screen.getByRole('heading', { name: 'Thread by Alex Reviewer' })).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    await fireEvent.input(screen.getByLabelText('Reply to Alex Reviewer'), {
      target: { value: 'Thanks @marta.reviewer' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith(
        expect.objectContaining({
          threadId: ROOT_ID,
          body: 'Thanks @{review_abcdef0123456789}',
          author: expect.objectContaining({ name: 'Alex Reviewer' }),
        })
      )
    );
  });

  it('renders untrusted script bodies as text and filters javascript links', async () => {
    localStorage.setItem('py-review-author:demo-app', JSON.stringify(AUTHOR));
    setup();
    expect(await screen.findByText(/<script>window.pwned = true<\/script>/)).toBeTruthy();
    expect(document.querySelector('script')).toBeNull();
    await waitFor(() => expect(document.querySelector('a[href^="javascript:"]')).toBeNull());
    expect(document.querySelector('[href="javascript:alert(1)"]')).toBeNull();
  });

  it('only exposes edit and delete actions for comments written by this reviewer', async () => {
    localStorage.setItem('py-review-author:demo-app', JSON.stringify(AUTHOR));
    const { onEdit, onDelete } = setup();
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(1);
    await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await fireEvent.input(screen.getByLabelText('Edit comment by Alex Reviewer'), {
      target: { value: 'Updated review note' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onEdit).toHaveBeenCalledWith(comments[0], 'Updated review note'));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('restores a failed reply draft after pending feedback', async () => {
    localStorage.setItem('py-review-author:demo-app', JSON.stringify(AUTHOR));
    let rejectSend: (error: Error) => void = () => {};
    const onSend = vi.fn(
      () =>
        new Promise<void>((_, reject) => {
          rejectSend = reject;
        })
    );
    setup({ onSend });
    await fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    const field = screen.getByLabelText('Reply to Alex Reviewer') as HTMLTextAreaElement;
    await fireEvent.input(field, { target: { value: 'Please check this again.' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    expect(screen.getByRole('article', { name: 'Sending comment' }).getAttribute('aria-busy')).toBe(
      'true'
    );
    rejectSend(new Error('Offline'));
    expect((await screen.findByRole('alert')).textContent).toContain('Offline');
    expect(field.value).toBe('Please check this again.');
  });

  it('calls the service to reopen a resolved thread', async () => {
    localStorage.setItem('py-review-author:demo-app', JSON.stringify(AUTHOR));
    const resolvedRoot = { ...comments[0]!, resolvedAt: '2026-10-19T12:30:00Z' };
    const onResolve = vi.fn(async () => {});
    setup({ comments: [resolvedRoot, comments[1]], onResolve });
    await fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    await waitFor(() => expect(onResolve).toHaveBeenCalledWith(resolvedRoot, AUTHOR, false));
  });

  it('shows pending resolve feedback and reopens the thread after a failed update', async () => {
    localStorage.setItem('py-review-author:demo-app', JSON.stringify(AUTHOR));
    let finish: (error: Error) => void = () => {};
    const onResolve = vi.fn(
      () =>
        new Promise<void>((_, reject) => {
          finish = reject;
        })
    );
    setup({ onResolve });
    const resolve = screen.getByRole('button', { name: 'Resolve' });
    await fireEvent.click(resolve);
    expect(screen.getByRole('button', { name: 'Resolve' }).getAttribute('aria-busy')).toBe('true');
    finish(new Error('Offline'));
    expect((await screen.findByRole('alert')).textContent).toContain('Offline');
    expect(screen.getByRole('button', { name: 'Resolve' })).toBeTruthy();
  });
});
