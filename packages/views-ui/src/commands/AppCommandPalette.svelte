<script lang="ts">
import { runService } from '@protoyard/renderer-svelte';
import type { Snippet } from 'svelte';
import { isMacPlatform, shortcutKeys } from '../lib/platform.ts';
import type PaletteDialog from './PaletteDialog.svelte';
import type { CommandRegistry } from './registry.ts';

interface Props {
  registry: CommandRegistry;
  placeholder?: string;
  /** A visible way in (a header search button): `{#snippet trigger({ open, keys })}`. */
  trigger?: Snippet<[{ open: () => void; keys: string[] }]>;
}

let { registry, placeholder, trigger }: Props = $props();

const isMac = isMacPlatform();
let open = $state(false);
// The dialog body is its own chunk, fetched on the first open.
let Dialog = $state<typeof PaletteDialog | null>(null);

async function show() {
  if (!Dialog) Dialog = (await import('./PaletteDialog.svelte')).default;
  open = true;
}

function editable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName))
  );
}

function onKeydown(event: KeyboardEvent) {
  // Keys typed in the DevTools panel belong to it (it uses mod+. itself).
  if (event.target instanceof Element && event.target.closest('[data-protoyard-devtools]')) return;
  const mod = isMac ? event.metaKey : event.ctrlKey;
  if (mod && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    if (open) open = false;
    else void show();
    return;
  }
  if (open) return;
  const entry = registry.matchShortcut(event, isMac);
  // Shortcuts without a modifier never fire while typing.
  if (!entry || (!entry.shortcut?.startsWith('mod') && editable(event.target))) return;
  event.preventDefault();
  void runService(() => registry.run(entry));
}
</script>

<svelte:window onkeydown={onKeydown} />

{#if trigger}{@render trigger({ open: () => void show(), keys: shortcutKeys('mod+k', isMac) })}{/if}

{#if Dialog}
  <Dialog {registry} bind:open {isMac} {placeholder} />
{/if}
