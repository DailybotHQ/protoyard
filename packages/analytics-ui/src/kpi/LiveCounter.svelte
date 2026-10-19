<script lang="ts">
import { untrack } from 'svelte';
import { formatKpi, type KpiUnit } from './format.ts';

type Props = {
  label: string;
  /** A liveQuery result (or any `{ current }`): the counter follows it; it never writes data. */
  query: { readonly current: number | null | undefined };
  unit?: KpiUnit;
  currency?: string;
  /** Count-up length in ms (instant under reduced motion). */
  duration?: number;
  /** At most one screen-reader announcement per this many ms (default 5,000). */
  announceEvery?: number;
  class?: string;
};

let {
  label,
  query,
  unit = 'number',
  currency = 'USD',
  duration = 600,
  announceEvery = 5000,
  class: className = '',
}: Props = $props();

const reduced =
  typeof document !== 'undefined' &&
  (document.documentElement.dataset.pyMotion === 'reduce' ||
    (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches));

let shown = $state<number | null>(null);
let spoken = $state('');
let lastSpoken = Number.NEGATIVE_INFINITY;
let pendingSpeech: ReturnType<typeof setTimeout> | undefined;
let frame: ReturnType<typeof setTimeout> | number | undefined;

const nextFrame = (fn: () => void) =>
  typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(fn, 16);
const cancelFrame = (id: ReturnType<typeof setTimeout> | number | undefined) => {
  if (id === undefined) return;
  if (typeof cancelAnimationFrame === 'function' && typeof id === 'number')
    cancelAnimationFrame(id);
  else clearTimeout(id as ReturnType<typeof setTimeout>);
};

function announce(target: number) {
  const say = () => {
    lastSpoken = performance.now();
    spoken = `${label}: ${formatKpi(target, unit, currency)}`;
  };
  clearTimeout(pendingSpeech);
  const wait = lastSpoken + announceEvery - performance.now();
  if (wait <= 0) say();
  else pendingSpeech = setTimeout(say, wait);
}

$effect(() => {
  const target = query.current;
  if (target === null || target === undefined || !Number.isFinite(target)) return;
  untrack(() => {
    cancelFrame(frame);
    const from = shown;
    announce(target);
    if (reduced || from === null || duration <= 0) {
      shown = target;
      return;
    }
    // Visual count-up only; the data already changed.
    const start = performance.now();
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      shown = t >= 1 ? target : from + (target - from) * eased;
      if (t < 1) frame = nextFrame(tick);
    };
    frame = nextFrame(tick);
  });
});

$effect(() => () => {
  cancelFrame(frame);
  clearTimeout(pendingSpeech);
});

const isInteger = $derived(Number.isInteger(query.current ?? 0));
</script>

<div class="inline-flex flex-col {className}" data-live-counter="" data-motion={reduced ? 'reduce' : 'full'}>
  <span class="text-xs text-muted-foreground">{label}</span>
  <span class="font-heading text-2xl font-semibold tabular-nums" aria-hidden="true" data-counter-value="">
    {shown === null ? '—' : formatKpi(isInteger ? Math.round(shown) : shown, unit, currency)}
  </span>
  <span class="sr-only" aria-live="polite" data-counter-live="">{spoken}</span>
</div>
