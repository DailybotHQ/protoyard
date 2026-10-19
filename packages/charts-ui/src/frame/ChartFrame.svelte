<script lang="ts">
import type { Margin } from '@protoyard/charts';
import { plotArea } from '@protoyard/charts/layout';
import { type Snippet, untrack } from 'svelte';
import { acquireChartAppearance, chartAppearance } from './appearance.svelte.ts';
import { type ChartFrameSize, setChartFrameContext } from './context.ts';

type Props = {
  /** Accessible name and visible heading of the chart. */
  title: string;
  /** Visible subtitle (units, period). */
  description?: string;
  /** Text alternative read by screen readers, e.g. "Signups rose 12% to 1,240 over 30 days". */
  summary?: string;
  /** Hide the visible heading (the accessible name stays). */
  hideTitle?: boolean;
  /** Plot height in CSS pixels; width always follows the container. */
  height?: number;
  margin?: Partial<Margin>;
  loading?: boolean;
  /** `true` or a message: there is no data to plot. */
  empty?: boolean | string;
  /** A message: the data failed to load. */
  error?: string | null;
  /** Retry handler for the error state; a returned promise shows pending feedback. */
  onretry?: () => unknown;
  /** The chart itself; only rendered once the width is known. */
  children?: Snippet<[ChartFrameSize]>;
  /** Below the plot: legend, table toggle, notes. */
  footer?: Snippet;
  class?: string;
};

const DEFAULT_MARGIN: Margin = { top: 8, right: 12, bottom: 28, left: 40 };

let {
  title,
  description,
  summary,
  hideTitle = false,
  height = 240,
  margin: marginProp,
  loading = false,
  empty = false,
  error = null,
  onretry,
  children,
  footer,
  class: className = '',
}: Props = $props();

const uid = $props.id();
const titleId = `${uid}-title`;
const descriptionId = `${uid}-description`;
const summaryId = `${uid}-summary`;

let container = $state<HTMLDivElement | null>(null);
let width = $state(0);
let retrying = $state(false);

const margin = $derived<Margin>({ ...DEFAULT_MARGIN, ...marginProp });
const plot = $derived(plotArea(width, height, margin));
const appearance = $derived(chartAppearance());
const describedBy = $derived(
  [description ? descriptionId : '', summary ? summaryId : ''].filter(Boolean).join(' ') ||
    undefined
);
const emptyMessage = $derived(typeof empty === 'string' ? empty : 'No data for this period');
const rootStyle = $derived(
  [
    ...Object.entries(appearance.variables).map(([name, value]) => `${name}: ${value}`),
    `--py-chart-duration: ${appearance.reducedMotion ? '0ms' : 'var(--py-motion-base, 200ms)'}`,
  ].join('; ')
);

setChartFrameContext({
  get width() {
    return width;
  },
  get height() {
    return height;
  },
  get margin() {
    return margin;
  },
  get plot() {
    return plot;
  },
  get mode() {
    return appearance.mode;
  },
  get reducedMotion() {
    return appearance.reducedMotion;
  },
  get palette() {
    return appearance.palette;
  },
});

// The shared reader writes appearance state; untrack so this effect never depends on it.
$effect(() => untrack(acquireChartAppearance));

$effect(() => {
  const el = container;
  if (!el) return;
  // Measuring writes `width`; untrack so a synchronous ResizeObserver callback cannot loop this effect.
  return untrack(() => {
    width = Math.floor(el.getBoundingClientRect().width);
    if (typeof ResizeObserver !== 'function') return undefined;
    const observer = new ResizeObserver((entries) => {
      width = Math.floor(entries[0]?.contentRect.width ?? 0);
    });
    observer.observe(el);
    return () => observer.disconnect();
  });
});

async function retry() {
  if (!onretry || retrying) return;
  retrying = true;
  try {
    await onretry();
  } finally {
    retrying = false;
  }
}
</script>

<figure
  class="m-0 flex min-w-0 flex-col gap-3 {className}"
  aria-labelledby={titleId}
  aria-describedby={describedBy}
  aria-busy={loading || retrying ? 'true' : undefined}
  data-py-chart=""
  data-motion={appearance.reducedMotion ? 'reduce' : 'full'}
  style={rootStyle}
>
  <figcaption class={hideTitle ? 'sr-only' : 'grid gap-0.5'}>
    <span id={titleId} class="font-heading text-sm font-semibold text-foreground">{title}</span>
    {#if description}
      <span id={descriptionId} class="text-xs text-muted-foreground">{description}</span>
    {/if}
  </figcaption>

  <!--
    contain: inline-size: the plot is drawn at the measured pixel width, so without containment its
    SVG would become the container's min-content width and grid/flex ancestors could never shrink it
    (the chart kept its width when the window narrowed, overflowing the page).
  -->
  <div bind:this={container} class="relative w-full min-w-0 [contain:inline-size]" style:height="{height}px">
    {#if loading}
      <div
        role="status"
        class="absolute inset-0 flex items-end gap-1.5 overflow-hidden rounded-lg p-3"
        aria-label="Loading {title}"
      >
        {#each [40, 65, 50, 80, 60, 90, 70] as bar, i (i)}
          <div class="flex-1 animate-pulse rounded-sm bg-muted" style:height="{bar}%"></div>
        {/each}
      </div>
    {:else if error}
      <div role="alert" class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
        <p class="text-sm font-medium text-destructive">{error}</p>
        {#if onretry}
          <button
            type="button"
            class="inline-flex h-8 items-center rounded-md border border-border bg-surface px-3 text-sm text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
            disabled={retrying}
            aria-busy={retrying ? 'true' : undefined}
            onclick={retry}
          >
            {retrying ? 'Retrying…' : 'Retry'}
          </button>
        {/if}
      </div>
    {:else if empty}
      <div
        class="absolute inset-0 flex items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground"
      >
        {emptyMessage}
      </div>
    {:else if width > 0 && children}
      {@render children({ width, height, plot })}
    {/if}
  </div>

  {#if summary}
    <p id={summaryId} class="sr-only">{summary}</p>
  {/if}
  {#if footer && !loading && !error}
    {@render footer()}
  {/if}
</figure>
