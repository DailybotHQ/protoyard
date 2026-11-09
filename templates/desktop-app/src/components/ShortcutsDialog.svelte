<script lang="ts">
import { Dialog, Kbd } from '@protoyard/ui';
import { Box, Text } from 'texuli/typography';
import { formatShortcut, SHORTCUTS } from '../lib/shortcuts.ts';

/** Lists every shortcut from the one table the key handler uses. */
let { open = $bindable(false), mac }: { open?: boolean; mac: boolean } = $props();
</script>

<Dialog bind:open title="Keyboard shortcuts" description="These work anywhere in the app, also while you type, except “?”.">
  <dl data-testid="shortcut-list">
    {#each SHORTCUTS as shortcut, index (shortcut.id)}
      <Box border={index > 0 ? 'block-start' : 'none'} radius="none" padding="none" class="flex items-center justify-between gap-4 py-2">
        <dt><Text as="span" size="sm">{shortcut.label}</Text></dt>
        <dd><Kbd>{formatShortcut(shortcut, mac)}</Kbd></dd>
      </Box>
    {/each}
  </dl>
  <Text size="xs" tone="muted" class="mt-4">
    Browsers keep {mac ? '⌘N, ⌘W and ⌘T' : 'Ctrl+N, Ctrl+W and Ctrl+T'} for themselves, so this
    prototype uses {mac ? '⌥' : 'Alt'} for new and close. A packaged desktop app could use the native keys.
  </Text>
</Dialog>
