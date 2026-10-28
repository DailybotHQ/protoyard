<script lang="ts">
import {
  Card,
  CardDescription,
  CardGrid,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
} from '@protoyard/ui';

const templates = [
  { name: 'CRM', description: 'Leads, deals and a pipeline board.' },
  { name: 'Help desk', description: 'Tickets, SLAs and canned replies.' },
  { name: 'Team chat', description: 'Channels, threads and presence.' },
  { name: 'Inventory', description: 'Stock levels and purchase orders.' },
  { name: 'Booking', description: 'Calendars, slots and reminders.' },
  { name: 'Analytics', description: 'Dashboards and saved reports.' },
];

let minWidth = $state(14);
let gap = $state<'sm' | 'md' | 'lg'>('md');
</script>

<div class="grid gap-4">
  <div class="flex flex-wrap items-end gap-6">
    <div class="grid gap-1.5">
      <Label for="card-grid-demo-width">Min card width: {minWidth}rem</Label>
      <Input id="card-grid-demo-width" type="range" min="8" max="24" step="1" bind:value={minWidth} class="w-48 accent-primary" />
    </div>
    <div class="grid gap-1.5">
      <Label for="card-grid-demo-gap">Gap</Label>
      <Select
        id="card-grid-demo-gap"
        bind:value={gap}
        class="h-9 rounded-md border border-input bg-surface px-2 text-sm"
        items={[{ value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }]}
      />
    </div>
  </div>
  <CardGrid as="ul" minItemWidth={`${minWidth}rem`} {gap} aria-label="Templates">
    {#each templates as template (template.name)}
      <li>
        <Card class="h-full">
          <CardHeader>
            <CardTitle>{template.name}</CardTitle>
            <CardDescription>{template.description}</CardDescription>
          </CardHeader>
        </Card>
      </li>
    {/each}
  </CardGrid>
</div>
