import type { ActivityComment, ActivityItem } from '@protoyard/views/activity';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  ActivityFeed,
  type ActivityPerson,
  CommentThread,
  type EditorLoader,
  personImage,
} from '../src/activity/index.ts';
import { MarkdownEditor } from '../src/editor/index.ts';
import { lazyDialog } from '../src/lib/lazy-overlays.svelte.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// The editor view fits the composer's lazy slot (a type check as much as a test).
const loadEditor: EditorLoader = async () => MarkdownEditor;

const NOW = '2026-10-19T15:00:00Z';
const PEOPLE: ActivityPerson[] = [
  { id: 'p-li', name: 'Li Wei', avatar: '/avatars/li.webp' },
  { id: 'p-marta', name: 'Marta Ruiz', avatar: 'av-012' },
  { id: 'p-sam', name: 'Sam Okafor' },
];
const RECORDS = [{ id: 'deal-42', label: 'Renewal for Acme', value: 'DEAL-42' }];
const COMMENTS: ActivityComment[] = [
  {
    id: 'c1',
    authorId: 'p-marta',
    body: 'Can @{p-li} check #{deal-42}?',
    createdAt: '2026-10-19T09:00:00Z',
    reactions: { '👍': ['p-li'] },
  },
  { id: 'c2', parentId: 'c1', authorId: 'p-li', body: 'On it', createdAt: '2026-10-19T09:30:00Z' },
  { id: 'c3', authorId: 'p-li', body: 'Notes <b>not html</b>', createdAt: '2026-10-18T16:00:00Z' },
];
const query = <T>(current: T[] | undefined) => ({ current, loading: false, error: undefined });

function thread(props: Record<string, unknown> = {}) {
  const handlers = {
    onSend: vi.fn(async (_input: { body: string; parentId: string | null }) => {}),
    onEdit: vi.fn(async (_c: ActivityComment, _body: string) => {}),
    onDelete: vi.fn(async (_c: ActivityComment) => {}),
    onReact: vi.fn(async (_c: ActivityComment, _emoji: string) => {}),
  };
  const result = render(CommentThread<ActivityComment>, {
    query: query(COMMENTS),
    people: PEOPLE,
    records: RECORDS,
    currentUserId: 'p-li',
    now: NOW,
    ...handlers,
    ...props,
  });
  return { ...handlers, ...result };
}
const article = (name: RegExp) => screen.getByRole('article', { name });

// Menus, dialogs and some panels load on first use; load them once up front so
// the first test that opens one never races a cold import on a busy machine.
beforeAll(async () => {
  await lazyDialog.load();
}, 30_000);

