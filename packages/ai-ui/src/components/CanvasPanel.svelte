<script lang="ts">
import { Check, Copy, X } from '@lucide/svelte';
import type { AssistantCanvas } from '../types.ts';

interface Props {
  document: AssistantCanvas;
  onChange?: (content: string) => void;
  onClose?: () => void;
}

let { document, onChange, onClose }: Props = $props();
let copied = $state(false);
let copyError = $state(false);

async function copyContent(): Promise<void> {
  try {
    await navigator.clipboard.writeText(document.content);
    copied = true;
    copyError = false;
    setTimeout(() => (copied = false), 1400);
  } catch {
    copyError = true;
    copied = false;
  }
}
</script>

<aside class="flex min-h-0 min-w-0 flex-col border-l border-border bg-surface" aria-label="Canvas">
  <header class="flex min-h-14 items-center gap-2 border-b border-border px-4">
    <div class="min-w-0 flex-1">
      <h2 class="truncate text-sm font-semibold">{document.title}</h2>
      <p class="text-[0.7rem] text-muted-foreground">{document.kind === 'code' ? document.language ?? 'Code' : 'Document'} canvas</p>
    </div>
    <button type="button" class="inline-flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Copy canvas content" onclick={() => void copyContent()}>
      {#if copied}<Check class="size-4" aria-hidden="true" />{:else}<Copy class="size-4" aria-hidden="true" />{/if}
    </button>
    {#if onClose}<button type="button" class="inline-flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Close canvas" onclick={onClose}><X class="size-4" aria-hidden="true" /></button>{/if}
  </header>
  {#if document.kind === 'code'}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -- scrollable canvas code; keyboard users must reach it (WCAG 2.1.1 / axe scrollable-region-focusable). -->
    <pre
      tabindex="0"
      aria-label={`${document.language || 'Code'} canvas code`}
      class="min-h-0 flex-1 overflow-auto bg-muted/40 p-4 text-xs leading-6 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
    ><code>{document.content}</code></pre>
  {:else}
    <label for="assistant-canvas-document" class="sr-only">Canvas document content</label>
    <textarea id="assistant-canvas-document" class="min-h-0 flex-1 resize-none bg-transparent p-5 text-sm leading-7 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset" value={document.content} readonly={!onChange} oninput={(event) => onChange?.(event.currentTarget.value)}></textarea>
  {/if}
  {#if copyError}<p role="alert" class="border-t border-border px-4 py-2 text-xs text-destructive">Clipboard access is unavailable in this browser.</p>{:else if copied}<p class="sr-only" role="status">Canvas copied.</p>{/if}
</aside>
