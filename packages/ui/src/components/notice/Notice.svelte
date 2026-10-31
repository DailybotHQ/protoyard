<script lang="ts">
import type { Snippet } from 'svelte';
import type { HTMLAttributes } from 'svelte/elements';
import { Alert } from 'texuli/alert';
import { Icon } from 'texuli/icons';
import type { IconComponent } from '../../lib/types.ts';
import type { NoticeTone } from './tones.ts';

/**
 * Inline callout for privacy tips, success, warning, error or brand notes:
 * a thin adapter over Texuli's `Alert` (`texuli/alert`). Error uses
 * role="alert"; other tones use role="status". The optional action returns a
 * promise through Button for pending feedback.
 */
type Props = Omit<HTMLAttributes<HTMLDivElement>, 'title' | 'class' | 'children'> & {
  tone?: NoticeTone;
  title?: string;
  text?: string;
  /** Replaces the tone's default glyph. */
  icon?: IconComponent;
  actionLabel?: string;
  actionHref?: string;
  /** May return a promise; the action button shows pending until it settles. */
  onAction?: () => unknown | Promise<unknown>;
  children?: Snippet;
  class?: string;
  /** The rendered root element (bindable). */
  ref?: HTMLElement | null;
};

let {
  tone = 'info',
  title,
  text,
  icon,
  actionLabel,
  actionHref,
  onAction,
  children,
  class: className,
  ref = $bindable(null),
  ...rest
}: Props = $props();
</script>

{#snippet customIcon()}
  {#if icon}<Icon {icon} aria-hidden="true" />{/if}
{/snippet}

<Alert
  {...rest}
  bind:ref
  {tone}
  {title}
  {text}
  icon={icon ? customIcon : undefined}
  {actionLabel}
  {actionHref}
  {onAction}
  {children}
  class={className}
  data-py-notice=""
  data-tone={tone}
/>
