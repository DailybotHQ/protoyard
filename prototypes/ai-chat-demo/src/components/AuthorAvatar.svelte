<script lang="ts">
import type { Author } from '../lib/context.ts';

let {
  author,
  size = 'md',
  decorative = true,
}: { author: Author; size?: 'sm' | 'md'; decorative?: boolean } = $props();

const initials = $derived(
  author.name
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()
);

// Initials must reach 4.5:1. Pick near-black or white, and if neither does
// (mid-tones like #8b5cf6), darken the fill until white text passes.
function avatarColors(hex: string): { bg: string; fg: string } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { bg: hex, fg: '#0b1220' };
  const rgb = [0, 2, 4].map((i) => Number.parseInt((m[1] as string).slice(i, i + 2), 16));
  const lum = (c: number[]) =>
    c
      .map((v) => v / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((sum, v, i) => sum + v * ([0.2126, 0.7152, 0.0722][i] as number), 0);
  const DARK = 0.0062; // luminance of #0b1220
  let l = lum(rgb);
  if ((l + 0.05) / (DARK + 0.05) >= 4.5) return { bg: hex, fg: '#0b1220' };
  let c = rgb;
  for (let step = 0; step < 10 && 1.05 / (l + 0.05) < 4.5; step++) {
    c = c.map((v) => Math.round(v * 0.9));
    l = lum(c);
  }
  return { bg: `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`, fg: '#ffffff' };
}
const colors = $derived(avatarColors(author.color));
</script>

<!-- Initials always reach 4.5:1 against their fill (see avatarColors). -->
<span
  class={[
    'grid shrink-0 place-items-center font-semibold select-none',
    size === 'sm' ? 'size-7 text-[0.65rem]' : 'size-9 text-xs',
    author.kind === 'agent' ? 'rounded-lg' : 'rounded-full',
  ]}
  style:background-color={colors.bg}
  style:color={colors.fg}
  role={decorative ? undefined : 'img'}
  aria-hidden={decorative ? 'true' : undefined}
  aria-label={decorative ? undefined : `${author.name}${author.kind === 'agent' ? ' (AI agent)' : ''}`}
>
  {initials}
</span>
