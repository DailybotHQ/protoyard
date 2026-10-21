<script lang="ts">
import type { Router as HashRouter } from '../../src/router/hash-router.svelte.ts';
import Router from '../../src/router/Router.svelte';

let { router }: { router: HashRouter } = $props();
</script>

<Router {router} />
