<script lang="ts">
import type { ComponentProps } from 'svelte';
import type { HTMLAttributes } from 'svelte/elements';
import { Avatar as TexuliAvatar } from 'texuli/avatar';

type Props = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & {
  name: string;
  /**
   * Optional image. Initials are shown when it is absent, unsafe (any scheme
   * other than https, `//host`, whitespace…) or fails to load. Persona
   * avatars (`av-042`, URLs) resolve with `avatarImage()` from
   * `@protoyard/renderer-svelte`: `<Avatar name={p.name} {...avatarImage(p.avatar)} />`.
   */
  src?: string | null;
  /** Optional `srcset` (for example `64px 1x, 128px 2x`); unsafe candidates are dropped. */
  srcset?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** Decorative avatars (next to a visible name) are hidden from assistive tech. */
  decorative?: boolean;
  /** A filled status tone instead of the name-derived color (Texuli 0.14.3, UG-29). */
  tone?: ComponentProps<typeof TexuliAvatar>['tone'];
  /** `'circle'` (default) or `'square'` (Texuli 0.14.3, UG-29). */
  shape?: ComponentProps<typeof TexuliAvatar>['shape'];
  /** The rendered root element (bindable). */
  ref?: HTMLElement | null;
};

let {
  name,
  src,
  srcset,
  size = 'md',
  decorative = false,
  tone,
  shape,
  ref = $bindable(null),
  ...rest
}: Props = $props();

// A plain record keeps the spread onto Texuli's Avatar a finite type.
const forwarded = $derived(rest as Record<string, unknown>);
</script>

<!--
  Texuli's `Avatar` (`texuli/avatar`): initials and tone from the name, and an
  image (with `srcset`) that passes Texuli's image URL policy for untrusted
  data (https or a relative path), falling back to the initials when it fails.
-->
<TexuliAvatar bind:ref {name} {src} {srcset} {size} {decorative} {tone} {shape} {...forwarded} />
