<script lang="ts">
import { FileText } from '@lucide/svelte';
import { Button, Composer } from '@protoyard/ui';
import { LucideIcon } from 'texuli/icons/lucide';
import { wait } from './nav.ts';

let value = $state('');
let sent = $state<string[]>([]);
let rejected = $state(false);

async function submit(text: string): Promise<boolean> {
  // Returning false keeps the draft, e.g. when validation fails.
  if (/^\s*todo\b/i.test(text)) {
    rejected = true;
    return false;
  }
  rejected = false;
  await wait(600);
  sent = [...sent, text];
  return true;
}
</script>

<div class="grid max-w-lg gap-4">
  <Composer bind:value onSubmit={submit} maxLength={500} placeholder="Write an update…">
    {#snippet actions()}
      <Button
        type="button"
        class="inline-flex size-9 min-h-touch min-w-[44px] shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:min-h-0 sm:min-w-0"
        aria-label="Insert stand-up template"
        onclick={() => (value = `Yesterday: \nToday: \nBlockers: none`)}
      >
        <LucideIcon icon={FileText} class="size-4" />
      </Button>
    {/snippet}
  </Composer>
  {#if rejected}
    <p class="text-xs font-medium text-destructive" role="alert">
      Messages starting with “TODO” are rejected; the draft was kept.
    </p>
  {/if}
  <div class="grid gap-1">
    <p class="text-xs text-muted-foreground">Sent ({sent.length})</p>
    <ul class="grid gap-1 text-sm">
      {#each sent as message, index (index)}
        <li class="rounded-md bg-muted px-3 py-1.5 whitespace-pre-wrap">{message}</li>
      {:else}
        <li class="text-muted-foreground">Nothing sent yet.</li>
      {/each}
    </ul>
  </div>
  <div class="grid gap-1">
    <p class="text-xs text-muted-foreground">Disabled</p>
    <Composer value="" onSubmit={() => undefined} disabled placeholder="You can’t post in this channel" />
  </div>
</div>
