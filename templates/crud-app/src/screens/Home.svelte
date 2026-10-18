<script lang="ts">
import { liveQuery } from '@protoyard/renderer-svelte';
import { Card } from '@protoyard/ui';
import { useCrudApp } from '../lib/context.ts';

const { services, blueprint } = useCrudApp();

const projectCount = liveQuery(async () => (await services.project!.list()).length, {
  initial: 0,
});
const taskCount = liveQuery(async () => (await services.task!.list()).length, {
  initial: 0,
});
</script>

<div class="space-y-6">
  <div>
    <h1 class="text-2xl font-semibold">{blueprint.name}</h1>
    <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
      Blueprint-driven starter used as the base for <code class="text-xs">protoyard generate</code>.
      Two entities, real services, AppShell navigation, notifications and search.
    </p>
  </div>
  <div class="grid gap-4 sm:grid-cols-2">
    <Card class="p-4">
      <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Projects</p>
      <p class="mt-2 text-3xl font-semibold">{projectCount.current ?? 0}</p>
      <a class="mt-3 inline-block text-sm text-primary hover:underline" href="#/projects">Open list</a>
    </Card>
    <Card class="p-4">
      <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tasks</p>
      <p class="mt-2 text-3xl font-semibold">{taskCount.current ?? 0}</p>
      <a class="mt-3 inline-block text-sm text-primary hover:underline" href="#/tasks">Open list</a>
    </Card>
  </div>
</div>
