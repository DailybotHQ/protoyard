<script lang="ts">
import type { Theme } from '@protoyard/core';
import { applyAppearance, clearAppearance, type Density } from '@protoyard/themes';
import { Badge, Button, Input, Progress, Switch } from '@protoyard/ui';

/**
 * A scoped theme sample: `applyAppearance` on this element only, so many
 * themes render side by side without touching the document theme.
 */
let {
  theme,
  mode,
  density = 'default',
  compact = false,
}: { theme: Theme; mode: 'light' | 'dark'; density?: Density; compact?: boolean } = $props();

let root: HTMLDivElement | undefined = $state();
let on = $state(true);

$effect(() => {
  if (!root) return;
  const el = root;
  applyAppearance(el, { theme, resolvedMode: mode, density });
  return () => clearAppearance(el);
});
</script>

<div
  bind:this={root}
  class="rounded-xl border border-border bg-background p-4 text-foreground"
  role="group"
  aria-label={`${theme.name} theme, ${mode} mode preview`}
>
  {#if compact}
    <!-- The card around a compact preview already names the theme. -->
    <p class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{mode}</p>
  {:else}
    <div class="flex items-center justify-between gap-2">
      <p class="font-heading text-sm font-semibold">{theme.name} <span class="font-normal text-muted-foreground">· {mode}</span></p>
      <Badge>Primary</Badge>
    </div>
  {/if}
  {#if !compact}
    <div class="mt-3 rounded-lg border border-border bg-surface p-3 text-surface-foreground shadow-soft">
      <p class="text-sm font-medium">Quarterly goals</p>
      <p class="text-xs text-muted-foreground">3 of 5 complete</p>
      <Progress class="mt-2" value={60} ariaLabel="Goals progress" />
    </div>
    <div class="mt-3"><Input aria-label={`${theme.name} ${mode} sample input`} placeholder="Search…" /></div>
  {/if}
  <div class="mt-3 flex flex-wrap items-center gap-2">
    <Button size="sm">Save</Button>
    <Button size="sm" variant="secondary">Cancel</Button>
    <Button size="sm" variant="outline">Outline</Button>
    {#if !compact}<Button size="sm" variant="destructive">Delete</Button>{/if}
  </div>
  <div class="mt-3 flex flex-wrap items-center gap-1.5">
    <Badge variant="success">Paid</Badge>
    <Badge variant="warning">Due</Badge>
    <Badge variant="info">New</Badge>
    <Badge variant="destructive">Failed</Badge>
    {#if !compact}
      <span class="ml-auto text-xs"><Switch bind:checked={on} label="Alerts" /></span>
    {/if}
  </div>
  <div class="mt-3 flex gap-1" aria-hidden="true">
    {#each [1, 2, 3, 4, 5] as i (i)}<span class="h-2 flex-1 rounded-full" style:background-color={`var(--py-chart${i})`}></span>{/each}
  </div>
</div>
