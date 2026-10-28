<script lang="ts">
import { Button } from '@protoyard/ui';
import { chromeMessages, formatMessage } from '../messages.ts';
import Icon from './Icon.svelte';

let { error, namespace, name }: { error: unknown; namespace: string | null; name: string } =
  $props();

const message = $derived(error instanceof Error ? error.message : String(error));
const code = $derived((error as { code?: unknown })?.code);
let confirming = $state(false);
let wiping = $state(false);
let wipeError = $state<string | null>(null);

function deleteDb(dbName: string) {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(dbName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error(`Could not delete ${dbName}`));
    request.onblocked = () => reject(new Error(chromeMessages().boot.otherTab));
  });
}

async function wipe() {
  if (!namespace) return;
  wiping = true;
  wipeError = null;
  try {
    // Only THIS prototype's databases; nothing else on the origin. The player
    // also keeps validation-task attempts per blueprint; deleting a database
    // that does not exist is a no-op for every other prototype.
    await deleteDb(`protoyard.${namespace}.data`);
    await deleteDb(`protoyard.${namespace}.control`);
    await deleteDb(`protoyard.${namespace}.validation`);
    location.reload();
  } catch (err) {
    wipeError = err instanceof Error ? err.message : String(err);
    wiping = false;
  }
}
const messages = chromeMessages().boot;
</script>

<main class="flex min-h-dvh items-center justify-center bg-background px-4 py-10 text-foreground">
  <section
    class="w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-float"
    aria-labelledby="py-boot-error-title"
  >
    <div class="flex items-center gap-3">
      <span class="inline-flex size-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
        <Icon name="alert" class="size-5" />
      </span>
      <div>
        <h1 id="py-boot-error-title" class="text-lg font-semibold">{formatMessage(messages.title, { name })}</h1>
        {#if typeof code === 'string'}
          <p class="font-mono text-xs text-muted-foreground">{code}</p>
        {/if}
      </div>
    </div>
    <p class="mt-4 text-sm text-surface-foreground">{message}</p>
    <p class="mt-2 text-sm text-muted-foreground">{messages.explanation}</p>
    {#if wipeError}
      <p class="mt-3 text-sm text-destructive" role="alert">{wipeError}</p>
    {/if}
    <div class="mt-6 flex flex-wrap gap-2">
      <Button
        type="button"
        size="sm"
        class="inline-flex min-h-touch items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover sm:min-h-9"
        onclick={() => location.reload()}
      >
        <Icon name="refresh" /> {messages.reload}
      </Button>
      {#if namespace}
        {#if confirming}
          <Button
            type="button"
            variant="destructive"
            size="sm"
            class="inline-flex min-h-touch items-center rounded-md bg-destructive px-4 text-sm font-medium text-destructive-foreground hover:bg-destructive-hover disabled:opacity-60 sm:min-h-9"
            disabled={wiping}
            aria-busy={wiping}
            onclick={wipe}
          >
            {wiping ? messages.resetting : messages.confirmReset}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            class="inline-flex min-h-touch items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-muted sm:min-h-9"
            disabled={wiping}
            onclick={() => (confirming = false)}
          >
            {messages.cancel}
          </Button>
        {:else}
          <Button
            type="button"
            variant="outline"
            size="sm"
            class="inline-flex min-h-touch items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-muted sm:min-h-9"
            onclick={() => (confirming = true)}
          >
            {messages.reset}
          </Button>
        {/if}
      {/if}
    </div>
  </section>
</main>
