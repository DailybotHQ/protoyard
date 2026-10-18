<script lang="ts">
/** `error` is set when route guards looped instead of a missing route. */
let { path = '', error }: { path?: string; error?: string; [key: string]: unknown } = $props();
</script>

<section
  class="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center gap-3 px-6 py-16 text-center"
  aria-labelledby="py-not-found-title"
>
  {#if error}
    <p class="font-mono text-sm text-muted-foreground">Redirect loop</p>
    <h1 id="py-not-found-title" class="text-2xl font-semibold tracking-tight">This page keeps redirecting</h1>
    <p class="text-muted-foreground" role="alert">{error}</p>
  {:else}
    <p class="font-mono text-sm text-muted-foreground">404</p>
    <h1 id="py-not-found-title" class="text-2xl font-semibold tracking-tight">Page not found</h1>
    <p class="text-muted-foreground">
      Nothing lives at <code class="rounded bg-muted px-1.5 py-0.5 text-sm">{path}</code> in this prototype.
    </p>
  {/if}
  <a
    href="#/"
    class="mt-2 inline-flex min-h-touch items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover sm:min-h-9"
  >
    Go to the start page
  </a>
</section>
