<script lang="ts">
import { Label, RadioGroup, RadioGroupItem, type RadioOption } from '@protoyard/ui';

const plans: RadioOption[] = [
  { value: 'starter', label: 'Starter', description: 'Up to 3 projects, community support.' },
  { value: 'team', label: 'Team', description: 'Unlimited projects and shared workspaces.' },
  { value: 'enterprise', label: 'Enterprise', description: 'Contact sales.', disabled: true },
];

let plan = $state('team');
let density = $state('comfortable');
let cardPlan = $state('team');
</script>

<div class="grid max-w-md gap-6">
  <div class="grid gap-2">
    <p id="radio-demo-plan" class="text-sm font-medium">Plan</p>
    <RadioGroup aria-labelledby="radio-demo-plan" items={plans} bind:value={plan} />
    <p class="text-xs text-muted-foreground" aria-live="polite">Selected: {plan}</p>
  </div>

  <div class="grid gap-2">
    <p id="radio-demo-card" class="text-sm font-medium">Plan (card variant)</p>
    <RadioGroup
      aria-labelledby="radio-demo-card"
      variant="card"
      items={plans}
      bind:value={cardPlan}
    />
    <p class="text-xs text-muted-foreground" aria-live="polite">Selected: {cardPlan}</p>
  </div>

  <div class="grid gap-2">
    <p id="radio-demo-density" class="text-sm font-medium">Density (horizontal, custom items)</p>
    <RadioGroup aria-labelledby="radio-demo-density" orientation="horizontal" bind:value={density}>
      {#each ['compact', 'comfortable', 'spacious'] as option (option)}
        <div class="flex items-center gap-2">
          <RadioGroupItem id={`radio-demo-${option}`} value={option} />
          <Label for={`radio-demo-${option}`} class="capitalize">{option}</Label>
        </div>
      {/each}
    </RadioGroup>
    <p class="text-xs text-muted-foreground">Arrow keys move between options.</p>
  </div>
</div>
