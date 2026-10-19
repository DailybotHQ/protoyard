<script lang="ts">
import type { DeviceSpec } from '@protoyard/core';
import { safeAreaOf } from '@protoyard/core';
import { useClock, useEnvironment, usePrincipal } from '../../bindings.svelte.ts';
import { statusBarHeightOf } from './registry.ts';

/** Brand-neutral device chrome driven by the prototype's simulated runtime. */
let { spec }: { spec: DeviceSpec } = $props();

const clock = useClock();
const environment = useEnvironment();
const principal = usePrincipal();

const insets = $derived(safeAreaOf(spec));
/** The app's `--py-safe-top` is at least this tall (screenLayoutOf), so it never covers the app. */
const height = $derived(statusBarHeightOf(spec));
const style = $derived(spec.statusBar.style);
const now = $derived(clock.now);
const locale = $derived(
  principal.current?.persona.locale ??
    (typeof navigator === 'undefined' ? 'en-US' : navigator.language)
);
const clockLabel = $derived(
  new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(now)
);
const network = $derived(environment.current);
const signalState = $derived(
  network.network === 'offline'
    ? 'offline'
    : network.network === 'slow' || network.latencyMs >= 1_000
      ? 'degraded'
      : 'strong'
);
const signalLabel = $derived(
  signalState === 'offline'
    ? 'Offline (simulated)'
    : signalState === 'degraded'
      ? 'Signal degraded (simulated)'
      : 'Signal strong (simulated)'
);
</script>

{#if style !== 'none'}
  <div
    data-py-status-bar
    data-py-status-style={style}
    class="pointer-events-none absolute inset-x-0 top-0 z-[30] flex items-end bg-background px-5 pb-1.5 text-[12px] leading-none font-semibold tracking-tight text-foreground"
    style:height="{height}px"
    style:padding-top="{Math.max(0, insets.top - spec.statusBar.height)}px"
  >
    <time class="min-w-[3.25rem] tabular-nums" datetime={now.toISOString()}>{clockLabel}</time>
    <div class="min-w-0 flex-1" aria-hidden="true"></div>
    <div class="flex items-center gap-1.5">
      <span role="img" aria-label={signalLabel} data-py-signal={signalState}>
        {#if signalState === 'offline'}
          <svg width="16" height="12" viewBox="0 0 16 12" fill="none" aria-hidden="true">
            <path d="M1 2.5 15 10M15 2.5 1 10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          </svg>
        {:else}
          <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor" aria-hidden="true">
            <rect x="0" y="8" width="2.5" height="4" rx="0.5" />
            <rect x="3.5" y="5.5" width="2.5" height="6.5" rx="0.5" />
            <rect x="7" y="3" width="2.5" height="9" rx="0.5" />
            <rect x="10.5" y="0.5" width="2.5" height="11.5" rx="0.5" opacity={signalState === 'degraded' ? '0.2' : '1'} />
          </svg>
        {/if}
      </span>
      <svg width="24" height="12" viewBox="0 0 24 12" fill="none" aria-hidden="true">
        <rect x="0.5" y="1" width="20" height="10" rx="2.5" stroke="currentColor" stroke-width="1.2" />
        <rect x="2" y="2.75" width="14" height="6.5" rx="1.2" fill="currentColor" />
        <path d="M22 4.5v3a1.75 1.75 0 0 0 0-3Z" fill="currentColor" opacity="0.45" />
      </svg>
    </div>
  </div>
{/if}
