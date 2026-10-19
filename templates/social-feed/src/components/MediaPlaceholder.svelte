<script lang="ts">
import type { Media } from '../database/schema.ts';

/** A generated placeholder "photo": a gradient from the post's hue and its description. No file is fetched. */
let { media }: { media: Media } = $props();
</script>

<div
  role="img"
  aria-label={media.alt}
  class="mt-3 grid aspect-[16/9] w-full place-items-end overflow-hidden rounded-lg border border-border p-2"
  style:background="linear-gradient(135deg, hsl({media.hue} 70% 62%), hsl({(media.hue + 50) % 360} 65% 42%))"
>
  <span class="rounded bg-black/55 px-1.5 py-0.5 text-[0.7rem] text-white" aria-hidden="true">Placeholder image</span>
</div>
