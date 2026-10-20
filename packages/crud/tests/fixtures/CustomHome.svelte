<script lang="ts">
import type { RouteProps } from '@protoyard/renderer-svelte';

let { params = {} }: Partial<RouteProps> = $props();
</script>

<h1>Custom home</h1>
<p hidden>{Object.keys(params).length}</p>
