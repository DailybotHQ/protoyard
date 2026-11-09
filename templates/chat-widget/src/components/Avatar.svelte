<script lang="ts">
import { Avatar } from '@protoyard/ui';
import type { Author } from '../lib/context.ts';

/**
 * The author's face, or initials when there is none: the design system's
 * Avatar draws it (the assistant is square, people are round). Decorative,
 * because the name is always shown next to it.
 */
let { author, size = 'md' }: { author: Author; size?: 'sm' | 'md' } = $props();
</script>

<Avatar
  name={author.name}
  src={author.image.src}
  srcset={author.image.srcset}
  {size}
  shape={author.isAssistant ? 'square' : 'circle'}
  decorative
  class="shrink-0"
  data-author-avatar=""
/>
