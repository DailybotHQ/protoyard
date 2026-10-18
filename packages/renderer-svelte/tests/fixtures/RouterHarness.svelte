<script lang="ts">
import Router from '../../src/router/Router.svelte';
import type { Router as HashRouter } from '../../src/router/router.svelte.ts';

let { router }: { router: HashRouter } = $props();
</script>

<Router {router} />
