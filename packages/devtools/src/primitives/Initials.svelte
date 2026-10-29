<script lang="ts">
import { Avatar } from 'texuli/avatar';

/** A decorative persona face backed by Texuli's accessible avatar component. */
let {
  name,
  color,
  size = 'md',
  src,
  srcset,
}: {
  name: string;
  color?: string | undefined;
  size?: 'sm' | 'md';
  src?: string | undefined;
  srcset?: string | undefined;
} = $props();
</script>

<Avatar
  {name}
  {src}
  {srcset}
  size={size === 'sm' ? 'sm' : 'md'}
  decorative
  class="devtools-persona-avatar"
  style="--devtools-persona-color: {color ?? 'transparent'}"
  data-persona-avatar=""
/>

<style>
  :global(.devtools-persona-avatar .tx-avatar__surface[data-tone]) {
    --tx-avatar-tone: var(--devtools-persona-color, transparent);
  }
</style>
