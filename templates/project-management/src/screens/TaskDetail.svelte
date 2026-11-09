<script lang="ts">
import { ArrowLeft, FileQuestion, MessageSquare, Pencil, Trash2 } from '@lucide/svelte';
import {
  avatarImage,
  back,
  can,
  isValidationError,
  Link,
  liveQuery,
  navigate,
  type RouteProps,
  runService,
  useClock,
} from '@protoyard/renderer-svelte';
import {
  AlertDialog,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Select,
  Separator,
  Skeleton,
  Textarea,
} from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import { Box, Heading, Text } from 'texuli/typography';
import DueBadge from '../components/DueBadge.svelte';
import LabelChip from '../components/LabelChip.svelte';
import PriorityBadge from '../components/PriorityBadge.svelte';
import TaskDialog from '../components/TaskDialog.svelte';
import { type Comment, TASK_STATUSES, type TaskStatus } from '../database/schema.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { STATUS_LABELS, taskKey } from '../domain/tasks.ts';
import { useWorkspace } from '../lib/context.svelte.ts';
import { formatLongDay, fromNow } from '../lib/format.ts';

let { params }: RouteProps = $props();

const workspace = useWorkspace();
const { db, services } = workspace;
const clock = useClock();

const id = () => params.id ?? '';
const task = liveQuery(() => db.tasks.get(id()), { deps: id });
const project = liveQuery(
  async () => {
    const t = await db.tasks.get(id());
    return t ? db.projects.get(t.projectId) : undefined;
  },
  { deps: id }
);
const comments = liveQuery(() => db.comments.where('taskId').equals(id()).sortBy('createdAt'), {
  initial: [],
  deps: id,
});
const history = liveQuery(
  async () => (await db.activity.where('taskId').equals(id()).sortBy('at')).reverse(),
  { initial: [], deps: id }
);

let editOpen = $state(false);
let deleteOpen = $state(false);
let draft = $state('');
let draftError = $state<string | null>(null);
let posting = $state(false);
let removingComment = $state<Comment | null>(null);
let commentConfirmOpen = $state(false);

const editable = $derived(task.current ? can(CAPABILITIES.tasksUpdate, task.current) : false);
const deletable = $derived(task.current ? can(CAPABILITIES.tasksDelete, task.current) : false);
const canComment = $derived(can(CAPABILITIES.commentsCreate));
const name = (personId: string | null) =>
  personId ? (workspace.peopleById.get(personId)?.name ?? 'Former member') : 'Unassigned';
const face = (personId: string | null) =>
  avatarImage(personId ? workspace.peopleById.get(personId)?.avatar : undefined);

async function changeStatus(status: string) {
  const current = task.current;
  if (!current || status === current.status) return;
  await runService(() => services.tasks.move(current.id, status as TaskStatus), {
    success: `Moved to ${STATUS_LABELS[status as TaskStatus]}`,
  });
}

async function postComment(event: SubmitEvent) {
  event.preventDefault();
  const current = task.current;
  if (!current) return;
  posting = true;
  draftError = null;
  const result = await runService(() => services.comments.add(current.id, draft), {
    success: 'Comment posted',
  });
  posting = false;
  if (result.ok) draft = '';
  else if (isValidationError(result.error))
    draftError = result.error.issues.body ?? result.error.message;
}

async function removeTask() {
  const current = task.current;
  if (!current) return;
  const result = await runService(() => services.tasks.remove(current.id), {
    success: 'Task deleted',
  });
  if (!result.ok) throw new Error('The task was not deleted.');
  navigate(`/projects/${current.projectId}`, { replace: true });
}

async function removeComment() {
  const comment = removingComment;
  if (!comment) return;
  const result = await runService(() => services.comments.remove(comment.id), {
    success: 'Comment deleted',
  });
  if (!result.ok) throw new Error('The comment was not deleted.');
}
</script>

<Button variant="ghost" size="sm" class="-ml-2" onclick={() => back(task.current ? `/projects/${task.current.projectId}` : '/')}>
  <LucideIcon icon={ArrowLeft} class="size-4" />Back
</Button>

