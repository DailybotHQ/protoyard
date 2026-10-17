<script lang="ts">
import { Checkbox } from '@protoyard/ui';

let channels = $state([
  { id: 'email', label: 'Email', checked: true },
  { id: 'push', label: 'Push notifications', checked: false },
  { id: 'sms', label: 'SMS', checked: false },
]);
let terms = $state(false);

const allChecked = $derived(channels.every((channel) => channel.checked));
const someChecked = $derived(!allChecked && channels.some((channel) => channel.checked));

function setAll(value: boolean): void {
  for (const channel of channels) channel.checked = value;
}
</script>

<div class="grid max-w-md gap-6">
  <fieldset class="grid gap-3">
    <legend class="mb-2 text-xs text-muted-foreground">Parent shows the indeterminate state</legend>
    <Checkbox
      label="All channels"
      bind:checked={() => allChecked, (value) => setAll(value)}
      bind:indeterminate={() => someChecked, () => {}}
    />
    <div class="grid gap-3 pl-6">
      {#each channels as channel (channel.id)}
        <Checkbox label={channel.label} bind:checked={channel.checked} />
      {/each}
    </div>
  </fieldset>

  <div class="grid gap-3">
    <Checkbox
      label="I accept the terms"
      description="You can withdraw consent at any time."
      bind:checked={terms}
    />
    <Checkbox label="Beta features (disabled)" disabled />
    <Checkbox label="Required by your admin (disabled, checked)" checked disabled />
  </div>
  <p class="text-xs text-muted-foreground" aria-live="polite">
    {channels.filter((channel) => channel.checked).length} of {channels.length} channels on · terms
    {terms ? 'accepted' : 'not accepted'}
  </p>
</div>
