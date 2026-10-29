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
import { Input } from 'texuli/input';
import { Slider } from 'texuli/slider';
import Btn from '../primitives/Btn.svelte';
import Glyph from '../primitives/Glyph.svelte';
import InlineError from '../primitives/InlineError.svelte';
import Section from '../primitives/Section.svelte';
import Segmented from '../primitives/Segmented.svelte';
import SelectField from '../primitives/SelectField.svelte';
import SourceBadge from '../primitives/SourceBadge.svelte';
import Toggle from '../primitives/Toggle.svelte';
import type { DevtoolsState } from '../state.svelte.ts';
import NetworkLog from './NetworkLog.svelte';

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

/** An environment change in flight: controls wait for it (no double triggers). */
const applying = $derived(dt.isBusy('env'));

async function patch(change: EnvironmentPatch, message?: string) {
  if (applying) return;
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
let failureRateDraft = $state(0);
let queuedFailureRate: number | undefined;
let savingFailureRate = false;
$effect(() => {
  latencyDraft = String(env.latencyMs);
});
$effect(() => {
  failureRateDraft = Math.round(env.failureRate * 100);
});

async function commitFailureRate(value: number) {
  queuedFailureRate = value;
  if (savingFailureRate) return;
  savingFailureRate = true;
  try {
    while (queuedFailureRate !== undefined) {
      while (applying) await new Promise((resolve) => setTimeout(resolve, 0));
      const next = queuedFailureRate;
      queuedFailureRate = undefined;
      await dt.run(
        'env',
        () => runtime.overrides.set({ environment: { ...overrideEnv, failureRate: next / 100 } }),
        `Failure rate set to ${next}%.`
      );
    }
  } finally {
    savingFailureRate = false;
    if (queuedFailureRate !== undefined) void commitFailureRate(queuedFailureRate);
  }
}

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
    busy={applying}
    onchange={(network: NetworkMode) => patch({ network })}
  />
  <label class="mt-2.5 flex items-center gap-2 text-[11px] text-muted-foreground">
    <span class="flex-1">Extra latency (ms) <SourceBadge source={sourceOf('latencyMs')} /></span>
    <Input
      type="number"
      min="0"
      max="30000"
      step="100"
      class="min-h-touch w-24 rounded-md border border-input bg-surface px-2 text-right font-mono text-xs text-surface-foreground sm:min-h-7"
      bind:value={latencyDraft}
      onchange={commitLatency}
      disabled={applying}
    />
  </label>
  <p class="mt-1.5 text-[11px] text-muted-foreground">
    Affects services that run through <code class="font-mono">environment.run()</code>, not native browser requests.
  </p>
  <InlineError message={dt.errorFor('env')} />
</Section>

<Section title="Failures" description="Reproducible: the same operation fails the same way on every run.">
  <div class="space-y-2.5" aria-busy={applying || undefined}>
    <label class="flex items-center gap-2 text-[11px] text-muted-foreground">
      <span class="flex-1">Mode <SourceBadge source={sourceOf('failureMode')} /></span>
      <SelectField
        class="min-h-touch rounded-md border border-input bg-surface px-2 text-xs text-surface-foreground sm:min-h-7"
        label="Failure mode"
        disabled={applying}
        value={env.failureMode}
        onchange={(value) => patch({ failureMode: value as EnvironmentState['failureMode'] })}
        options={failureModes.map((mode) => ({ value: mode, label: mode }))}
      />
    </label>
    <label class="block text-[11px] text-muted-foreground">
      <span class="flex items-center justify-between">
        <span>Failure rate <SourceBadge source={sourceOf('failureRate')} /></span>
        <span class="font-mono text-foreground">{failureRateDraft}%</span>
      </span>
      <Slider
        min={0}
        max={100}
        step={5}
        class="mt-1 w-full accent-primary"
        value={failureRateDraft}
        disabled={env.failureMode === 'none'}
        label="Failure rate"
        aria-label="Failure rate"
        getValueText={(value) => `${value}%`}
        onValueChange={(value) => {
          if (typeof value === 'number') failureRateDraft = value;
        }}
        onValueCommit={(value) => {
          if (typeof value === 'number') void commitFailureRate(value);
        }}
      />
    </label>
    <div class="text-[11px] text-muted-foreground">
      <span class="flex items-center gap-1">Scope <SourceBadge source={sourceOf('failureScope')} /></span>
      <p class="mt-0.5">Operation prefixes that fail (e.g. <code class="font-mono">agents.</code>). Empty = every operation.</p>
      <div class="mt-1.5 flex flex-wrap gap-1">
        {#each scope as prefix (prefix)}
          <span class="inline-flex items-center gap-1 rounded bg-muted py-0.5 pr-0.5 pl-1.5 font-mono text-[11px] text-foreground">
            {prefix}
            <Btn
              type="button"
              class="inline-flex size-5 items-center justify-center rounded hover:bg-background focus-visible:outline-2 focus-visible:outline-ring"
              aria-label={`Remove scope ${prefix}`}
              disabled={applying}
              onclick={() => patch({ failureScope: scope.filter((s) => s !== prefix) })}
            >
              <Glyph icon="close" class="size-3" aria-hidden="true" />
            </Btn>
          </span>
        {:else}
          <span class="italic">all operations</span>
        {/each}
      </div>
      <form class="mt-1.5 flex gap-1.5" onsubmit={(e) => { e.preventDefault(); addScope(); }}>
        <label class="sr-only" for="py-dt-scope">Add failure scope prefix</label>
        <Input id="py-dt-scope" class="min-h-touch min-w-0 flex-1 rounded-md border border-input bg-surface px-2 font-mono text-xs text-surface-foreground sm:min-h-7" placeholder="deals." bind:value={newScope} disabled={applying} />
        <Btn type="submit" disabled={applying || !newScope.trim()}><Glyph icon="plus" class="size-3.5" aria-hidden="true" />Add</Btn>
      </form>
    </div>
  </div>
</Section>

<Section title="Subscription & flags">
  <fieldset class="m-0 min-w-0 border-0 p-0" disabled={applying} aria-busy={applying || undefined}>
  <label class="flex items-center gap-2 text-[11px] text-muted-foreground">
    <span class="flex-1">Subscription <SourceBadge source={sourceOf('subscription')} /></span>
    <SelectField
      class="min-h-touch rounded-md border border-input bg-surface px-2 text-xs text-surface-foreground sm:min-h-7"
      label="Subscription"
      value={env.subscription ?? ''}
      onchange={(value) => {
        void patch(value ? { subscription: value as EnvironmentState['subscription'] } : { subscription: undefined });
      }}
      options={[
        { value: '', label: '(organization default)' },
        ...subscriptions.map((status) => ({ value: status, label: status })),
      ]}
    />
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
    <Input id="py-dt-flag" class="min-h-touch min-w-0 flex-1 rounded-md border border-input bg-surface px-2 font-mono text-xs text-surface-foreground sm:min-h-7" placeholder="new-flag" bind:value={newFlag} />
    <Btn type="submit" disabled={!newFlag.trim()}><Glyph icon="plus" class="size-3.5" aria-hidden="true" />Flag</Btn>
  </form>
  </fieldset>
</Section>

<Section title="Reset">
  <Btn
    disabled={Object.keys(overrideEnv).length === 0}
    onclick={() => dt.run('env:clear', () => runtime.overrides.clear(['environment']), 'Environment back to the scenario values.')}
  >
    Clear environment overrides
  </Btn>
</Section>

<NetworkLog {dt} />
