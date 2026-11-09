<script lang="ts">
import {
  AlarmClock,
  CalendarRange,
  CircleCheckBig,
  EllipsisVertical,
  FolderKanban,
  ListTodo,
} from '@lucide/svelte';
import {
  can,
  Link,
  liveQuery,
  runService,
  useClock,
  usePrincipal,
} from '@protoyard/renderer-svelte';
import {
  AlertDialog,
  Avatar,
  Button,
  Card,
  DropdownMenu,
  EmptyState,
  ErrorState,
  Progress,
  Skeleton,
  StatCard,
} from '@protoyard/ui';
import { Icon } from 'texuli/icons';
import { LucideIcon } from 'texuli/icons/lucide';
import { Heading, Text } from 'texuli/typography';
import PageHeader from '../components/PageHeader.svelte';
import ProjectDialog from '../components/ProjectDialog.svelte';
import type { Project } from '../database/schema.ts';
import { CAPABILITIES } from '../domain/policy.ts';
import { dueState, PROJECT_COLOR_TONES } from '../domain/tasks.ts';
import { useWorkspace } from '../lib/context.svelte.ts';
import { formatLongDay } from '../lib/format.ts';

const { db, services } = useWorkspace();
const clock = useClock();
const principal = usePrincipal();

const projects = liveQuery(() => db.projects.orderBy('createdAt').toArray(), { initial: [] });
const tasks = liveQuery(() => db.tasks.toArray(), { initial: [] });

let editorOpen = $state(false);
let editing = $state<Project | null>(null);
let deleting = $state<Project | null>(null);
let confirmOpen = $state(false);

const canManage = $derived(can(CAPABILITIES.projectsManage));
const firstName = $derived(principal.current?.persona.name.split(' ')[0] ?? 'there');

const stats = $derived.by(() => {
  const now = clock.now;
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  let open = 0;
  let overdue = 0;
  let thisWeek = 0;
  let completed = 0;
  for (const task of tasks.current ?? []) {
    const due = dueState(task, now);
    if (task.status !== 'done') open++;
    if (due === 'overdue') overdue++;
    if (due === 'today' || due === 'soon') thisWeek++;
    if (task.completedAt && task.completedAt >= weekAgo) completed++;
  }
  return { open, overdue, thisWeek, completed };
});

const summaries = $derived(
  (projects.current ?? []).map((project) => {
    const items = (tasks.current ?? []).filter((t) => t.projectId === project.id);
    const done = items.filter((t) => t.status === 'done').length;
    return {
      project,
      total: items.length,
      done,
      inProgress: items.filter((t) => t.status === 'in-progress' || t.status === 'review').length,
      overdue: items.filter((t) => dueState(t, clock.now) === 'overdue').length,
    };
  })
);

function openEditor(project: Project | null) {
  editing = project;
  editorOpen = true;
}

async function removeProject() {
  const project = deleting;
  if (!project) return;
  const result = await runService(() => services.projects.remove(project.id), {
    success: `Deleted ${project.name}`,
  });
  if (!result.ok) throw new Error('The project was not deleted.');
}
</script>

<PageHeader title={`Hi ${firstName}`} description={`${formatLongDay(clock.now.toISOString().slice(0, 10))} · here is where your team stands.`}>
  {#snippet actions()}
    {#if canManage}
      <Button onclick={() => openEditor(null)}><Icon icon="plus" class="size-4" aria-hidden="true" />New project</Button>
    {/if}
  {/snippet}
</PageHeader>

<section aria-label="Summary" class="grid grid-cols-2 gap-3 lg:grid-cols-4">
  <StatCard label="Open tasks" value={stats.open} icon={ListTodo} />
  <StatCard label="Overdue" value={stats.overdue} icon={AlarmClock} hint={stats.overdue > 0 ? 'Past their due date' : 'Nothing late'} />
  <StatCard label="Due this week" value={stats.thisWeek} icon={CalendarRange} />
  <StatCard label="Done in 7 days" value={stats.completed} icon={CircleCheckBig} />
</section>

<Heading level={2} size="md" class="mt-8 mb-3">Projects</Heading>

{#if projects.loading}
  <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading projects">
    {#each [0, 1, 2] as i (i)}<Skeleton class="h-44 w-full" />{/each}
  </div>
{:else if projects.error}
  <ErrorState title="Could not load projects" message={String(projects.error)} />
{:else if summaries.length === 0}
  <EmptyState
    icon={FolderKanban}
    title="No projects yet"
    description={canManage
      ? 'Create a project to get a board with To do, In progress, Review and Done columns.'
      : 'An owner or admin has to create the first project. You will see it here.'}
  >
    {#snippet action()}
      {#if canManage}
        <Button onclick={() => openEditor(null)}><Icon icon="plus" class="size-4" aria-hidden="true" />Create a project</Button>
      {/if}
    {/snippet}
  </EmptyState>
{:else}
  <ul class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
    {#each summaries as { project, total, done, inProgress, overdue } (project.id)}
      <li>
        <Card class="relative flex h-full flex-col gap-4 p-5">
          <div class="flex items-start gap-3">
            <Avatar name={project.name} tone={PROJECT_COLOR_TONES[project.color]} shape="square" size="xs" class="shrink-0" decorative />
            <div class="min-w-0 flex-1">
              <Heading level={3} size="sm">
                <Link href={`/projects/${project.id}`} class="after:absolute after:inset-0">
                  {project.name}
                </Link>
              </Heading>
              <Text size="xs" tone="muted" mono>{project.key}</Text>
            </div>
            {#if canManage}
              <DropdownMenu
                align="end"
                items={[
                  { label: 'Edit project', onSelect: () => openEditor(project) },
                  {
                    label: 'Delete project',
                    destructive: true,
                    onSelect: () => {
                      deleting = project;
                      confirmOpen = true;
                    },
                  },
                ]}
              >
                {#snippet trigger({ props })}
                  <Button {...props} variant="ghost" size="icon" class="relative z-10 -mt-1 -mr-2" aria-label={`Actions for ${project.name}`}>
                    <LucideIcon icon={EllipsisVertical} class="size-4" />
                  </Button>
                {/snippet}
              </DropdownMenu>
            {/if}
          </div>
          {#if project.description}
            <Text size="sm" tone="muted" lineClamp={2}>{project.description}</Text>
          {/if}
          <div class="mt-auto space-y-2">
            <Progress value={done} max={Math.max(1, total)} ariaLabel={`${project.name}: ${done} of ${total} tasks done`} tone="success" size="sm" />
            <Text size="xs" tone="muted" class="flex flex-wrap gap-x-3 gap-y-1">
              <span>{done}/{total} done</span>
              <span>{inProgress} in flight</span>
              {#if overdue > 0}<Text as="span" size="xs" tone="destructive" weight="medium">{overdue} overdue</Text>{/if}
            </Text>
          </div>
        </Card>
      </li>
    {/each}
  </ul>
{/if}

<ProjectDialog bind:open={editorOpen} project={editing} />
<AlertDialog
  bind:open={confirmOpen}
  destructive
  title={`Delete ${deleting?.name ?? 'project'}?`}
  description="Its board, tasks, comments and history are removed from this prototype's data. Restore a snapshot in DevTools to get them back."
  confirmLabel="Delete project"
  onConfirm={removeProject}
/>
