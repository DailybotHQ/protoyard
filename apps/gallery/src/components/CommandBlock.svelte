<script lang="ts">
import Check from '@lucide/svelte/icons/check';
import Copy from '@lucide/svelte/icons/copy';

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
    <!-- Scrollable for long commands: focusable so keyboard users can scroll it. -->
    <pre
      tabindex="0"
      role="region"
      aria-label={label ?? 'Command'}
      class={['min-w-0 flex-1 overflow-x-auto py-1 font-mono text-[13px] leading-relaxed', multiline ? 'whitespace-pre-wrap' : 'whitespace-pre']}><code>{command}</code></pre>
    <button
      type="button"
      class="shrink-0 rounded-md border border-line bg-surface p-1.5 text-muted hover:text-fg"
      aria-label={copied ? 'Copied' : `Copy ${label ?? 'command'}`}
      onclick={copy}
    >
      {#if copied}<Check size={14} aria-hidden="true" />{:else}<Copy size={14} aria-hidden="true" />{/if}
    </button>
  </div>
  <p class="sr-only" aria-live="polite">{copied ? 'Copied to clipboard' : failed ? 'Copy failed; select the text instead' : ''}</p>
  {#if failed}<p class="px-3 pb-2 text-xs text-warning">Copy is blocked here — select the text instead.</p>{/if}
</div>
