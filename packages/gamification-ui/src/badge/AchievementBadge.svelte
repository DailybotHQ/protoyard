<script lang="ts">
import { Award } from '@lucide/svelte';
import type { IconComponent } from '@protoyard/ui';
import { Button } from 'texuli/button';
import { Card } from 'texuli/card';
import { LucideIcon } from 'texuli/icons/lucide';

/**
 * Achievement tile with an optional circular progress ring. `progress`/`goal`
 * come from `@protoyard/gamification` badgeProgress rows.
 */
let {
  name,
  description,
  earned = false,
  progress = 0,
  goal = 1,
  icon: Icon = Award,
  onclick,
  class: className = '',
}: {
  name: string;
  description?: string;
  earned?: boolean;
  progress?: number;
  goal?: number;
  icon?: IconComponent;
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
const spoken = $derived(
  earned ? `${name}, earned` : `${name}, ${progress} of ${goal} (${percent} percent)`
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
  <span class="sr-only">{spoken}</span>
{/snippet}

{#if onclick}
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
