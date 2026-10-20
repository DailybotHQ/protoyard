<script lang="ts">
import { liveQuery, usePrincipal } from '@protoyard/renderer-svelte';
import type { TaskChange } from '@protoyard/views/timeline';
import { TimelineView } from '@protoyard/views-ui/timeline';
import PageHeader from '../components/PageHeader.svelte';
import { useWorkspace } from '../lib/context.svelte.ts';

const workspace = useWorkspace();
const principal = usePrincipal();
const source = liveQuery(() => workspace.db.tasks.orderBy('startDate').toArray(), { initial: [] });
const query = $derived({
  ...source,
  current: (source.current ?? []).map((task) => ({
    ...task,
    start: task.startDate,
    end: task.endDate,
    progress:
      task.status === 'done'
        ? 100
        : task.status === 'review'
          ? 80
          : task.status === 'in-progress'
            ? 45
            : 10,
  })),
});
/** Finish-to-start links: the timeline draws them, shifts successors and marks the critical path. */
const links = liveQuery(() => workspace.db.dependencies.toArray(), { initial: [] });
const dependencies = $derived(
  (links.current ?? []).map((link) => ({ from: link.fromId, to: link.toId, type: link.type }))
);
const canEdit = $derived(Boolean(principal.current && principal.current.role !== 'viewer'));
</script>

<PageHeader title="Project timeline" description="Move or resize a task to reschedule it. Linked tasks shift together, and the critical path is highlighted." />
<div data-py-anchor="timeline">
<TimelineView
  {query}
  {dependencies}
  label="Project schedule"
  runtime={workspace.runtime}
  getTitle={(task) => task.title}
  getProgress={(task) => task.progress}
  onReschedule={canEdit
    ? (changes) => workspace.services.tasks.reschedule(
        changes.filter((change): change is TaskChange & { start: string; end: string } => Boolean(change.start && change.end))
      )
    : undefined}
  onOpen={(task) => { window.location.hash = `#/tasks/${task.id}`; }}
/>
</div>
