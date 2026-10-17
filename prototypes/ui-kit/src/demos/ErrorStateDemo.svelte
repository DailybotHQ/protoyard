<script lang="ts">
import { Button, ErrorState, toast } from '@protoyard/ui';
import { wait } from './nav.ts';

let failed = $state(true);
let attempts = $state(0);

async function retry(): Promise<void> {
  attempts += 1;
  await wait(900);
  // Every other retry still fails, so both outcomes are visible.
  if (attempts % 2 === 0) failed = false;
}
</script>

<div class="max-w-md rounded-xl border border-border bg-surface">
  {#if failed}
    <ErrorState
      title="Couldn’t load invoices"
      message={attempts % 2 === 1
        ? 'Still failing (HTTP 503). Retry once more.'
        : 'The billing service did not respond (HTTP 503).'}
      onRetry={retry}
    >
      {#snippet action()}
        <Button
          variant="ghost"
          onclick={() =>
            toast.info('Support notified', { description: 'Ticket #5521 opened (demo).' })}
        >
          Contact support
        </Button>
      {/snippet}
    </ErrorState>
  {:else}
    <div class="grid gap-3 p-5 text-sm">
      <p class="font-medium">3 invoices loaded</p>
      <ul class="grid gap-1 text-muted-foreground">
        <li>INV-2041 · $120.00</li>
        <li>INV-2042 · $480.00</li>
        <li>INV-2043 · $75.00</li>
      </ul>
      <Button
        size="sm"
        variant="outline"
        class="justify-self-start"
        onclick={() => {
          failed = true;
          attempts = 0;
        }}
      >
        Break it again
      </Button>
    </div>
  {/if}
</div>
