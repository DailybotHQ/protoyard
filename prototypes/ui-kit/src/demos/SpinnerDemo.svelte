<script lang="ts">
import { Button, Spinner } from '@protoyard/ui';
import { wait } from './nav.ts';

let refreshing = $state(false);
let refreshedAt = $state(0);

async function refresh(): Promise<void> {
  refreshing = true;
  await wait(1000);
  refreshing = false;
  refreshedAt += 1;
}
</script>

<div class="grid gap-5">
  <div class="flex flex-wrap items-center gap-5 text-muted-foreground">
    <Spinner class="size-3" />
    <Spinner />
    <Spinner class="size-6" />
    <Spinner class="size-8 text-primary" label="Loading dashboard" />
  </div>
  <div class="flex flex-wrap items-center gap-3">
    <Button variant="outline" onclick={refresh} disabled={refreshing}>
      {#if refreshing}<Spinner label="Refreshing" />{/if}
      Refresh
    </Button>
    <span class="text-xs text-muted-foreground" aria-live="polite">
      {refreshing ? 'Refreshing…' : `Refreshed ${refreshedAt} time${refreshedAt === 1 ? '' : 's'}`}
    </span>
  </div>
  <p class="text-xs text-muted-foreground">
    Decorative by default; pass <code>label</code> to announce it (role="status"). Animation stops
    with reduced motion.
  </p>
</div>
