<script lang="ts">
import { Button, Label, Select, type SelectOption } from '@protoyard/ui';

const stages: SelectOption[] = [
  { value: 'lead', label: 'Lead' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost', disabled: true },
];

let stage = $state('qualified');
let owner = $state('');
</script>

<div class="grid max-w-xs gap-5">
  <div class="grid gap-1.5">
    <Label for="select-demo-stage">Stage</Label>
    <Select id="select-demo-stage" items={stages} bind:value={stage} />
    <p class="text-xs text-muted-foreground" aria-live="polite">Value: {stage || 'none'}</p>
  </div>

  <div class="grid gap-1.5">
    <Label for="select-demo-owner">Owner (placeholder)</Label>
    <Select
      id="select-demo-owner"
      placeholder="Unassigned"
      bind:value={owner}
      items={[
        { value: 'ana', label: 'Ana Lee' },
        { value: 'omar', label: 'Omar Diaz' },
        { value: 'kai', label: 'Kai Moreno' },
      ]}
    />
    <Button
      type="button"
      variant="link"
      class="justify-self-start text-xs font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      onclick={() => (owner = '')}
      disabled={!owner}
    >
      Clear owner
    </Button>
  </div>

  <div class="grid gap-1.5">
    <Label for="select-demo-disabled">Region (disabled)</Label>
    <Select id="select-demo-disabled" disabled value="eu" items={[{ value: 'eu', label: 'Europe' }]} />
  </div>
</div>
