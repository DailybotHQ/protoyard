<script lang="ts">
import NotFound from './NotFound.svelte';
import type { Router } from './router.svelte.ts';

/** Renders the component matching the current hash; extra props are forwarded. */
let { router, ...rest }: { router: Router; [key: string]: unknown } = $props();

const match = $derived(router.current);
const page = $derived(match.route ? router.resolve(match.route) : (router.notFound ?? NotFound));
</script>

{#key match.route?.path ?? '__not-found__'}
  {#if page instanceof Promise}
    {#await page}
      <div class="mx-auto my-16 h-1 w-24 overflow-hidden rounded-full bg-muted" role="status" aria-label="Loading screen">
        <div class="h-full w-1/2 animate-pulse rounded-full bg-primary motion-reduce:animate-none"></div>
      </div>
    {:then Page}
      <Page params={match.params} query={match.query} path={match.path} {...rest} />
    {:catch error}
      <div class="mx-auto my-16 max-w-md text-center" role="alert">
        <p class="font-semibold">This screen could not be loaded.</p>
        <p class="mt-1 text-sm text-muted-foreground">{String(error)}</p>
        <button type="button" class="mt-3 text-sm font-medium text-primary underline" onclick={() => location.reload()}>Reload</button>
      </div>
    {/await}
  {:else}
    {@const Page = page}
    <Page params={match.params} query={match.query} path={match.path} {...rest} />
  {/if}
{/key}
