<script lang="ts">
import { MessageSquare } from '@lucide/svelte';
import { avatarImage, Link } from '@protoyard/renderer-svelte';
import { Avatar } from '@protoyard/ui';
import type { Project, Task } from '../database/schema.ts';
import { taskKey } from '../domain/tasks.ts';
import { useWorkspace } from '../lib/context.svelte.ts';
import DueBadge from './DueBadge.svelte';
import LabelChip from './LabelChip.svelte';
import PriorityBadge from './PriorityBadge.svelte';

/** Compact task summary used on the board. The title links to the task page. */
let {
  task,
  project,
  comments = 0,
}: { task: Task; project?: Project; comments?: number } = $props();

const workspace = useWorkspace();
const assignee = $derived(task.assigneeId ? workspace.peopleById.get(task.assigneeId) : undefined);
</script>

<div class="flex items-center gap-2 text-[0.7rem] text-muted-foreground">
  <span class="font-mono">{taskKey(task, project)}</span>
  <PriorityBadge priority={task.priority} compact />
</div>
<Link
  href={`/tasks/${task.id}`}
  class="mt-1 block text-sm leading-snug font-medium break-words text-foreground hover:text-primary focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
>
  {task.title}
</Link>
{#if task.labels.length > 0}
  <div class="mt-2 flex flex-wrap gap-1">
    {#each task.labels as label (label)}<LabelChip {label} />{/each}
  </div>
{/if}
<div class="mt-2.5 flex items-center gap-2">
  <DueBadge {task} />
  {#if comments > 0}
    <span class="inline-flex items-center gap-1 text-[0.7rem] text-muted-foreground" title={`${comments} comments`}>
      <MessageSquare class="size-3" aria-hidden="true" />{comments}<span class="sr-only"> comments</span>
    </span>
  {/if}
  <span class="ml-auto">
    {#if assignee}
      <Avatar name={assignee.name} {...avatarImage(assignee.avatar)} size="xs" title={`Assigned to ${assignee.name}`} aria-label={`Assigned to ${assignee.name}`} />
    {:else}
      <span class="text-[0.7rem] text-muted-foreground">Unassigned</span>
    {/if}
  </span>
</div>
