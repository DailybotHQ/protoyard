<script lang="ts">
import { Copy } from '@lucide/svelte';
import { IconButton } from 'texuli/button';
import { Icon } from 'texuli/icons';
import { LucideIcon } from 'texuli/icons/lucide';
import { Textarea } from 'texuli/input';
import { Code, CopyButton } from 'texuli/kbd-code';
import type { AssistantCanvas } from '../types.ts';

interface Props {
  document: AssistantCanvas;
  onChange?: (content: string) => void;
  onClose?: () => void;
}

let { document, onChange, onClose }: Props = $props();
let copyError = $state(false);
</script>

<aside class="flex min-h-0 min-w-0 flex-col border-l border-border bg-surface" aria-label="Canvas">
  <header class="flex min-h-14 items-center gap-2 border-b border-border px-4">
    <div class="min-w-0 flex-1">
      <h2 class="truncate text-sm font-semibold">{document.title}</h2>
      <p class="text-[0.7rem] text-muted-foreground">{document.kind === 'code' ? document.language ?? 'Code' : 'Document'} canvas</p>
    </div>
    <!-- CopyButton announces "Canvas copied"; a failed clipboard write shows the alert below. -->
    <CopyButton
      value={document.content}
      label="Copy canvas content"
      copiedLabel="Canvas copied"
      onCopy={() => (copyError = false)}
      onCopyError={() => (copyError = true)}
    >
      <LucideIcon icon={Copy} size="sm" />
    </CopyButton>
    {#if onClose}<IconButton variant="ghost" label="Close canvas" onclick={onClose}><Icon icon="close" size="sm" /></IconButton>{/if}
  </header>
  {#if document.kind === 'code'}
    <!-- The block code scrolls, so it takes focus and a name (WCAG 2.1.1 / axe scrollable-region-focusable). -->
    <div class="flex min-h-0 flex-1 flex-col [&>pre]:min-h-0 [&>pre]:flex-1 [&>pre]:flex [&>pre]:flex-col">
      <Code
        variant="block"
        value={document.content}
        language={document.language || undefined}
        role="region"
        tabindex={0}
        aria-label={`${document.language || 'Code'} canvas code`}
        class="min-h-0 flex-1 overflow-auto rounded-none border-0 bg-muted/40 p-4 text-xs leading-6 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      />
    </div>
  {:else}
    <label for="assistant-canvas-document" class="sr-only">Canvas document content</label>
    <Textarea
      id="assistant-canvas-document"
      class="min-h-0 flex-1 resize-none rounded-none border-0 bg-transparent p-5 text-sm leading-7 focus-visible:ring-inset"
      value={document.content}
      readonly={!onChange}
      onValueChange={(value) => onChange?.(value)}
    />
  {/if}
  {#if copyError}<p role="alert" class="border-t border-border px-4 py-2 text-xs text-destructive">Clipboard access is unavailable in this browser.</p>{/if}
</aside>
