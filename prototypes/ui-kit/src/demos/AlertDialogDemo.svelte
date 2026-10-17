<script lang="ts">
import { AlertDialog, Button, toast } from '@protoyard/ui';
import { wait } from './nav.ts';

const initial = ['Marketing site', 'Mobile app', 'Billing service'];
let projects = $state([...initial]);
let attempts = $state(0);

async function remove(name: string): Promise<void> {
  await wait(900);
  projects = projects.filter((project) => project !== name);
  toast.success('Project deleted', { description: name });
}

async function archive(): Promise<void> {
  attempts += 1;
  await wait(700);
  // The first attempt fails on purpose to show the inline error state.
  if (attempts % 2 === 1) throw new Error('The archive service timed out. Try again.');
  toast.success('Workspace archived');
}
</script>

<div class="grid gap-5">
  <ul class="grid max-w-md gap-2">
    {#each projects as project (project)}
      <li class="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
        <span class="truncate">{project}</span>
        <AlertDialog
          title={`Delete “${project}”?`}
          description="This permanently removes the project and its 42 tasks. This cannot be undone."
          confirmLabel="Delete project"
          destructive
          onConfirm={() => remove(project)}
        >
          {#snippet trigger({ props })}
            <Button {...props} size="sm" variant="ghost">Delete</Button>
          {/snippet}
        </AlertDialog>
      </li>
    {:else}
      <li class="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        All projects deleted.
        <Button size="sm" variant="outline" onclick={() => (projects = [...initial])}>Restore</Button>
      </li>
    {/each}
  </ul>

  <div class="flex flex-wrap items-center gap-3">
    <AlertDialog
      title="Archive workspace?"
      description="Members lose access until an owner restores it."
      confirmLabel="Archive"
      onConfirm={archive}
    >
      {#snippet trigger({ props })}
        <Button {...props} variant="outline">Archive (fails first)</Button>
      {/snippet}
    </AlertDialog>
    <p class="text-xs text-muted-foreground">Odd attempts fail to show the retry state.</p>
  </div>
</div>
