<script lang="ts">
import { onMount } from 'svelte';

// Stands in for CommandPalette.svelte: reports ready like the real palette.
let { onReady }: { onReady?: (api: { show: () => void }) => void } = $props();
let open = $state(false);
onMount(() => onReady?.({ show: () => (open = true) }));
</script>

<div data-testid="palette-stub" data-open={open}></div>
