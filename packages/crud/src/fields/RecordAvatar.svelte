<script lang="ts">
import { avatarSrcset, avatarUrl } from '@protoyard/renderer-svelte';
import { Avatar } from '@protoyard/ui';

/**
 * A record's face: the library image for an avatar id (lazy, 64 px at 1x and
 * 128 px at 2x), or initials from `name` when there is no face or the image
 * fails to load. Decorative by default because it sits next to a visible name.
 */
let {
  avatar,
  name,
  size = 'sm',
  decorative = true,
}: {
  avatar: unknown;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  decorative?: boolean;
} = $props();

const sizes = { xs: 'size-5', sm: 'size-7', md: 'size-9', lg: 'size-12' };
const src = $derived(
  typeof avatar === 'string' ? avatarUrl(avatar, size === 'lg' ? 128 : 64) : undefined
);
const srcset = $derived(typeof avatar === 'string' ? avatarSrcset(avatar) : undefined);

let failed = $state(false);
$effect(() => {
  // A new face deserves a fresh attempt.
  void src;
  failed = false;
});
</script>

{#if src && !failed}
  <img
    {src}
    {srcset}
    alt={decorative ? '' : name}
    loading="lazy"
    decoding="async"
    class={`${sizes[size]} shrink-0 rounded-full bg-muted object-cover`}
    data-record-avatar={String(avatar)}
    onerror={() => (failed = true)}
  />
{:else}
  <Avatar {name} {size} {decorative} />
{/if}
