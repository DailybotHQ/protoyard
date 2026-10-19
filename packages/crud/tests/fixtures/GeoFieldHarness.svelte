<script lang="ts">
import type { BlueprintField } from '@protoyard/blueprint';
import FieldControl from '../../src/fields/FieldControl.svelte';

let {
  field,
  initial = null,
  error,
}: { field: BlueprintField; initial?: unknown; error?: string } = $props();

// svelte-ignore state_referenced_locally
let value = $state<unknown>(initial);
</script>

<FieldControl {field} bind:value {error} id="geo-under-test" />
<output data-testid="geo-value">{JSON.stringify(value)}</output>
