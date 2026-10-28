<script lang="ts">
import { ArrowLeft, FileQuestion, Pencil, Trash2 } from '@lucide/svelte';
import {
  avatarImage,
  back,
  can,
  Link,
  liveQuery,
  navigate,
  type RouteProps,
  runService,
  useClock,
  usePrincipal,
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
  Skeleton,
} from '@protoyard/ui';
import { CommentThread } from '@protoyard/views-ui/activity';
import { LucideIcon } from 'texuli/icons/lucide';
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
/** Mentionable people for the comment composer (`@maya.chen` → `@{user_0001}`). */
const people = $derived(
  workspace.people.map((person) => ({
    id: person.id,
    name: person.name,
    ...(person.avatar ? { avatar: person.avatar } : {}),
  }))
);
const principal = usePrincipal();
const me = $derived(principal.current?.persona.id ?? '');

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

async function removeTask() {
  const current = task.current;
  if (!current) return;
  const result = await runService(() => services.tasks.remove(current.id), {
    success: 'Task deleted',
  });
  if (!result.ok) throw new Error('The task was not deleted.');
  navigate(`/projects/${current.projectId}`, { replace: true });
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
      <p class="text-sm text-muted-foreground">
        {#if project.current}
          <Link href={`/projects/${project.current.id}`} class="hover:text-primary hover:underline">{project.current.name}</Link> ·
        {/if}
        <span class="font-mono">{taskKey(current, project.current)}</span>
      </p>
      <h1 class="mt-1 text-2xl font-semibold tracking-tight break-words">{current.title}</h1>
    </div>
    {#if editable || deletable}
      <div class="flex shrink-0 gap-2">
        {#if editable}
          <Button variant="outline" onclick={() => (editOpen = true)}><LucideIcon icon={Pencil} class="size-4" />Edit</Button>
        {/if}
        {#if deletable}
          <Button variant="ghost" class="text-destructive hover:bg-destructive/10" onclick={() => (deleteOpen = true)}>
            <LucideIcon icon={Trash2} class="size-4" />Delete
          </Button>
        {/if}
      </div>
    {/if}
  </header>

  <div class="grid gap-6 lg:grid-cols-[1fr_20rem]">
    <div class="min-w-0 space-y-6">
      <Card class="p-5" data-py-anchor="task-description">
        <h2 class="text-sm font-semibold">Description</h2>
        <p class="mt-2 text-sm whitespace-pre-wrap text-surface-foreground">{current.description || 'No description yet.'}</p>
      </Card>

      <section aria-labelledby="comments-heading" data-py-anchor="task-comments">
        <h2 id="comments-heading" class="sr-only">Comments</h2>
        <CommentThread
          query={comments}
          {people}
          currentUserId={me}
          now={clock.now}
          label={`Comments on ${current.title}`}
          canEdit={(comment: Comment) => can(CAPABILITIES.commentsDelete, comment)}
          onDelete={(comment: Comment) => services.comments.remove(comment.id)}
          onSend={canComment ? ({ body, parentId }) => services.comments.add(current.id, body, parentId) : () => Promise.reject(new Error('This persona can read comments but not post them.'))}
        />
      </section>
    </div>

    <aside class="space-y-6" data-py-anchor="task-details">
      <Card class="p-5">
        <dl class="grid grid-cols-[6.5rem_1fr] items-center gap-x-3 gap-y-3 text-sm">
          <dt class="text-muted-foreground">Status</dt>
          <dd>
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
          <dt class="text-muted-foreground">Assignee</dt>
          <dd class="flex min-w-0 items-center gap-2">
            {#if current.assigneeId}<Avatar name={name(current.assigneeId)} {...face(current.assigneeId)} size="xs" decorative />{/if}
            <span class="truncate">{name(current.assigneeId)}</span>
          </dd>
          <dt class="text-muted-foreground">Priority</dt>
          <dd><PriorityBadge priority={current.priority} /></dd>
          <dt class="text-muted-foreground">Due</dt>
          <dd>
            {#if current.dueDate}
              <span class="flex flex-col items-start gap-1">
                <span>{formatLongDay(current.dueDate)}</span>
                <DueBadge task={current} />
              </span>
            {:else}<span class="text-muted-foreground">No due date</span>{/if}
          </dd>
          <dt class="text-muted-foreground">Labels</dt>
          <dd class="flex flex-wrap gap-1">
            {#each current.labels as label (label)}<LabelChip {label} />{:else}<span class="text-muted-foreground">None</span>{/each}
          </dd>
          <dt class="text-muted-foreground">Reporter</dt>
          <dd class="truncate">{name(current.reporterId)}</dd>
          <dt class="text-muted-foreground">Created</dt>
          <dd>{fromNow(current.createdAt, clock.now)}</dd>
          <dt class="text-muted-foreground">Updated</dt>
          <dd>{fromNow(current.updatedAt, clock.now)}</dd>
        </dl>
      </Card>

      <section aria-labelledby="history-heading">
        <h2 id="history-heading" class="mb-3 text-sm font-semibold">History</h2>
        <ol class="space-y-3 border-l border-border pl-4">
          {#each (history.current ?? []).slice(0, 12) as item (item.id)}
            <li class="text-sm">
              <p><span class="font-medium">{name(item.actorId)}</span> <span class="text-muted-foreground">{item.body.charAt(0).toLowerCase() + item.body.slice(1)}</span></p>
              <time class="text-xs text-muted-foreground" datetime={item.at}>{fromNow(item.at, clock.now)}</time>
            </li>
          {:else}
            <li class="text-sm text-muted-foreground">No history yet.</li>
          {/each}
        </ol>
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
{/if}
