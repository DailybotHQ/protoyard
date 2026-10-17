<script lang="ts">
import Combobox from '../../src/components/combobox/Combobox.svelte';
import Select from '../../src/components/select/Select.svelte';

const items = [
  { value: 'lead', label: 'Lead' },
  { value: 'won', label: 'Won' },
];
let stage = $state('won');
let owner = $state('lead');
</script>

<label for="stage">Stage</label>
<Select id="stage" {items} bind:value={stage} />
<Combobox aria-label="Owner" {items} bind:value={owner} />
<button type="button" onclick={() => (owner = 'won')}>Set owner externally</button>
<button type="button" onclick={() => (owner = '')}>Clear owner</button>
