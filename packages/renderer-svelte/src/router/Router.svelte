<script lang="ts">
import NotFound from './NotFound.svelte';
import type { Router } from './router.svelte.ts';

/** Renders the component matching the current hash; extra props are forwarded. */
let { router, ...rest }: { router: Router; [key: string]: unknown } = $props();

const match = $derived(router.current);
const Page = $derived(match.route?.component ?? router.notFound ?? NotFound);
</script>

{#key match.route?.path ?? '__not-found__'}
  <Page params={match.params} query={match.query} path={match.path} {...rest} />
{/key}
