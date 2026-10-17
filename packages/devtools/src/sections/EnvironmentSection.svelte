<script lang="ts">
import { Plus, X } from '@lucide/svelte';
import {
  type EnvironmentPatch,
  type EnvironmentState,
  FailureModeSchema,
  type NetworkMode,
  SubscriptionStatusSchema,
  type ValueSource,
} from '@protoyard/core';
import Btn from '../primitives/Btn.svelte';
import Section from '../primitives/Section.svelte';
import Segmented from '../primitives/Segmented.svelte';
import SourceBadge from '../primitives/SourceBadge.svelte';
import Toggle from '../primitives/Toggle.svelte';
import type { DevtoolsState } from '../state.svelte.ts';

let { dt }: { dt: DevtoolsState } = $props();
const runtime = $derived(dt.runtime);
const env = $derived(dt.environment);
const overrideEnv = $derived(dt.overrides.environment ?? {});
const scenarioEnv = $derived(dt.active?.scenario.environment ?? {});

function sourceOf(key: keyof EnvironmentState): ValueSource {
  if (overrideEnv[key] !== undefined) return 'override';
  if (scenarioEnv[key] !== undefined) return 'scenario';
  if (key === 'subscription' && dt.active?.scenario.organization.subscription) return 'scenario';
  return 'default';
}
function flagSource(flag: string): ValueSource {
  if (overrideEnv.featureFlags?.[flag] !== undefined) return 'override';
  if (
    scenarioEnv.featureFlags?.[flag] !== undefined ||
    dt.active?.scenario.organization.featureFlags[flag] !== undefined
  )
    return 'scenario';
  return 'default';
}

async function patch(change: EnvironmentPatch, message?: string) {
  await dt.run(
    'env',
    () => runtime.overrides.set({ environment: { ...overrideEnv, ...change } }),
    message
  );
}

const failureModes = FailureModeSchema.options;
const subscriptions = SubscriptionStatusSchema.options;
const flags = $derived(Object.entries(env.featureFlags).sort(([a], [b]) => a.localeCompare(b)));
const scope = $derived(env.failureScope ?? []);
let newFlag = $state('');
let newScope = $state('');
// svelte-ignore state_referenced_locally
let latencyDraft = $state(String(env.latencyMs));
$effect(() => {
  latencyDraft = String(env.latencyMs);
});

function commitLatency() {
  const value = Number.parseInt(latencyDraft, 10);
  if (!Number.isFinite(value) || value < 0 || value > 30_000) {
    dt.notify('error', 'Latency must be between 0 and 30000 ms.');
    latencyDraft = String(env.latencyMs);
    return;
  }
  if (value !== env.latencyMs) void patch({ latencyMs: value }, `Latency set to ${value} ms.`);
}

function addFlag() {
  const name = newFlag.trim();
  if (!/^[A-Za-z0-9_.:-]{1,48}$/.test(name)) {
    dt.notify('error', 'Flag names use letters, digits, dots, dashes or underscores.');
    return;
  }
  void patch(
    { featureFlags: { ...(overrideEnv.featureFlags ?? {}), [name]: true } },
    `Flag “${name}” enabled.`
  );
  newFlag = '';
}

function addScope() {
  const prefix = newScope.trim();
  if (!prefix || scope.includes(prefix)) return;
  void patch({ failureScope: [...scope, prefix] });
  newScope = '';
}
</script>

