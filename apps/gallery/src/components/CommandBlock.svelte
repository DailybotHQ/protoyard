<script lang="ts">
import Copy from '@lucide/svelte/icons/copy';
import { Button } from '@protoyard/ui';
import { Icon } from 'texuli/icons';
import { LucideIcon } from 'texuli/icons/lucide';

let {
  command,
  label,
  multiline = false,
}: { command: string; label?: string; multiline?: boolean } = $props();
let copied = $state(false);
let failed = $state(false);
let timer: ReturnType<typeof setTimeout> | undefined;

async function copy() {
  try {
    await navigator.clipboard.writeText(command);
    copied = true;
    failed = false;
  } catch {
    // Clipboard API blocked (http, permissions): the text stays selectable.
    failed = true;
  }
  clearTimeout(timer);
  timer = setTimeout(() => {
    copied = false;
    failed = false;
  }, 1800);
}
</script>

<div class="rounded-lg border border-line bg-surface-2">
  {#if label}<p class="border-b border-line px-3 py-1.5 text-xs text-muted">{label}</p>{/if}
  <div class="flex items-start gap-2 p-2 pl-3">
    <!-- Keep the labeled code region focusable so keyboard users can scroll it. -->
    <pre
      role="region"
      aria-label={label ?? 'Command'}
      tabindex="0"
      class={['min-w-0 flex-1 overflow-x-auto py-1 font-mono text-[13px] leading-relaxed', multiline ? 'whitespace-pre-wrap' : 'whitespace-pre']}><code>{command}</code></pre>
    <Button
      type="button"
      class="shrink-0 rounded-md border border-line bg-surface p-1.5 text-muted hover:text-fg"
      aria-label={copied ? 'Copied' : `Copy ${label ?? 'command'}`}
      onclick={copy}
    >
      {#if copied}<Icon icon="check" size={14} aria-hidden="true" />{:else}<LucideIcon icon={Copy} size={14} aria-hidden="true" />{/if}
    </Button>
  </div>
  <p class="sr-only" aria-live="polite">{copied ? 'Copied to clipboard' : failed ? 'Copy failed; select the text instead' : ''}</p>
  {#if failed}<p class="px-3 pb-2 text-xs text-warning">Copy is blocked here — select the text instead.</p>{/if}
</div>
