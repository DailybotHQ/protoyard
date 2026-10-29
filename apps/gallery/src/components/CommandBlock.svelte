<script lang="ts">
import Copy from '@lucide/svelte/icons/copy';
import { Button } from '@protoyard/ui';
import type { Attachment } from 'svelte/attachments';
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

/**
 * A long command scrolls sideways; while it does, the region is a Tab stop so
 * keyboard users can scroll it (WCAG 2.1.1). The server HTML always has
 * `tabindex="0"` (reachable before hydration); once hydrated, a command that
 * fits drops the extra stop. Both the size and the text are watched: a
 * narrower window or a longer command (the create builder rewrites it as the
 * user types) brings the stop back.
 */
const scrollableFocus: Attachment<HTMLElement> = (node) => {
  const sync = () => {
    if (node.scrollWidth > node.clientWidth) node.tabIndex = 0;
    else node.removeAttribute('tabindex');
  };
  sync();
  const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(sync);
  resize?.observe(node);
  const text = new MutationObserver(sync);
  text.observe(node, { characterData: true, childList: true, subtree: true });
  return () => {
    resize?.disconnect();
    text.disconnect();
  };
};
</script>

<div class="rounded-lg border border-line bg-surface-2">
  {#if label}<p class="border-b border-line px-3 py-1.5 text-xs text-muted">{label}</p>{/if}
  <div class="flex items-start gap-2 p-2 pl-3">
    <!-- A Tab stop while it scrolls, so keyboard users can scroll it (scrollableFocus). -->
    <pre
      role="region"
      aria-label={label ?? 'Command'}
      tabindex="0"
      {@attach scrollableFocus}
      class={['min-w-0 flex-1 overflow-x-auto py-1 font-mono text-[13px] leading-relaxed', multiline ? 'whitespace-pre-wrap' : 'whitespace-pre']}><code>{command}</code></pre>
    <Button variant="outline"
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