<Section title="Network">
  {#snippet actions()}<SourceBadge source={sourceOf('network')} />{/snippet}
  <Segmented
    label="Network mode"
    value={env.network}
    options={[
      { value: 'online', label: 'Online' },
      { value: 'slow', label: 'Slow' },
      { value: 'offline', label: 'Offline' },
    ]}
    onchange={(network: NetworkMode) => patch({ network })}
  />
  <label class="mt-2.5 flex items-center gap-2 text-[11px] text-muted-foreground">
    <span class="flex-1">Extra latency (ms) <SourceBadge source={sourceOf('latencyMs')} /></span>
    <input
      type="number"
      min="0"
      max="30000"
      step="100"
      class="min-h-touch w-24 rounded-md border border-input bg-surface px-2 text-right font-mono text-xs text-surface-foreground sm:min-h-7"
      bind:value={latencyDraft}
      onchange={commitLatency}
    />
  </label>
  <p class="mt-1.5 text-[11px] text-muted-foreground">
    Affects services that run through <code class="font-mono">environment.run()</code>, not native browser requests.
  </p>
</Section>

<Section title="Failures" description="Reproducible: the same operation fails the same way on every run.">
  <div class="space-y-2.5">
    <label class="flex items-center gap-2 text-[11px] text-muted-foreground">
      <span class="flex-1">Mode <SourceBadge source={sourceOf('failureMode')} /></span>
      <select
        class="min-h-touch rounded-md border border-input bg-surface px-2 text-xs text-surface-foreground sm:min-h-7"
        value={env.failureMode}
        onchange={(e) => patch({ failureMode: (e.currentTarget as HTMLSelectElement).value as EnvironmentState['failureMode'] })}
      >
        {#each failureModes as mode (mode)}<option value={mode}>{mode}</option>{/each}
      </select>
    </label>
    <label class="block text-[11px] text-muted-foreground">
      <span class="flex items-center justify-between">
        <span>Failure rate <SourceBadge source={sourceOf('failureRate')} /></span>
        <span class="font-mono text-foreground">{Math.round(env.failureRate * 100)}%</span>
      </span>
      <input
        type="range"
        min="0"
        max="100"
        step="5"
        class="mt-1 w-full accent-primary"
        value={Math.round(env.failureRate * 100)}
        disabled={env.failureMode === 'none'}
        onchange={(e) => patch({ failureRate: Number((e.currentTarget as HTMLInputElement).value) / 100 })}
      />
    </label>
    <div class="text-[11px] text-muted-foreground">
      <span class="flex items-center gap-1">Scope <SourceBadge source={sourceOf('failureScope')} /></span>
      <p class="mt-0.5">Operation prefixes that fail (e.g. <code class="font-mono">agents.</code>). Empty = every operation.</p>
      <div class="mt-1.5 flex flex-wrap gap-1">
        {#each scope as prefix (prefix)}
          <span class="inline-flex items-center gap-1 rounded bg-muted py-0.5 pr-0.5 pl-1.5 font-mono text-[11px] text-foreground">
            {prefix}
            <button
              type="button"
              class="inline-flex size-5 items-center justify-center rounded hover:bg-background focus-visible:outline-2 focus-visible:outline-ring"
              aria-label={`Remove scope ${prefix}`}
              onclick={() => patch({ failureScope: scope.filter((s) => s !== prefix) })}
            >
              <X class="size-3" aria-hidden="true" />
            </button>
          </span>
        {:else}
          <span class="italic">all operations</span>
        {/each}
      </div>
      <form class="mt-1.5 flex gap-1.5" onsubmit={(e) => { e.preventDefault(); addScope(); }}>
        <label class="sr-only" for="py-dt-scope">Add failure scope prefix</label>
        <input id="py-dt-scope" class="min-h-touch min-w-0 flex-1 rounded-md border border-input bg-surface px-2 font-mono text-xs text-surface-foreground sm:min-h-7" placeholder="deals." bind:value={newScope} />
        <Btn type="submit" disabled={!newScope.trim()}><Plus class="size-3.5" aria-hidden="true" />Add</Btn>
      </form>
    </div>
  </div>
</Section>

<Section title="Subscription & flags">
  <label class="flex items-center gap-2 text-[11px] text-muted-foreground">
    <span class="flex-1">Subscription <SourceBadge source={sourceOf('subscription')} /></span>
    <select
      class="min-h-touch rounded-md border border-input bg-surface px-2 text-xs text-surface-foreground sm:min-h-7"
      value={env.subscription ?? ''}
      onchange={(e) => {
        const value = (e.currentTarget as HTMLSelectElement).value;
        void patch(value ? { subscription: value as EnvironmentState['subscription'] } : { subscription: undefined });
      }}
    >
      <option value="">(organization default)</option>
      {#each subscriptions as status (status)}<option value={status}>{status}</option>{/each}
    </select>
  </label>
  <ul class="mt-2.5 space-y-0.5">
    {#each flags as [flag, enabled] (flag)}
      <li class="flex items-center justify-between gap-2">
        <span class="flex min-w-0 items-center gap-1.5">
          <code class="truncate font-mono text-[11px]">{flag}</code>
          <SourceBadge source={flagSource(flag)} />
        </span>
        <Toggle
          checked={enabled}
          label={`Feature flag ${flag}`}
          hideLabel
          onchange={(value) => patch({ featureFlags: { ...(overrideEnv.featureFlags ?? {}), [flag]: value } })}
        />
      </li>
    {:else}
      <li class="text-[11px] text-muted-foreground">No feature flags defined by this scenario.</li>
    {/each}
  </ul>
  <form class="mt-2 flex gap-1.5" onsubmit={(e) => { e.preventDefault(); addFlag(); }}>
    <label class="sr-only" for="py-dt-flag">New feature flag</label>
    <input id="py-dt-flag" class="min-h-touch min-w-0 flex-1 rounded-md border border-input bg-surface px-2 font-mono text-xs text-surface-foreground sm:min-h-7" placeholder="new-flag" bind:value={newFlag} />
    <Btn type="submit" disabled={!newFlag.trim()}><Plus class="size-3.5" aria-hidden="true" />Flag</Btn>
  </form>
</Section>

<Section title="Reset">
  <Btn
    disabled={Object.keys(overrideEnv).length === 0}
    onclick={() => dt.run('env:clear', () => runtime.overrides.clear(['environment']), 'Environment back to the scenario values.')}
  >
    Clear environment overrides
  </Btn>
</Section>
