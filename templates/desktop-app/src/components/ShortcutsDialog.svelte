<script lang="ts">
import { Dialog, Kbd } from '@protoyard/ui';
import { formatShortcut, SHORTCUTS } from '../lib/shortcuts.ts';

/** Lists every shortcut from the one table the key handler uses. */
let { open = $bindable(false), mac }: { open?: boolean; mac: boolean } = $props();
</script>

<Dialog bind:open title="Keyboard shortcuts" description="These work anywhere in the app, also while you type, except “?”.">
  <dl class="divide-y divide-border" data-testid="shortcut-list">
    {#each SHORTCUTS as shortcut (shortcut.id)}
      <div class="flex items-center justify-between gap-4 py-2 text-sm">
        <dt>{shortcut.label}</dt>
        <dd><Kbd>{formatShortcut(shortcut, mac)}</Kbd></dd>
      </div>
    {/each}
  </dl>
  <p class="mt-4 text-xs text-muted-foreground">
    Browsers keep {mac ? '⌘N, ⌘W and ⌘T' : 'Ctrl+N, Ctrl+W and Ctrl+T'} for themselves, so this
    prototype uses {mac ? '⌥' : 'Alt'} for new and close. A packaged desktop app could use the native keys.
  </p>
</Dialog>
