<script lang="ts">
import type { StepperStep } from '@protoyard/ui';
import { Badge, Card, Wizard } from '@protoyard/ui';
import PageHeader from '../components/PageHeader.svelte';

const steps: StepperStep[] = [
  { id: 'workspace', label: 'Workspace' },
  { id: 'operations', label: 'Operations' },
  { id: 'ready', label: 'Ready' },
];
let current = $state(0);
let finished = $state(false);
</script>

<PageHeader title="Workspace tour" description="A guided introduction framed by the wizard layout." />

<Card class="mx-auto max-w-3xl p-5 sm:p-8">
  {#if finished}
    <Badge variant="outline">Tour complete</Badge>
    <h2 class="mt-4 text-xl font-semibold">You're ready to explore Atlas</h2>
    <p class="mt-2 text-sm leading-6 text-muted-foreground">This local tour is complete. Continue to the overview or compare the layout gallery.</p>
    <div class="mt-5 flex gap-3"><a class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" href="#/">Open overview</a><a class="rounded-md border border-border px-4 py-2 text-sm font-medium" href="#/layouts">Compare layouts</a></div>
  {:else}
    <Wizard bind:current {steps} onFinish={() => { finished = true; }} finishLabel="Finish tour">
      {#snippet content({ index })}
        {#if index === 0}
          <h2 class="text-lg font-semibold">Your workspace is local</h2>
          <p class="mt-2 text-sm leading-6 text-muted-foreground">Atlas keeps this fictional workspace in browser storage. It uses no network service.</p>
        {:else if index === 1}
          <h2 class="text-lg font-semibold">Review operations</h2>
          <p class="mt-2 text-sm leading-6 text-muted-foreground">Use the overview, customer directory and orders page to inspect seeded operational data.</p>
        {:else}
          <h2 class="text-lg font-semibold">Choose your view</h2>
          <p class="mt-2 text-sm leading-6 text-muted-foreground">Switch scenarios and layouts from the gallery or DevTools whenever you want to explore another state.</p>
        {/if}
      {/snippet}
    </Wizard>
  {/if}
</Card>
