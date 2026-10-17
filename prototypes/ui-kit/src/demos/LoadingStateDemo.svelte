<script lang="ts">
import { Button, LoadingState } from '@protoyard/ui';
import { wait } from './nav.ts';

let loading = $state(true);

async function reload(): Promise<void> {
  loading = true;
  await wait(1500);
  loading = false;
}
</script>

<div class="grid gap-4">
  <div class="grid gap-4 md:grid-cols-2">
    <div class="rounded-xl border border-border bg-surface px-4">
      {#if loading}
        <LoadingState label="Loading activity…" />
      {:else}
        <ul class="grid gap-2 py-4 text-sm">
          <li>Ana closed “Billing export”.</li>
          <li>Omar commented on “Q3 roadmap”.</li>
          <li>Kai joined the workspace.</li>
        </ul>
      {/if}
    </div>
    <div class="rounded-xl border border-border bg-surface p-4">
      {#if loading}
        <LoadingState variant="skeleton" rows={4} label="Loading notes…" />
      {:else}
        <p class="text-sm text-muted-foreground">
          Notes loaded. The skeleton variant keeps the layout stable while content arrives.
        </p>
      {/if}
    </div>
  </div>
  <div class="flex gap-2">
    <Button size="sm" onclick={reload} loading={loading}>Reload (1.5 s)</Button>
    <Button size="sm" variant="outline" onclick={() => (loading = !loading)}>Toggle</Button>
  </div>
</div>
