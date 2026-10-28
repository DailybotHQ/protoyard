<script lang="ts">
import { Flag, Megaphone, Rocket, TriangleAlert } from '@lucide/svelte';
import type { DateRange } from '@protoyard/analytics';
import { Button } from '@protoyard/ui';
import { Icon } from 'texuli/icons';
import { LucideIcon } from 'texuli/icons/lucide';
import type { Annotation } from '../database/schema.ts';
import { annotationMarks } from '../domain/metrics.ts';
import { formatDate } from '../lib/format.ts';

/**
 * Release notes, incidents and campaigns across the selected range, under the
 * charts. charts-ui has no annotation layer yet, so this strip spans the same
 * dates as the chart rather than its exact plot pixels; the list below names
 * every note with its date (the accessible version).
 */
let {
  annotations,
  range,
  onremove,
}: {
  annotations: readonly Annotation[];
  range: DateRange;
  /** Shown when the actor may delete a note; returns the service promise. */
  onremove?: (annotation: Annotation) => Promise<unknown>;
} = $props();

const marks = $derived(annotationMarks(annotations, range));
const ICONS = { release: Rocket, incident: TriangleAlert, campaign: Megaphone } as const;
const LABELS = { release: 'Release', incident: 'Incident', campaign: 'Campaign' } as const;
</script>

{#if marks.length > 0}
  <section aria-label="Annotations" class="grid gap-2">
    <div class="relative h-6 rounded-md bg-muted/60" aria-hidden="true">
      {#each marks as mark (mark.id)}
        {@const Glyph = ICONS[mark.kind] ?? Flag}
        <span
          class="absolute top-1/2 grid size-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-border bg-surface {mark.kind === 'incident' ? 'text-destructive' : 'text-primary'}"
          style:left="{(mark.position * 100).toFixed(2)}%"
          title="{formatDate(mark.at)}: {mark.title}"
        >
          <LucideIcon icon={Glyph} class="size-3" />
        </span>
      {/each}
    </div>
    <ul class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {#each marks as mark (mark.id)}
        <li class="inline-flex items-center gap-1">
          <span class="font-medium text-foreground">{LABELS[mark.kind]}</span>
          <time datetime={mark.at}>{formatDate(mark.at)}</time>
          <span>· {mark.title}</span>
          {#if onremove}
            <!-- Returns the service promise, so the button shows it is pending. -->
            <Button variant="ghost" size="icon" class="size-6" aria-label="Remove annotation {mark.title}" onclick={() => onremove?.(mark)}>
              <Icon icon="close" class="size-3" aria-hidden="true" />
            </Button>
          {/if}
        </li>
      {/each}
    </ul>
  </section>
{/if}
