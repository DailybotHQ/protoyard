<script lang="ts">
import type { Router as HashRouter } from '../../src/router/hash-router.svelte.ts';
import Link from '../../src/router/Link.svelte';
import Router from '../../src/router/Router.svelte';

let { router }: { router: HashRouter } = $props();
</script>

<!-- A shell: the nav lives outside the outlet and survives every navigation. -->
<nav aria-label="Main">
  <Link href="/" {router}>Home</Link>
  <Link href="/other" {router}>Other</Link>
</nav>
<main>
  <Router {router} />
</main>
