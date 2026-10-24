<script lang="ts">
import { Wizard } from 'texuli/stepper';

let { onFinish }: { onFinish?: () => void } = $props();
let name = $state('');
let current = $state(0);
</script>

<Wizard
  bind:current
  steps={[
    { id: 'account', label: 'Account' },
    { id: 'confirm', label: 'Confirm' },
  ]}
  validate={(index) => (index === 0 && name.trim() === '' ? 'Name is required' : true)}
  {onFinish}
>
  {#snippet content({ step })}
    {#if step.id === 'account'}
      <label>Name <input bind:value={name} /></label>
    {:else}
      <p>Ready, {name}</p>
    {/if}
  {/snippet}
</Wizard>
