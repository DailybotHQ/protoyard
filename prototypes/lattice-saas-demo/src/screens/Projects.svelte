<script lang="ts">
import { ArrowLeft, CircleDashed, Rocket, Trash2 } from '@lucide/svelte';
import { getRuntime, liveQuery, runService, usePrincipal } from '@protoyard/renderer-svelte';
import { Button, Input, Select } from '@protoyard/ui';
import { Icon } from 'texuli/icons';
import { LucideIcon } from 'texuli/icons/lucide';
import type { B2bSaasDatabase, Project } from '../database/schema.ts';
import { createProjectServices } from '../domain/projects.ts';

const runtime = getRuntime<B2bSaasDatabase>();
const services = createProjectServices(runtime);
// The reactive principal: a workspace switch re-runs the query and the checks.
const principal = usePrincipal(runtime);
const can = (capability: string) =>
  runtime.session.can(capability, { organizationId: principal.current?.organization?.id });
const canCreate = $derived(can('projects:create'));
const canUpdate = $derived(can('projects:update'));
const canDelete = $derived(can('projects:delete'));
const projects = liveQuery(
  () =>
    runtime.db.projects
      .where('organizationId')
      .equals(principal.current?.organization?.id ?? '')
      .toArray(),
  { initial: [], deps: () => [principal.current?.organization?.id] }
);
const projectRows = $derived(projects.current ?? []);
let name = $state('');
let summary = $state('');
let message = $state('');
let busy = $state(false);

async function createProject() {
  busy = true;
  message = '';
  const result = await runService(() => services.create({ name, summary }));
  busy = false;
  if (result.ok) {
    name = '';
    summary = '';
    message = 'Project added to this workspace.';
  } else {
    message = result.error instanceof Error ? result.error.message : 'Could not create project.';
  }
}

async function updateStatus(project: Project, status: Project['status']) {
  const result = await runService(() => services.update({ ...project, status }));
  if (!result.ok)
    message =
      result.error instanceof Error ? result.error.message : 'Could not update the project.';
}

async function removeProject(id: string) {
  const result = await runService(() => services.remove(id));
  message = result.ok
    ? 'Project removed from this workspace.'
    : result.error instanceof Error
      ? result.error.message
      : 'Could not remove the project.';
}
</script>

<section class="space-y-7" aria-labelledby="projects-title">
  <div class="flex flex-wrap items-end justify-between gap-4">
    <div>
      <a class="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" href="#/app"><LucideIcon icon={ArrowLeft} class="size-[15px]" /> Workspace overview</a>
      <p class="text-sm font-medium text-primary">Portfolio</p>
      <h1 id="projects-title" class="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Projects</h1>
      <p class="mt-2 max-w-2xl text-muted-foreground">Plan the work, make ownership visible, and move each initiative forward together.</p>
    </div>
    <span class="rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-muted-foreground">{projectRows.length} {projectRows.length === 1 ? 'project' : 'projects'}</span>
  </div>

  <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_19rem]">
    <div>
      {#if projects.error}
        <p class="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive" role="alert">Could not load projects: {String(projects.error)}</p>
      {:else if projects.loading}
        <p class="rounded-xl border border-border bg-surface p-6 text-sm text-muted-foreground" role="status">Loading project portfolio…</p>
      {:else if projectRows.length}
        <ul class="grid gap-4 lg:grid-cols-2">
          {#each projectRows as project (project.id)}
            <li class="rounded-2xl border border-border bg-surface p-5 transition-shadow hover:shadow-md">
              <div class="flex items-start justify-between gap-3">
                <span class="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><LucideIcon icon={Rocket} class="size-[19px]" /></span>
                {#if canDelete}<Button variant="ghost" class="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" type="button" aria-label={`Delete ${project.name}`} disabled={busy} onclick={() => void removeProject(project.id)}><LucideIcon icon={Trash2} class="size-[16px]" /></Button>{/if}
              </div>
              <h2 class="mt-4 text-lg font-semibold">{project.name}</h2>
              <p class="mt-1 min-h-10 text-sm leading-5 text-muted-foreground">{project.summary || 'A shared plan for the next team milestone.'}</p>
              <div class="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <label class="flex items-center gap-2 text-xs font-medium text-muted-foreground" for={`status-${project.id}`}>Status
                    <Select id={`status-${project.id}`} class="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground" value={project.status} disabled={busy || !canUpdate} items={[{ value: 'planning', label: 'Planning' }, { value: 'active', label: 'Active' }, { value: 'complete', label: 'Complete' }]} onValueChange={(value) => void updateStatus(project, value as Project['status'])} />
                </label>
                <span class="text-xs text-muted-foreground">Updated {project.updatedAt.slice(0, 10)}</span>
              </div>
            </li>
          {/each}
        </ul>
      {:else}
        <div class="rounded-2xl border border-dashed border-border bg-surface px-6 py-12 text-center"><span class="mx-auto grid size-12 place-items-center rounded-2xl bg-muted text-primary"><LucideIcon icon={CircleDashed} class="size-[22px]" /></span><h2 class="mt-4 font-semibold">Start with one clear outcome</h2><p class="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Add a project to give the team a shared place for scope, ownership, and progress.</p></div>
      {/if}
      {#if message}<p class="mt-4 text-sm text-muted-foreground" role="status">{message}</p>{/if}
    </div>

    <aside class="h-fit rounded-2xl border border-border bg-muted/40 p-5">
      <div class="flex items-center gap-2"><Icon icon="plus" size="md" class="text-primary" /><h2 class="font-semibold">Create a project</h2></div>
      <p class="mt-2 text-sm leading-6 text-muted-foreground">Keep the starting point simple. You can refine the plan as the team learns.</p>
      <form class="mt-5 grid gap-3" onsubmit={(event) => { event.preventDefault(); void createProject(); }}>
        <label class="grid gap-1.5 text-sm font-medium" for="project-name">Project name
          <Input id="project-name" aria-label="Project name" placeholder="e.g. Customer portal" bind:value={name} required minlength={2} maxlength={80} disabled={!canCreate || busy} />
        </label>
        <label class="grid gap-1.5 text-sm font-medium" for="project-summary">Outcome or summary
          <Input id="project-summary" aria-label="Summary" placeholder="What will be different when this ships?" bind:value={summary} maxlength={240} disabled={!canCreate || busy} />
        </label>
        <Button disabled={!canCreate || busy || name.trim().length < 2} loading={busy} loadingLabel="Creating project"><Icon icon="plus" size="sm" /> Add project</Button>
      </form>
      {#if !canCreate}<p class="mt-3 text-xs leading-5 text-muted-foreground">Your simulated viewer role can review this portfolio but cannot change projects.</p>{/if}
      <p class="mt-4 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">Changes are saved to the simulated workspace database in this browser.</p>
    </aside>
  </div>
</section>
