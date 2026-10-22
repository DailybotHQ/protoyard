<script lang="ts">
import type { Snippet } from 'svelte';
import { cn } from '../../lib/cn.ts';
import type { IconComponent } from '../../lib/types.ts';
import Button from '../button/Button.svelte';
import { NOTICE_DEFAULT_ICONS, NOTICE_TONE_CLASSES, type NoticeTone } from './tones.ts';

/**
 * Inline callout for privacy tips, success, warning, error or brand notes.
 * Error uses role="alert"; other tones use role="status". Optional action
 * returns a promise through Button for pending feedback.
 */
let {
  tone = 'info',
  title,
  text,
  icon: Icon,
  actionLabel,
  actionHref,
  onAction,
  children,
  class: className,
}: {
  tone?: NoticeTone;
  title?: string;
  text?: string;
  icon?: IconComponent;
  actionLabel?: string;
  actionHref?: string;
  /** May return a promise; the action button shows pending until it settles. */
  onAction?: () => unknown | Promise<unknown>;
  children?: Snippet;
  class?: string;
} = $props();

const ToneIcon = $derived(Icon ?? NOTICE_DEFAULT_ICONS[tone]);
const colors = $derived(NOTICE_TONE_CLASSES[tone]);
const role = $derived(tone === 'error' ? 'alert' : 'status');
</script>

<div
  {role}
  class={cn('flex flex-col gap-2 rounded-lg px-3.5 py-3', colors.box, className)}
  data-py-notice
  data-tone={tone}
>
  <div class="flex gap-2.5">
    <ToneIcon class={cn('mt-0.5 size-5 shrink-0', colors.title)} aria-hidden="true" />
    <div class="min-w-0 flex-1">
      {#if title}
        <p class={cn('text-sm font-semibold', colors.title)}>{title}</p>
      {/if}
      {#if text}
        <p class={cn('text-sm text-foreground', title && 'mt-0.5')}>{text}</p>
      {/if}
      {#if children}
        <div class={cn('text-sm text-foreground', (title || text) && 'mt-0.5')}>
          {@render children()}
        </div>
      {/if}
    </div>
  </div>
  {#if actionLabel && (onAction || actionHref)}
    <div class="pl-7">
      <Button
        variant="link"
        size="sm"
        href={actionHref}
        onclick={onAction ? () => onAction() : undefined}
        class="h-11 justify-start px-0"
      >
        {actionLabel}
      </Button>
    </div>
  {/if}
</div>
