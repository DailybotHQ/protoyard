<script lang="ts">
import { Avatar, Button, Skeleton } from '@protoyard/ui';
import { wait } from './nav.ts';

let loading = $state(true);

async function reload(): Promise<void> {
  loading = true;
  await wait(1500);
  loading = false;
}
</script>

<div class="grid max-w-md gap-4">
  <div
    class="rounded-xl border border-border bg-surface p-4"
    aria-busy={loading}
    aria-live="polite"
  >
    {#if loading}
      <span class="sr-only">Loading profile…</span>
      <div class="flex items-center gap-3">
        <Skeleton class="size-12 rounded-full" />
        <div class="grid flex-1 gap-2">
          <Skeleton class="h-4 w-1/2" />
          <Skeleton class="h-3 w-1/3" />
        </div>
      </div>
      <div class="mt-4 grid gap-2">
        <Skeleton class="h-3 w-full" />
        <Skeleton class="h-3 w-5/6" />
      </div>
    {:else}
      <div class="flex items-center gap-3">
        <Avatar name="Rosa Example" size="lg" decorative />
        <div class="grid">
          <p class="font-medium">Rosa Example</p>
          <p class="text-xs text-muted-foreground">Head of Support · rosa@example.com</p>
        </div>
      </div>
      <p class="mt-4 text-sm text-muted-foreground">
        Leads a team of eight across three time zones. Answers most tickets before lunch.
      </p>
    {/if}
  </div>
  <div class="flex gap-2">
    <Button size="sm" onclick={reload} loading={loading}>Reload (1.5 s)</Button>
    <Button size="sm" variant="outline" onclick={() => (loading = !loading)}>Toggle</Button>
  </div>
  <p class="text-xs text-muted-foreground">Skeletons are aria-hidden; announce loading separately.</p>
</div>
