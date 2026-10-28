<script lang="ts">
import { safeHref } from '@protoyard/ai/markdown';
import type { CtaBlock as CtaBlockData } from '@protoyard/blocks';
import { Button, type ButtonVariant } from '@protoyard/ui';
import { getBlockHost } from '../host.ts';
import BlockIcon from './BlockIcon.svelte';
import SafeBody from './SafeBody.svelte';

let { block }: { block: CtaBlockData } = $props();
const host = getBlockHost();

function buttonVariant(variant: 'primary' | 'secondary' | 'link' | undefined): ButtonVariant {
  if (variant === 'secondary') return 'secondary';
  if (variant === 'link') return 'link';
  return 'default';
}

async function runAction(label: string, href: string): Promise<void> {
  const safe = safeHref(href);
  if (!safe) return;
  if (host.onCtaAction) {
    await host.onCtaAction({ label, href: safe });
    return;
  }
  // No host handler: open external/absolute links in the same tab via location.
  if (/^https?:\/\//i.test(safe) || safe.startsWith('mailto:')) {
    window.location.assign(safe);
  }
}
</script>

<section
  class="grid gap-4 rounded-2xl border border-border bg-surface p-6 shadow-soft sm:p-8"
  data-block-type="cta"
  aria-label={block.title ?? 'Call to action'}
>
  {#if block.title}
    <h3 class="font-heading text-xl font-semibold text-foreground sm:text-2xl">{block.title}</h3>
  {/if}
  {#if block.body}<SafeBody text={block.body} />{/if}
  <div class="flex flex-wrap items-center gap-3">
    {#each block.actions as action, index (index)}
      {@const href = safeHref(action.href)}
      {#if href}
        {#if host.onCtaAction}
          <Button
            variant={buttonVariant(action.variant)}
            onclick={() => runAction(action.label, action.href)}
          >
            {#if action.icon}<BlockIcon name={action.icon} class="size-4" />{/if}
            {action.label}
          </Button>
        {:else if href.startsWith('#') || href.startsWith('/')}
          <Button
            variant={buttonVariant(action.variant)}
            {href}
          >
            {#if action.icon}<BlockIcon name={action.icon} class="size-4" />{/if}
            {action.label}
          </Button>
        {:else}
          <Button
            variant={buttonVariant(action.variant)}
            onclick={() => runAction(action.label, action.href)}
          >
            {#if action.icon}<BlockIcon name={action.icon} class="size-4" />{/if}
            {action.label}
          </Button>
        {/if}
      {/if}
    {/each}
  </div>
  {#if block.footnote}
    <p class="text-xs text-muted-foreground">{block.footnote}</p>
  {/if}
</section>
