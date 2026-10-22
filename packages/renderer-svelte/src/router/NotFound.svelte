<script lang="ts">
import { chromeMessages } from '../messages.ts';
import MessageText from '../shell/MessageText.svelte';

/** `error` is set when route guards looped instead of a missing route. */
let { path = '', error }: { path?: string; error?: string; [key: string]: unknown } = $props();
const messages = chromeMessages().router;
</script>

<section
  class="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center gap-3 px-6 py-16 text-center"
  aria-labelledby="py-not-found-title"
>
  {#if error}
    <p class="font-mono text-sm text-muted-foreground">{messages.redirectLoopCode}</p>
    <h1 id="py-not-found-title" class="text-2xl font-semibold tracking-tight">{messages.redirectLoopTitle}</h1>
    <p class="text-muted-foreground" role="alert">{error}</p>
  {:else}
    <p class="font-mono text-sm text-muted-foreground">{messages.notFoundCode}</p>
    <h1 id="py-not-found-title" class="text-2xl font-semibold tracking-tight">{messages.notFoundTitle}</h1>
    <p class="text-muted-foreground">
      <MessageText template={messages.notFoundBody} values={{ path }} code={['path']} />
    </p>
  {/if}
  <a
    href="#/"
    class="mt-2 inline-flex min-h-touch items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover sm:min-h-9"
  >
    {messages.home}
  </a>
</section>
