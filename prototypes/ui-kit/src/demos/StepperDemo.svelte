<script lang="ts">
import { Button, Stepper, type StepperStep } from '@protoyard/ui';

const steps: StepperStep[] = [
  { id: 'cart', label: 'Cart', description: '3 items' },
  { id: 'shipping', label: 'Shipping', description: 'Address and speed' },
  { id: 'payment', label: 'Payment', description: 'Card or invoice' },
  { id: 'review', label: 'Review' },
];
let current = $state(1);
let onboarding = $state(2);
</script>

<div class="grid gap-8">
  <div class="grid gap-4">
    <p class="text-xs text-muted-foreground">Horizontal; completed steps are clickable</p>
    <Stepper {steps} {current} onStepClick={(index) => (current = index)} label="Checkout progress" />
    <div class="flex gap-2">
      <Button size="sm" variant="outline" disabled={current === 0} onclick={() => (current -= 1)}>Back</Button>
      <Button size="sm" disabled={current >= steps.length - 1} onclick={() => (current += 1)}>Next</Button>
      <span class="self-center text-xs text-muted-foreground" aria-live="polite">
        Step {current + 1} of {steps.length}: {steps[current]?.label}
      </span>
    </div>
  </div>
  <div class="grid gap-4">
    <p class="text-xs text-muted-foreground">Vertical</p>
    <Stepper
      orientation="vertical"
      current={onboarding}
      label="Onboarding progress"
      steps={[
        { id: 'account', label: 'Create account', description: 'Done in under a minute' },
        { id: 'invite', label: 'Invite teammates', description: '2 invitations sent' },
        { id: 'connect', label: 'Connect calendar', description: 'Google or Outlook' },
        { id: 'first', label: 'Create your first project' },
      ]}
    />
    <div class="flex gap-2">
      <Button size="sm" variant="outline" onclick={() => (onboarding = Math.max(0, onboarding - 1))}>
        Previous
      </Button>
      <Button size="sm" onclick={() => (onboarding = Math.min(3, onboarding + 1))}>Complete step</Button>
    </div>
  </div>
</div>
