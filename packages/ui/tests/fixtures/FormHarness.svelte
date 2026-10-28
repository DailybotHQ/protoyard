<script lang="ts">
import Input from '../../src/components/input/Input.svelte';
import Tabs from '../../src/components/tabs/Tabs.svelte';
import { FormField } from '../../src/index.ts';

let { error }: { error?: string } = $props();
let value = $state('');
let tab = $state<string | undefined>(undefined);
</script>

<FormField label="Email" description="We never share it." {error} required>
  {#snippet children({ props })}
    <Input {...props} type="email" bind:value />
  {/snippet}
</FormField>

<Tabs
  bind:value={tab}
  label="Sections"
  items={[
    { value: 'overview', label: 'Overview' },
    { value: 'activity', label: 'Activity' },
  ]}
>
  {#snippet content(item)}<p>Panel {item.label}</p>{/snippet}
</Tabs>
<p data-testid="tab">{tab}</p>
