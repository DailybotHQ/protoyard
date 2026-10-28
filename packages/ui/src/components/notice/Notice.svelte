<script lang="ts">
import type { Snippet } from 'svelte';
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
}: {
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
} = $props();
</script>

{#snippet customIcon()}
  {#if icon}<Icon {icon} aria-hidden="true" />{/if}
{/snippet}

<Alert
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
