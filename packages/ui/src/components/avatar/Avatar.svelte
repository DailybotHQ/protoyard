<script lang="ts">
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
};

let { name, src, srcset, size = 'md', decorative = false, ...rest }: Props = $props();

// A plain record keeps the spread onto Texuli's Avatar a finite type.
const forwarded = $derived(rest as Record<string, unknown>);
</script>

<!--
  Texuli's `Avatar` (`texuli/avatar`): initials and tone from the name, and an
  image (with `srcset`) that passes Texuli's image URL policy for untrusted
  data (https or a relative path), falling back to the initials when it fails.
-->
<TexuliAvatar {name} {src} {srcset} {size} {decorative} {...forwarded} />
