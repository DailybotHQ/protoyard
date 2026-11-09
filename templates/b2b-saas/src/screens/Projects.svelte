<script lang="ts">
import { getRuntime, liveQuery, runService, usePrincipal } from '@protoyard/renderer-svelte';
import {
  Button,
  Card,
  CardDescription,
  CardTitle,
  EmptyState,
  FormField,
  Input,
  Notice,
  Select,
} from '@protoyard/ui';
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
  <div>
    <p class="text-sm font-medium text-primary">Workspace projects</p>
    <h1 class="mt-1 text-3xl font-semibold tracking-tight">Projects</h1>
    <p class="mt-2 text-muted-foreground">Create and update project records saved in your local prototype database.</p>
  </div>
  <Card class="p-4">
    <form class="flex flex-col gap-3 sm:flex-row sm:items-start" onsubmit={(event) => { event.preventDefault(); void createProject(); }}>
      <div class="sm:flex-1"><Input aria-label="Project name" placeholder="Project name" bind:value={name} required minlength={2} maxlength={80} /></div>
      <div class="sm:flex-1"><Input aria-label="Summary" placeholder="Short summary" bind:value={summary} maxlength={240} /></div>
      <Button disabled={busy || name.trim().length < 2} loading={busy} loadingLabel="Creating project">Create project</Button>
    </form>
  </Card>
  {#if message}<CardDescription role="status">{message}</CardDescription>{/if}
  {#if projects.error}<Notice tone="error" text={`Could not load projects: ${String(projects.error)}`} />{:else if projects.loading}<p role="status">Loading projects…</p>{:else if projects.current?.length}
    <ul class="grid gap-3 sm:grid-cols-2">
      {#each projects.current as project (project.id)}
        <li>
          <Card class="h-full p-5">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <CardTitle level={2}>{project.name}</CardTitle>
                <CardDescription class="mt-1">{project.summary || 'No summary yet.'}</CardDescription>
              </div>
              <FormField label="Status">
                {#snippet children(control)}
                  <Select {...control.props} value={project.status} items={[{ value: 'planning', label: 'Planning' }, { value: 'active', label: 'Active' }, { value: 'complete', label: 'Complete' }]} onValueChange={(value) => void updateStatus(project.id, value as 'planning' | 'active' | 'complete')} />
                {/snippet}
              </FormField>
            </div>
            <CardDescription class="mt-4">Updated {new Date(project.updatedAt).toLocaleDateString()}</CardDescription>
          </Card>
        </li>
      {/each}
    </ul>
  {:else}<EmptyState title="No projects yet" description="Create the first one above." />{/if}
</section>
