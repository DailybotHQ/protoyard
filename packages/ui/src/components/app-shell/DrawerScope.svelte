<script lang="ts">
import type { Snippet } from 'svelte';
import { markInDrawer } from './context.ts';

let { children }: { children: Snippet } = $props();

markInDrawer();
</script>

{@render children()}
