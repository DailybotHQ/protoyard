<script lang="ts">
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
    request.onblocked = () =>
      reject(new Error('Another tab still has this prototype open. Close it and try again.'));
  });
}

async function wipe() {
  if (!namespace) return;
  wiping = true;
  wipeError = null;
  try {
    // Only THIS prototype's two databases; nothing else on the origin.
    await deleteDb(`protoyard.${namespace}.data`);
    await deleteDb(`protoyard.${namespace}.control`);
    location.reload();
  } catch (err) {
    wipeError = err instanceof Error ? err.message : String(err);
    wiping = false;
  }
}
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
        <h1 id="py-boot-error-title" class="text-lg font-semibold">{name} couldn't start</h1>
        {#if typeof code === 'string'}
          <p class="font-mono text-xs text-muted-foreground">{code}</p>
        {/if}
      </div>
    </div>
    <p class="mt-4 text-sm text-surface-foreground">{message}</p>
    <p class="mt-2 text-sm text-muted-foreground">
      Your prototype data lives only in this browser. Reloading usually helps; if the stored data is
      from a newer or broken version, you can reset this prototype's data (other prototypes are not
      affected).
    </p>
    {#if wipeError}
      <p class="mt-3 text-sm text-destructive" role="alert">{wipeError}</p>
    {/if}
    <div class="mt-6 flex flex-wrap gap-2">
      <button
        type="button"
        class="inline-flex min-h-touch items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover sm:min-h-9"
        onclick={() => location.reload()}
      >
        <Icon name="refresh" /> Reload
      </button>
      {#if namespace}
        {#if confirming}
          <button
            type="button"
            class="inline-flex min-h-touch items-center rounded-md bg-destructive px-4 text-sm font-medium text-destructive-foreground hover:bg-destructive-hover disabled:opacity-60 sm:min-h-9"
            disabled={wiping}
            aria-busy={wiping}
            onclick={wipe}
          >
            {wiping ? 'Resetting…' : 'Yes, delete this prototype’s data'}
          </button>
          <button
            type="button"
            class="inline-flex min-h-touch items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-muted sm:min-h-9"
            disabled={wiping}
            onclick={() => (confirming = false)}
          >
            Cancel
          </button>
        {:else}
          <button
            type="button"
            class="inline-flex min-h-touch items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-muted sm:min-h-9"
            onclick={() => (confirming = true)}
          >
            Reset prototype data…
          </button>
        {/if}
      {/if}
    </div>
  </section>
</main>