{#if task.loading}
  <div class="mt-6 space-y-3"><Skeleton class="h-8 w-2/3" /><Skeleton class="h-48 w-full" /></div>
{:else if task.error}
  <ErrorState class="mt-6" title="Could not load this task" message={String(task.error)} />
{:else if !task.current}
  <EmptyState class="mt-6" icon={FileQuestion} title="Task not found" description="It may have been deleted, or this scenario never had it.">
    {#snippet action()}<Button href="#/my-tasks">Go to my tasks</Button>{/snippet}
  </EmptyState>
{:else}
  {@const current = task.current}
  <header class="mt-3 mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
    <div class="min-w-0">
      <Text size="sm" tone="muted">
        {#if project.current}
          <Link href={`/projects/${project.current.id}`}>{project.current.name}</Link> ·
        {/if}
        <Text as="span" size="sm" tone="muted" mono>{taskKey(current, project.current)}</Text>
      </Text>
      <Heading level={1} size="xl" class="mt-1 break-words">{current.title}</Heading>
    </div>
    {#if editable || deletable}
      <div class="flex shrink-0 gap-2">
        {#if editable}
          <Button variant="outline" onclick={() => (editOpen = true)}><LucideIcon icon={Pencil} class="size-4" />Edit</Button>
        {/if}
        {#if deletable}
          <Button variant="ghost" tone="destructive" onclick={() => (deleteOpen = true)}>
            <LucideIcon icon={Trash2} class="size-4" />Delete
          </Button>
        {/if}
      </div>
    {/if}
  </header>

  <div class="grid gap-6 lg:grid-cols-3">
    <div class="min-w-0 space-y-6 lg:col-span-2">
      <Card class="p-5">
        <Heading level={2} size="sm">Description</Heading>
        <Text size="sm" class="mt-2 whitespace-pre-wrap">{current.description || 'No description yet.'}</Text>
      </Card>

      <section aria-labelledby="comments-heading">
        <Heading level={2} size="sm" id="comments-heading" class="mb-3 flex items-center gap-2">
          <LucideIcon icon={MessageSquare} class="size-4" />Comments <Text as="span" size="sm" tone="muted" tabular>{comments.current?.length ?? 0}</Text>
        </Heading>
        {#if (comments.current?.length ?? 0) === 0}
          <Box border="default" radius="lg" padding="md"><Text size="sm" tone="muted" align="center">No comments yet.</Text></Box>
        {:else}
          <ol class="space-y-3">
            {#each comments.current ?? [] as comment (comment.id)}
              <li class="flex gap-3">
                <Avatar name={name(comment.authorId)} {...face(comment.authorId)} size="sm" decorative />
                <Box surface="default" border="default" radius="lg" padding="none" class="min-w-0 flex-1 px-3 py-2">
                  <div class="flex flex-wrap items-baseline gap-x-2">
                    <Text as="span" size="sm" weight="medium">{name(comment.authorId)}</Text>
                    <time datetime={comment.createdAt}><Text as="span" size="xs" tone="muted">{fromNow(comment.createdAt, clock.now)}</Text></time>
                    {#if can(CAPABILITIES.commentsDelete, comment)}
                      <Button
                        type="button"
                        variant="ghost"
                        tone="destructive"
                        size="sm"
                        class="ml-auto"
                        onclick={() => {
                          removingComment = comment;
                          commentConfirmOpen = true;
                        }}
                      >
                        Delete<span class="sr-only"> comment by {name(comment.authorId)}</span>
                      </Button>
                    {/if}
                  </div>
                  <Text size="sm" class="mt-1 whitespace-pre-wrap break-words">{comment.body}</Text>
                </Box>
              </li>
            {/each}
          </ol>
        {/if}

        {#if canComment}
          <form class="mt-4 space-y-2" onsubmit={postComment} novalidate>
            <label for="comment-body" class="sr-only">Write a comment</label>
            <Textarea
              id="comment-body"
              rows={3}
              placeholder="Write a comment…"
              bind:value={draft}
              aria-invalid={draftError ? true : undefined}
              aria-describedby={draftError ? 'comment-error' : undefined}
            />
            {#if draftError}<Text id="comment-error" size="sm" tone="destructive" role="alert">{draftError}</Text>{/if}
            <div class="flex justify-end">
              <Button type="submit" loading={posting} disabled={!draft.trim()}>Post comment</Button>
            </div>
          </form>
        {/if}
      </section>
    </div>

    <aside class="space-y-6">
      <Card class="p-5">
        <dl class="grid grid-cols-3 items-center gap-x-3 gap-y-3">
          <dt><Text as="span" size="sm" tone="muted">Status</Text></dt>
          <dd class="col-span-2">
            {#if editable}
              <Select
                aria-label="Status"
                items={TASK_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
                value={current.status}
                onValueChange={changeStatus}
              />
            {:else}
              <Badge variant={current.status === 'done' ? 'success' : 'secondary'}>{STATUS_LABELS[current.status]}</Badge>
            {/if}
          </dd>
          <dt><Text as="span" size="sm" tone="muted">Assignee</Text></dt>
          <dd class="col-span-2 flex min-w-0 items-center gap-2">
            {#if current.assigneeId}<Avatar name={name(current.assigneeId)} {...face(current.assigneeId)} size="xs" decorative />{/if}
            <Text as="span" size="sm" truncate>{name(current.assigneeId)}</Text>
          </dd>
          <dt><Text as="span" size="sm" tone="muted">Priority</Text></dt>
          <dd class="col-span-2"><PriorityBadge priority={current.priority} /></dd>
          <dt><Text as="span" size="sm" tone="muted">Due</Text></dt>
          <dd class="col-span-2">
            {#if current.dueDate}
              <span class="flex flex-col items-start gap-1">
                <Text as="span" size="sm">{formatLongDay(current.dueDate)}</Text>
                <DueBadge task={current} />
              </span>
            {:else}<Text as="span" size="sm" tone="muted">No due date</Text>{/if}
          </dd>
          <dt><Text as="span" size="sm" tone="muted">Labels</Text></dt>
          <dd class="col-span-2 flex flex-wrap gap-1">
            {#each current.labels as label (label)}<LabelChip {label} />{:else}<Text as="span" size="sm" tone="muted">None</Text>{/each}
          </dd>
          <dt><Text as="span" size="sm" tone="muted">Reporter</Text></dt>
          <dd class="col-span-2 min-w-0"><Text as="span" size="sm" truncate class="block">{name(current.reporterId)}</Text></dd>
          <dt><Text as="span" size="sm" tone="muted">Created</Text></dt>
          <dd class="col-span-2"><Text as="span" size="sm">{fromNow(current.createdAt, clock.now)}</Text></dd>
          <dt><Text as="span" size="sm" tone="muted">Updated</Text></dt>
          <dd class="col-span-2"><Text as="span" size="sm">{fromNow(current.updatedAt, clock.now)}</Text></dd>
        </dl>
      </Card>

      <section aria-labelledby="history-heading">
        <Heading level={2} size="sm" id="history-heading" class="mb-3">History</Heading>
        <div class="flex gap-4">
          <Separator orientation="vertical" class="self-stretch" />
          <ol class="min-w-0 flex-1 space-y-3">
            {#each (history.current ?? []).slice(0, 12) as item (item.id)}
              <li>
                <Text size="sm"><Text as="span" size="sm" weight="medium">{name(item.actorId)}</Text> <Text as="span" size="sm" tone="muted">{item.body.charAt(0).toLowerCase() + item.body.slice(1)}</Text></Text>
                <time datetime={item.at}><Text as="span" size="xs" tone="muted">{fromNow(item.at, clock.now)}</Text></time>
              </li>
            {:else}
              <li><Text size="sm" tone="muted">No history yet.</Text></li>
            {/each}
          </ol>
        </div>
      </section>
    </aside>
  </div>

  <TaskDialog bind:open={editOpen} task={current} />
  <AlertDialog
    bind:open={deleteOpen}
    destructive
    title="Delete this task?"
    description={`“${current.title}” and its comments will be removed. Restore a snapshot in DevTools to get it back.`}
    confirmLabel="Delete task"
    onConfirm={removeTask}
  />
  <AlertDialog
    bind:open={commentConfirmOpen}
    destructive
    title="Delete this comment?"
    description="It will be removed for everyone in this prototype."
    confirmLabel="Delete comment"
    onConfirm={removeComment}
  />
{/if}
