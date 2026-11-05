<script lang="ts">
import { Award } from '@lucide/svelte';
import type { IconComponent } from '@protoyard/ui';
import { Button } from 'texuli/button';
import { Card } from 'texuli/card';
import { getI18nContext, useMessages } from 'texuli/i18n';
import { LucideIcon } from 'texuli/icons/lucide';

/**
 * Achievement tile with an optional circular progress ring. `progress`/`goal`
 * come from `@protoyard/gamification` badgeProgress rows. `earnedAt` (ISO)
 * shows "Earned <date>" in the active locale; `href` makes the tile a link.
 */
let {
  name,
  description,
  earned = false,
  progress = 0,
  goal = 1,
  icon: Icon = Award,
  earnedAt,
  href,
  onclick,
  class: className = '',
}: {
  name: string;
  description?: string;
  earned?: boolean;
  progress?: number;
  goal?: number;
  icon?: IconComponent;
  /** When the badge was earned (ISO date-time); shown only when `earned`. */
  earnedAt?: string;
  /** Link target (hash route or path); wins over `onclick`. */
  href?: string;
  onclick?: () => void;
  class?: string;
} = $props();

const ratio = $derived(goal > 0 ? Math.min(1, Math.max(0, (earned ? goal : progress) / goal)) : 0);
const percent = $derived(Math.round(ratio * 100));
const size = 56;
const stroke = 4;
const radius = (size - stroke) / 2;
const circumference = $derived(2 * Math.PI * radius);
const offset = $derived(circumference * (1 - ratio));
// Labels resolve through Texuli's dictionary (mountPrototype({ i18n })).
const messages = useMessages();
const i18n = getI18nContext();
const M = 'protoyard.gamification.achievement-badge';

/** `earnedAt` as a medium date in the dictionary's locale (English without one). */
function formatDate(iso: string | undefined, locale: string): string | undefined {
  if (!iso) return undefined;
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return undefined;
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(time);
  } catch {
    return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(time);
  }
}

const earnedDate = $derived.by(() => {
  // Reading a message first tracks locale changes in this derived.
  messages(`${M}.earned-on`, 'Earned {date}');
  return earned ? formatDate(earnedAt, i18n?.locale ?? 'en') : undefined;
});
const spoken = $derived(
  earned
    ? earnedDate
      ? messages(`${M}.earned-on-spoken`, '{name}, earned {date}', { name, date: earnedDate })
      : messages(`${M}.earned`, '{name}, earned', { name })
    : messages(`${M}.progress`, '{name}, {progress} of {goal} ({percent} percent)', {
        name,
        progress: String(progress),
        goal: String(goal),
        percent: String(percent),
      })
);
</script>

{#snippet body()}
  <span class="relative mx-auto grid size-14 place-items-center" aria-hidden="true">
    <svg width={size} height={size} viewBox="0 0 {size} {size}" class="absolute inset-0 -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--tx-muted, hsl(var(--muted)))"
        stroke-width={stroke}
      />
      {#if ratio > 0}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={earned ? 'var(--tx-success, hsl(var(--success)))' : 'var(--tx-primary, hsl(var(--primary)))'}
          stroke-width={stroke}
          stroke-linecap="round"
          stroke-dasharray={circumference}
          stroke-dashoffset={offset}
          data-py-badge-ring
        />
      {/if}
    </svg>
    <span
      class="grid size-9 place-items-center rounded-full {earned
        ? 'bg-success/15 text-success'
        : 'bg-muted text-muted-foreground'}"
    >
      <LucideIcon icon={Icon} class="size-4" />
    </span>
  </span>
  <span class="line-clamp-2 text-center text-xs font-medium text-foreground">{name}</span>
  {#if description}
    <span class="line-clamp-2 text-center text-[0.7rem] leading-snug text-muted-foreground"
      >{description}</span
    >
  {/if}
  {#if earnedDate}
    <span class="text-center text-[0.7rem] text-muted-foreground tabular-nums" data-py-badge-earned-at
      >{messages(`${M}.earned-on`, 'Earned {date}', { date: earnedDate })}</span
    >
  {/if}
  <span class="sr-only">{spoken}</span>
{/snippet}

{#if href}
  <a
    {href}
    class="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-surface p-3 text-surface-foreground no-underline shadow-soft transition-colors hover:border-ring/50 focus-visible:outline-2 focus-visible:outline-ring {className}"
    aria-label={spoken}
    data-py-achievement-badge
    data-earned={earned ? 'true' : undefined}
  >
    {@render body()}
  </a>
{:else if onclick}
  <Button
    variant="outline"
    class="flex h-auto w-full flex-col items-center gap-1.5 rounded-xl p-3 text-surface-foreground shadow-soft transition-colors hover:border-ring/50 {className}"
    aria-label={spoken}
    {onclick}
    data-py-achievement-badge
    data-earned={earned ? 'true' : undefined}
  >
    {@render body()}
  </Button>
{:else}
  <Card
    class="flex flex-col items-center gap-1.5 rounded-xl p-3 text-surface-foreground shadow-soft {className}"
    role="img"
    aria-label={spoken}
    data-py-achievement-badge
    data-earned={earned ? 'true' : undefined}
  >
    {@render body()}
  </Card>
{/if}
