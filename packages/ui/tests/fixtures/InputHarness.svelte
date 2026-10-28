<script lang="ts">
import Input from '../../src/components/input/Input.svelte';

let text = $state('');
let seen = $state('');
let amount = $state<number | null>(5);
</script>

<Input aria-label="Name" bind:value={text} oninput={() => (seen = text)} />
<Input aria-label="Amount" type="number" bind:value={amount} />
<p data-testid="text">{text}</p>
<p data-testid="seen">{seen}</p>
<p data-testid="amount">{amount === null ? 'null' : `${typeof amount}:${amount}`}</p>