describe('CommentThread', () => {
  it('renders threads oldest first, with names resolved from ids and avatars', () => {
    thread();
    const articles = screen.getAllByRole('article');
    expect(articles.map((a) => a.getAttribute('aria-label'))).toEqual([
      'Li Wei, Yesterday, 4:00 PM',
      'Marta Ruiz, Today, 9:00 AM',
      'Li Wei, Today, 9:30 AM',
    ]);
    const first = article(/^Marta Ruiz/);
    expect(first.textContent).toContain('Can @Li Wei check #Renewal for Acme?');
    // Stored text is shown as text, never HTML.
    expect(article(/Yesterday/).textContent).toContain('Notes <b>not html</b>');
    expect(article(/Yesterday/).querySelector('b')).toBeNull();
    // A URL avatar is shown as is; a library id resolves to the 64/128 px faces.
    expect(
      article(/Yesterday/)
        .querySelector('img')
        ?.getAttribute('src')
    ).toBe('/avatars/li.webp');
    const face = first.querySelector('img');
    expect(face?.getAttribute('src')).toBe('./avatars/64/av-012.webp');
    expect(face?.getAttribute('srcset')).toBe(
      './avatars/64/av-012.webp 1x, ./avatars/128/av-012.webp 2x'
    );
    // Decorative next to the visible name: empty alt.
    expect(face?.getAttribute('alt')).toBe('');
    expect(screen.getByRole('list', { name: 'Replies to Marta Ruiz' })).toBeTruthy();
  });

  it('updates old comments when a persona is renamed', async () => {
    const { rerender } = thread();
    await rerender({
      people: PEOPLE.map((p) => (p.id === 'p-li' ? { ...p, name: 'Li Wei-Chen' } : p)),
    });
    expect(article(/^Marta Ruiz/).textContent).toContain('Can @Li Wei-Chen check');
  });

  it('keeps record references actionable after Markdown preview loads', async () => {
    const onOpenReference = vi.fn();
    thread({ onOpenReference });
    const reference = await screen.findByRole('link', { name: '#Renewal for Acme' });
    await fireEvent.click(reference);
    expect(onOpenReference).toHaveBeenCalledWith('deal-42');
  });

  it('sends a comment with mentions stored as ids, showing it as sending', async () => {
    let finish: () => void = () => {};
    const onSend = vi.fn(
      (_input: { body: string; parentId: string | null }) =>
        new Promise<void>((done) => {
          finish = done;
        })
    );
    thread({ onSend });
    const field = screen.getByLabelText('Add a comment') as HTMLTextAreaElement;
    await fireEvent.input(field, { target: { value: 'Thanks @marta.ruiz, see #DEAL-42' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Comment' }));
    expect(onSend).toHaveBeenCalledWith({
      body: 'Thanks @{p-marta}, see #{deal-42}',
      parentId: null,
    });
    const sending = await screen.findByRole('article', { name: 'Sending comment' });
    expect(sending.getAttribute('aria-busy')).toBe('true');
    expect(sending.textContent).toContain('Sending…');
    expect(sending.textContent).toContain('Thanks @Marta Ruiz, see #Renewal for Acme');
    expect(field.value).toBe('');
    finish();
    await waitFor(() =>
      expect(screen.queryByRole('article', { name: 'Sending comment' })).toBeNull()
    );
  });

  it('keeps the draft and shows why when sending fails', async () => {
    const onSend = vi.fn(async () => {
      throw Object.assign(new Error('Invalid'), {
        issues: { body: 'Keep it under 5,000 characters' },
      });
    });
    thread({ onSend });
    const field = screen.getByLabelText('Add a comment') as HTMLTextAreaElement;
    await fireEvent.input(field, { target: { value: 'Too long' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Comment' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('Keep it under 5,000 characters')
    );
    expect(field.value).toBe('Too long');
    expect(screen.queryByRole('article', { name: 'Sending comment' })).toBeNull();
  });

  it('replies to a thread', async () => {
    const { onSend } = thread();
    await fireEvent.click(within(article(/^Marta Ruiz/)).getByRole('button', { name: 'Reply' }));
    const field = await screen.findByLabelText('Reply to Marta Ruiz');
    await fireEvent.input(field, { target: { value: 'Done @marta.ruiz' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith({ body: 'Done @{p-marta}', parentId: 'c1' })
    );
    // Replies have no Reply button of their own (one level).
    expect(within(article(/Today, 9:30/)).queryByRole('button', { name: 'Reply' })).toBeNull();
  });

  it('shows edit and delete only where canEdit allows', async () => {
    thread();
    expect(within(article(/^Marta Ruiz/)).queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(within(article(/Yesterday/)).getByRole('button', { name: 'Edit' })).toBeTruthy();
    cleanup();
    thread({ canEdit: () => false });
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('edits with mentions decoded for typing, and deletes after confirming', async () => {
    const own: ActivityComment = {
      id: 'c9',
      authorId: 'p-li',
      body: 'Ask @{p-marta}',
      createdAt: '2026-10-19T11:00:00Z',
    };
    const { onEdit, onDelete } = thread({ query: query([own]) });
    await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const field = (await screen.findByLabelText('Edit comment by Li Wei')) as HTMLTextAreaElement;
    expect(field.value).toBe('Ask @marta.ruiz');
    await fireEvent.input(field, { target: { value: 'Ask @marta.ruiz and @sam.okafor' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onEdit).toHaveBeenCalledWith(own, 'Ask @{p-marta} and @{p-sam}'));
    await waitFor(() => expect(screen.queryByLabelText('Edit comment by Li Wei')).toBeNull());

    await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await fireEvent.click(await screen.findByRole('button', { name: 'Delete comment' }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(own));
  });

  it('shows a deleted comment that still has replies as a note', () => {
    thread({
      query: query([
        { ...(COMMENTS[0] as ActivityComment), deletedAt: '2026-10-19T10:00:00Z' },
        COMMENTS[1] as ActivityComment,
      ]),
    });
    expect(article(/^Marta Ruiz/).textContent).toContain('This comment was deleted.');
    expect(within(article(/^Marta Ruiz/)).queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  it('toggles reactions through onReact', async () => {
    const { onReact } = thread();
    const first = article(/^Marta Ruiz/);
    const thumbs = within(first).getByRole('button', { name: '👍 1: Li Wei' });
    expect(thumbs.getAttribute('aria-pressed')).toBe('true');
    await fireEvent.click(thumbs);
    await waitFor(() => expect(onReact).toHaveBeenCalledWith(COMMENTS[0], '👍'));
    await fireEvent.click(within(first).getByRole('button', { name: 'React' }));
    await fireEvent.click(within(first).getByRole('button', { name: 'React with 🎉' }));
    await waitFor(() => expect(onReact).toHaveBeenCalledWith(COMMENTS[0], '🎉'));
    await waitFor(() =>
      expect(within(first).queryByRole('group', { name: 'Reactions' })).toBeNull()
    );
  });

  it('loads the rich editor into the composer when given a loader', async () => {
    const { onSend } = thread({ loadEditor, query: query([]) });
    expect(screen.getByText('No comments yet. Start the conversation.')).toBeTruthy();
    await screen.findByRole('toolbar', { name: 'Formatting for Add a comment' });
    const field = screen.getByRole('textbox', { name: 'Add a comment' });
    await fireEvent.input(field, { target: { value: 'Hi @li.wei' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Comment' }));
    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith({ body: 'Hi @{p-li}', parentId: null })
    );
  });
});

describe('ActivityFeed', () => {
  const item = (id: string, at: string, extra: Partial<ActivityItem> = {}): ActivityItem => ({
    id,
    at,
    actorId: 'p-marta',
    kind: 'update',
    lines: ['changed stage from lead to won'],
    ...extra,
  });
  const ITEMS: ActivityItem[] = [
    item('a1', '2026-10-18T10:00:00Z', { recordLabel: 'Renewal for Acme', recordId: 'deal-42' }),
    item('a2', '2026-10-19T12:00:00Z', {
      kind: 'comment',
      actorId: 'p-li',
      lines: [],
      body: 'Ping @{p-marta} <img src=x>',
    }),
    item('a3', '2026-10-12T08:00:00Z', { kind: 'create', lines: ['created'], actorId: 'p-sam' }),
  ];
  const feed = (props: Record<string, unknown> = {}) =>
    render(ActivityFeed, { query: query(ITEMS), people: PEOPLE, now: NOW, ...props });
  const headings = () => screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);

  it("shows each actor's face, with initials when there is none", () => {
    feed();
    const yesterday = screen.getByRole('region', { name: 'Yesterday' });
    expect(yesterday.querySelector('img')?.getAttribute('src')).toBe('./avatars/64/av-012.webp');
    const older = screen.getByRole('region', { name: 'Oct 12' });
    expect(older.querySelector('img')).toBeNull();
    expect(older.querySelector('[data-avatar="initials"]')?.textContent?.trim()).toBe('SO');
  });

  it('groups newest first by day, as plain text', () => {
    const onOpenRecord = vi.fn();
    feed({ onOpenRecord });
    expect(headings()).toEqual(['Today', 'Yesterday', 'Oct 12']);
    const today = screen.getByRole('region', { name: 'Today' });
    expect(today.textContent).toContain('Li Wei commented: “Ping @Marta Ruiz <img src=x>”');
    expect(today.querySelector('img:not([alt])')).toBeNull();
    const yesterday = screen.getByRole('region', { name: 'Yesterday' });
    expect(yesterday.textContent).toMatch(
      /Marta Ruiz\s+changed stage from lead to won\s+on\s+Renewal for Acme/
    );
    yesterday.querySelector('button')?.click();
    expect(onOpenRecord).toHaveBeenCalledWith(ITEMS[0]);
  });

  it('filters by kind and person', async () => {
    feed();
    await fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'comments' } });
    await waitFor(() => expect(headings()).toEqual(['Today']));
    await fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'changes' } });
    await waitFor(() => expect(headings()).toEqual(['Yesterday', 'Oct 12']));
    await fireEvent.change(screen.getByLabelText('By'), { target: { value: 'p-sam' } });
    await waitFor(() => expect(headings()).toEqual(['Oct 12']));
    await fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'comments' } });
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Nothing matches these filters.')
    );
  });

  it('pages locally, then asks for older items', async () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      item(
        `m${i}`,
        `2026-10-19T${String(14 - Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}:00Z`
      )
    );
    const onLoadMore = vi.fn(async () => {});
    feed({ query: query(many), pageSize: 10, hasMore: true, onLoadMore });
    expect(screen.getAllByRole('listitem')).toHaveLength(10);
    await fireEvent.click(screen.getByRole('button', { name: 'Show more (15 more)' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Show more (5 more)' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(25);
    await fireEvent.click(screen.getByRole('button', { name: 'Load older activity' }));
    await waitFor(() => expect(onLoadMore).toHaveBeenCalledTimes(1));
  });
});

describe('personImage', () => {
  it('resolves persona avatars through the renderer, and honors an override', () => {
    expect(personImage(undefined)).toEqual({});
    expect(personImage({ id: 'p-sam', name: 'Sam Okafor' })).toEqual({});
    expect(personImage({ id: 'p-x', name: 'X', avatar: 'javascript:alert(1)' })).toEqual({});
    expect(personImage({ id: 'p-x', name: 'X', avatar: 'av-999' })).toEqual({});
    expect(personImage({ id: 'p-x', name: 'X', avatar: 'av-003' })).toEqual({
      src: './avatars/64/av-003.webp',
      srcset: './avatars/64/av-003.webp 1x, ./avatars/128/av-003.webp 2x',
    });
    const override = (person: ActivityPerson) => `/custom/${person.id}.webp`;
    expect(personImage({ id: 'p-x', name: 'X', avatar: 'av-003' }, override)).toEqual({
      src: '/custom/p-x.webp',
    });
    expect(personImage({ id: 'p-x', name: 'X' }, () => null)).toEqual({});
  });
});
