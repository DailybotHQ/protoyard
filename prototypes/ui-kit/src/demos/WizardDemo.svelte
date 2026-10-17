<script lang="ts">
import { Button, FormField, Input, RadioGroup, Switch, toast, Wizard } from '@protoyard/ui';
import { wait } from './nav.ts';

const steps = [
  { id: 'profile', label: 'Profile', description: 'Who you are' },
  { id: 'plan', label: 'Plan', description: 'Pick a plan' },
  { id: 'confirm', label: 'Confirm' },
];

let current = $state(0);
let name = $state('');
let email = $state('');
let plan = $state('');
let newsletter = $state(true);
let attempted = $state<Record<number, boolean>>({});
let finished = $state(false);

const errors = $derived({
  name: name.trim().length < 2 ? 'Enter your name (2+ characters).' : undefined,
  email: !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? 'Enter a valid email address.' : undefined,
  plan: plan ? undefined : 'Choose a plan to continue.',
});

async function validate(index: number): Promise<true | string> {
  attempted[index] = true;
  if (index === 0 && (errors.name || errors.email)) return 'Fix the highlighted fields.';
  if (index === 1 && errors.plan) return errors.plan;
  if (index === 1) await wait(500); // Simulates checking plan availability.
  return true;
}

async function finish(): Promise<void> {
  await wait(800);
  finished = true;
  toast.success('Account created', { description: `${name} · ${plan} plan` });
}

function restart(): void {
  name = '';
  email = '';
  plan = '';
  newsletter = true;
  attempted = {};
  current = 0;
  finished = false;
}
</script>

<div class="max-w-xl rounded-xl border border-border bg-surface p-5">
  {#if finished}
    <div class="grid gap-3 text-sm" role="status">
      <p class="font-heading text-lg font-semibold">Welcome aboard, {name}!</p>
      <p class="text-muted-foreground">We sent a confirmation to {email}.</p>
      <Button class="justify-self-start" variant="outline" onclick={restart}>Start over</Button>
    </div>
  {:else}
    <Wizard {steps} bind:current {validate} onFinish={finish} finishLabel="Create account">
      {#snippet content({ index })}
        {#if index === 0}
          <div class="grid gap-4">
            <FormField label="Name" required error={attempted[0] ? errors.name : undefined}>
              {#snippet children({ props })}<Input {...props} bind:value={name} autocomplete="name" />{/snippet}
            </FormField>
            <FormField label="Work email" required error={attempted[0] ? errors.email : undefined}>
              {#snippet children({ props })}
                <Input {...props} type="email" bind:value={email} placeholder="you@example.com" />
              {/snippet}
            </FormField>
          </div>
        {:else if index === 1}
          <div class="grid gap-3">
            <p id="wizard-demo-plan" class="text-sm font-medium">Plan</p>
            <RadioGroup
              aria-labelledby="wizard-demo-plan"
              bind:value={plan}
              items={[
                { value: 'Starter', label: 'Starter', description: 'Free for up to 3 people.' },
                { value: 'Team', label: 'Team', description: '$8 per person per month.' },
              ]}
            />
            {#if attempted[1] && errors.plan}
              <p class="text-xs font-medium text-destructive">{errors.plan}</p>
            {/if}
          </div>
        {:else}
          <div class="grid gap-4 text-sm">
            <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt class="text-muted-foreground">Name</dt><dd>{name}</dd>
              <dt class="text-muted-foreground">Email</dt><dd>{email}</dd>
              <dt class="text-muted-foreground">Plan</dt><dd>{plan}</dd>
            </dl>
            <Switch label="Send me product updates" bind:checked={newsletter} />
          </div>
        {/if}
      {/snippet}
      {#snippet secondaryActions()}
        <Button variant="ghost" onclick={restart}>Cancel</Button>
      {/snippet}
    </Wizard>
  {/if}
</div>
