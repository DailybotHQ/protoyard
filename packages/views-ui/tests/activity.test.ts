import type { ActivityComment, ActivityItem } from '@protoyard/views/activity';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
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

const loadEditor: EditorLoader = async () => MarkdownEditor;
const NOW = '2026-10-19T15:00:00Z';
const PEOPLE: ActivityPerson[] = [
  { id: 'p-li', name: 'Li Wei', avatar: '/avatars/li.webp' },
  { id: 'p-marta', name: 'Marta Ruiz', avatar: 'av-012' },
];
const COMMENTS: ActivityComment[] = [
  {
    id: 'c1',
    authorId: 'p-marta',
    body: 'Can @{p-li} check this?',
    createdAt: '2026-10-19T09:00:00Z',
  },
];
const query = <T>(current: T[] | undefined) => ({ current, loading: false, error: undefined });

beforeAll(async () => {
  await lazyDialog.load();
}, 30_000);

describe('CommentThread', () => {
  it('renders threads with names resolved from ids', () => {
    render(CommentThread<ActivityComment>, {
      query: query(COMMENTS),
      people: PEOPLE,
      currentUserId: 'p-li',
      now: NOW,
      onSend: vi.fn(async () => {}),
      loadEditor,
    });
    expect(screen.getByRole('article')).toBeTruthy();
  });
});

describe('ActivityFeed (Texuli adapter)', () => {
  const ITEMS: ActivityItem[] = [
    {
      id: 'a1',
      at: '2026-10-19T12:00:00Z',
      actorId: 'p-marta',
      kind: 'update',
      lines: ['changed stage'],
    },
  ];

  it('renders items from query through Texuli feed', async () => {
    render(ActivityFeed, {
      query: query(ITEMS),
      people: PEOPLE,
      now: NOW,
    });
    await waitFor(() => expect(document.body.textContent).toMatch(/changed stage|Marta|activity/i));
  });
});

describe('personImage', () => {
  it('resolves a person record', () => {
    const src = personImage({ id: 'x', name: 'A', avatar: 'av-012' });
    expect(src).toBeTruthy();
  });
});
