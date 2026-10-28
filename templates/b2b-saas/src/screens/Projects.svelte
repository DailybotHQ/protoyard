<script lang="ts">
import { getRuntime, liveQuery, runService, usePrincipal } from '@protoyard/renderer-svelte';
import { Button, Input, Select } from '@protoyard/ui';
import type { B2bSaasDatabase } from '../database/schema.ts';
import { createProjectServices } from '../domain/projects.ts';

const runtime = getRuntime<B2bSaasDatabase>();
const services = createProjectServices(runtime);
// The reactive principal: a workspace switch re-runs the query.
const principal = usePrincipal(runtime);
const projects = liveQuery(
  () =>
    runtime.db.projects
      .where('organizationId')
      .equals(principal.current?.organization?.id ?? '')
      .toArray(),
  { initial: [], deps: () => [principal.current?.organization?.id] }
);
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
    message = 'Project created in this browser.';
  } else
    message = result.error instanceof Error ? result.error.message : 'Could not create project.';
}

async function updateStatus(id: string, status: 'planning' | 'active' | 'complete') {
  const project = projects.current?.find((row) => row.id === id);
  if (project) await runService(() => services.update({ ...project, status }));
}
</script>

<section class="space-y-6">
  <div><p class="text-sm font-medium text-primary">Workspace projects</p><h1 class="mt-1 text-3xl font-semibold tracking-tight">Projects</h1><p class="mt-2 text-muted-foreground">Create and update project records saved in your local prototype database.</p></div>
  <form class="grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-[1fr_1.4fr_auto]" onsubmit={(event) => { event.preventDefault(); void createProject(); }}>
    <Input aria-label="Project name" placeholder="Project name" bind:value={name} required minlength={2} maxlength={80} />
    <Input aria-label="Summary" placeholder="Short summary" bind:value={summary} maxlength={240} />
    <Button disabled={busy || name.trim().length < 2} loading={busy} loadingLabel="Creating project">Create project</Button>
  </form>
  {#if message}<p role="status" class="text-sm text-muted-foreground">{message}</p>{/if}
  {#if projects.error}<p role="alert" class="text-sm text-destructive">Could not load projects: {String(projects.error)}</p>{:else if projects.loading}<p role="status">Loading projects…</p>{:else if projects.current?.length}
    <ul class="grid gap-3 sm:grid-cols-2">{#each projects.current as project (project.id)}<li class="rounded-xl border border-border bg-surface p-5"><div class="flex items-start justify-between gap-3"><div><h2 class="font-semibold">{project.name}</h2><p class="mt-1 text-sm text-muted-foreground">{project.summary || 'No summary yet.'}</p></div><label class="text-xs text-muted-foreground">Status<Select class="mt-1 block" value={project.status} items={[{ value: 'planning', label: 'Planning' }, { value: 'active', label: 'Active' }, { value: 'complete', label: 'Complete' }]} onValueChange={(value) => void updateStatus(project.id, value as 'planning' | 'active' | 'complete')} /></label></div><p class="mt-4 text-xs text-muted-foreground">Updated {new Date(project.updatedAt).toLocaleDateString()}</p></li>{/each}</ul>
  {:else}<p class="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">No projects yet. Create the first one above.</p>{/if}
</section>
