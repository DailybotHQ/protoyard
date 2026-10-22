<script lang="ts">
import type { CtaBlock } from '@protoyard/blocks';
import { getBlockHost } from '@protoyard/blocks-ui';
import { Button, type ButtonVariant } from '@protoyard/ui';
import { safePageHref } from '../design.ts';
import PlainText from './PlainText.svelte';

/**
 * A CTA block drawn as page actions instead of a boxed card: the first action
 * is primary and the rest secondary unless the block sets a variant. `hero`
 * centers large buttons that stack full width on phones; `band` inverts them
 * for the primary-colored closing band.
 */
let {
  block,
  tone = 'hero',
  align = 'center',
}: { block: CtaBlock; tone?: 'hero' | 'band' | 'section'; align?: 'start' | 'center' } = $props();
const host = getBlockHost();

type Kind = 'primary' | 'secondary' | 'link';
function kind(variant: CtaBlock['actions'][number]['variant'], index: number): Kind {
  return variant ?? (index === 0 ? 'primary' : 'secondary');
}

const VARIANT: Record<Kind, ButtonVariant> = {
  primary: 'default',
  secondary: 'outline',
  link: 'link',
};

const BAND_CLASS: Record<Kind, string> = {
  primary:
    'bg-primary-foreground text-primary hover:bg-primary-foreground/90 focus-visible:ring-primary-foreground',
  secondary:
    'border-primary-foreground/50 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 focus-visible:ring-primary-foreground',
  link: 'text-primary-foreground underline',
};

const actions = $derived(
  block.actions
    .map((action, index) => ({
      ...action,
      href: safePageHref(action.href),
      kind: kind(action.variant, index),
    }))
    .filter((action): action is typeof action & { href: string } => action.href !== null)
);

const muted = $derived(tone === 'band' ? 'text-primary-foreground' : 'text-muted-foreground');
</script>

<div
  class="grid gap-5 {align === 'center' ? 'justify-items-center text-center' : ''}"
  data-py-page-actions={tone}
>
  {#if block.title}
    <p class="font-heading text-xl font-semibold sm:text-2xl {tone === 'band' ? 'text-primary-foreground' : 'text-foreground'}">
      {block.title}
    </p>
  {/if}
  {#if block.body}<PlainText text={block.body} class="max-w-2xl text-base sm:text-lg {muted}" />{/if}
  <div
    class="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap {align === 'center' ? 'sm:justify-center' : ''}"
  >
    {#each actions as action, index (index)}
      {#if host.onCtaAction}
        <Button
          size="lg"
          variant={VARIANT[action.kind]}
          class="w-full sm:w-auto {tone === 'band' ? BAND_CLASS[action.kind] : ''}"
          onclick={() => host.onCtaAction?.({ label: action.label, href: action.href })}
        >
          {action.label}
        </Button>
      {:else}
        <Button
          size="lg"
          variant={VARIANT[action.kind]}
          class="w-full sm:w-auto {tone === 'band' ? BAND_CLASS[action.kind] : ''}"
          href={action.href}
        >
          {action.label}
        </Button>
      {/if}
    {/each}
  </div>
  {#if block.footnote}<p class="text-xs {muted}">{block.footnote}</p>{/if}
</div>
