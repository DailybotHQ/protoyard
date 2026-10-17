<script lang="ts">
import { FolderPlus, SearchX } from '@lucide/svelte';
import { Button, EmptyState } from '@protoyard/ui';

const names = ['Website refresh', 'Customer portal', 'Data warehouse', 'Hiring plan'];
let projects = $state<string[]>([]);
</script>

<div class="grid gap-6 md:grid-cols-2">
  <div class="rounded-xl border border-border bg-surface">
    {#if projects.length === 0}
      <EmptyState
        icon={FolderPlus}
        title="No projects yet"
        description="Projects group tasks, files and people. Create one to get started."
      >
        {#snippet action()}
          <Button onclick={() => (projects = [names[0] ?? 'Project'])}>Create project</Button>
        {/snippet}
      </EmptyState>
    {:else}
      <ul class="divide-y divide-border text-sm">
        {#each projects as project (project)}
          <li class="px-4 py-3">{project}</li>
        {/each}
      </ul>
      <div class="flex gap-2 border-t border-border p-3">
        <Button
          size="sm"
          variant="outline"
          disabled={projects.length >= names.length}
          onclick={() => (projects = names.slice(0, projects.length + 1))}
        >
          Add another
        </Button>
        <Button size="sm" variant="ghost" onclick={() => (projects = [])}>Clear all</Button>
      </div>
    {/if}
  </div>
  <div class="rounded-xl border border-border bg-surface">
    <EmptyState
      size="sm"
      icon={SearchX}
      title="No matches"
      description="Try a different keyword or remove filters."
    />
  </div>
</div>
