<script lang="ts">
import { Check, Copy } from '@lucide/svelte';

let { code, label = 'Usage' }: { code: string; label?: string } = $props();
let copied = $state(false);

async function copy() {
  try {
    await navigator.clipboard.writeText(code);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  } catch {
    copied = false;
  }
}
</script>

<div class="overflow-hidden rounded-lg border border-border bg-muted/60">
  <div class="flex items-center justify-between border-b border-border px-3 py-1.5">
    <span class="text-xs font-medium text-muted-foreground">{label}</span>
    <button
      type="button"
      class="inline-flex min-h-touch items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-background hover:text-foreground sm:min-h-7"
      aria-label={copied ? 'Copied' : `Copy ${label.toLowerCase()} code`}
      onclick={copy}
    >
      {#if copied}<Check class="size-3.5 text-success" aria-hidden="true" />Copied{:else}<Copy class="size-3.5" aria-hidden="true" />Copy{/if}
    </button>
  </div>
  <pre class="overflow-x-auto p-3 text-[12.5px] leading-relaxed"><code class="font-mono">{code}</code></pre>
  <span class="sr-only" aria-live="polite">{copied ? 'Code copied to the clipboard' : ''}</span>
</div>
