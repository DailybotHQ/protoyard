<script lang="ts">
import { runService } from '@protoyard/renderer-svelte';
import { Button, Dialog, FormField, Select } from '@protoyard/ui';
import type { Deal } from '../database/schema.ts';
import { useCrm } from '../lib/context.ts';

/** Marking a deal lost asks why — the reason is stored and shown on the deal. */
let { deal = $bindable(null) }: { deal?: Deal | null } = $props();

const { services } = useCrm();
const REASONS = ['Budget', 'Chose a competitor', 'No decision', 'Timing', 'Missing feature'];
let reason = $state('Budget');
let saving = $state(false);
let open = $state(false);

$effect(() => {
  open = deal !== null;
});

async function confirm() {
  if (!deal) return;
  saving = true;
  const target = deal;
  const result = await runService(() => services.deals.moveStage(target.id, 'lost', reason), {
    success: 'Marked as lost',
  });
  saving = false;
  if (result.ok) deal = null;
}
</script>

<Dialog
  bind:open
  title="Mark deal as lost"
  description={deal ? `Why did “${deal.title}” fall through?` : ''}
  size="sm"
  onOpenChange={(value) => {
    if (!value) deal = null;
  }}
>
  <FormField label="Reason">
    {#snippet children(control)}
      <Select {...control.props} items={REASONS.map((r) => ({ value: r, label: r }))} bind:value={reason} />
    {/snippet}
  </FormField>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (deal = null)}>Cancel</Button>
    <Button variant="destructive" loading={saving} onclick={confirm}>Mark lost</Button>
  {/snippet}
</Dialog>
