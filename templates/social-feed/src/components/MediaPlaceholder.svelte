<script lang="ts">
import { Image } from '@lucide/svelte';
import { Badge } from '@protoyard/ui';
import { Icon } from 'texuli/icons';
import { Box } from 'texuli/typography';
import type { Media } from '../database/schema.ts';

/**
 * A generated placeholder "photo" and its description. No file is fetched.
 * The post's hue reaches the screen through the icon's `color` prop: the
 * design system has no surface that takes a data color.
 */
let { media }: { media: Media } = $props();
</script>

<Box
  surface="muted"
  border="default"
  radius="lg"
  padding="none"
  role="img"
  aria-label={media.alt}
  class="relative mt-3 grid aspect-video w-full place-items-center overflow-hidden p-2"
>
  <Icon icon={Image} size="lg" color={`hsl(${media.hue} 65% 45%)`} />
  <Badge variant="secondary" class="absolute right-2 bottom-2" aria-hidden="true">Placeholder image</Badge>
</Box>
