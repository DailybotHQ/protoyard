<script lang="ts">
import type { RouteProps } from '@protoyard/renderer-svelte';

let { params = {}, label = 'Custom screen' }: Partial<RouteProps> & { label?: string } = $props();
</script>

<h1>{label}</h1>
<p data-testid="custom-params">{JSON.stringify(params)}</p>
