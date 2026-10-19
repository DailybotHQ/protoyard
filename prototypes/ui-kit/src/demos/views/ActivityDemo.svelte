<script lang="ts">
import { ActivityFeed, type ActivityPerson, CommentThread } from '@protoyard/views-ui/activity';

type Comment = {
  id: string;
  subjectId: string;
  parentId: string | null;
  authorId: string;
  body: string;
  mentionIds: string[];
  createdAt: string;
};
const people: ActivityPerson[] = [
  { id: 'ada', name: 'Ada Okafor', handle: 'ada.okafor' },
  { id: 'bruno', name: 'Bruno Rao', handle: 'bruno.rao' },
];
let comments = $state<Comment[]>([
  {
    id: 'c1',
    subjectId: 'launch',
    parentId: null,
    authorId: 'ada',
    body: 'The first draft is ready for review.',
    mentionIds: [],
    createdAt: '2026-10-19T10:00:00.000Z',
  },
]);
const commentQuery = $derived({ current: comments, loading: false, error: null });
const activityQuery = {
  current: [
    {
      id: 'a1',
      actorId: 'ada',
      kind: 'update' as const,
      lines: ['Status changed from Draft to In review'],
      at: '2026-10-19T09:30:00.000Z',
    },
  ],
  loading: false,
  error: null,
};
let count = 1;
async function send(input: { body: string; parentId: string | null }) {
  await Promise.resolve();
  count += 1;
  comments = [
    ...comments,
    {
      id: `c${count}`,
      subjectId: 'launch',
      ...input,
      authorId: 'ada',
      mentionIds: [],
      createdAt: new Date().toISOString(),
    },
  ];
}
</script>
<div class="grid gap-6 lg:grid-cols-2"><section><h3 class="mb-2 font-semibold">Comments</h3><CommentThread query={commentQuery} {people} currentUserId="ada" now={new Date('2026-10-19T12:00:00Z')} onSend={send} /></section><section><h3 class="mb-2 font-semibold">Activity</h3><ActivityFeed query={activityQuery} {people} now={new Date('2026-10-19T12:00:00Z')} /></section></div>
