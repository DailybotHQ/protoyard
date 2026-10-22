<script lang="ts">
import {
  AUTONOMY_LEVELS,
  type AutonomyConfig,
  type AutonomyLevel,
  CAP_REASON,
  setLevel,
} from '@protoyard/ai';
import { AUTONOMY_LEVEL_LABELS, areaLabel } from './labels.ts';

/**
 * Per-area autonomy level radios. Calls `onChange` with the next config from
 * `setLevel` (pure). Caps disable higher options. Simulated product settings.
 */
let {
  config,
  area,
  legend = 'Autonomy level',
  disabled = false,
  onChange,
  class: className = '',
}: {
  config: AutonomyConfig;
  area: string;
  legend?: string;
  disabled?: boolean;
  /** Required: receive the next AutonomyConfig after a level pick. */
  onChange: (next: AutonomyConfig, level: AutonomyLevel) => unknown | Promise<unknown>;
  class?: string;
} = $props();

let pending = $state(false);
let error = $state('');
const current = $derived(config.levels[area] ?? 1);
const cap = $derived(config.caps[area]);

async function pick(level: AutonomyLevel): Promise<void> {
  if (disabled || pending || level === current) return;
  pending = true;
  error = '';
  try {
    const next = setLevel(config, area, level);
    await Promise.resolve(onChange(next, level));
  } catch (err) {
    error = err instanceof Error ? err.message : 'Could not update autonomy.';
  } finally {
    pending = false;
  }
}
</script>

<fieldset
  class="m-0 grid gap-2 border-0 p-0 {className}"
  data-py-autonomy-picker
  data-area={area}
  disabled={disabled || pending}
>
  <legend class="mb-1 px-0 text-sm font-semibold text-foreground">
    {legend}
    <span class="font-normal text-muted-foreground"> · {areaLabel(area)}</span>
  </legend>
  <p class="m-0 text-xs text-muted-foreground">
    Simulated settings. Levels are not security boundaries.
  </p>
  <div class="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="{legend} for {areaLabel(area)}">
    {#each AUTONOMY_LEVELS as level (level)}
      {@const meta = AUTONOMY_LEVEL_LABELS[level]}
      {@const capped = cap !== undefined && level > cap}
      <label
        class="relative grid min-h-11 cursor-pointer gap-0.5 rounded-lg border border-border bg-surface px-3 py-2.5 pl-9 text-left {current ===
        level
          ? 'border-primary bg-primary/5'
          : ''} {capped ? 'cursor-not-allowed opacity-60' : ''}"
      >
        <input
          type="radio"
          class="absolute top-3 left-3"
          name="autonomy-{area}"
          value={level}
          checked={current === level}
          disabled={capped || disabled || pending}
          aria-label={`Level ${level}: ${meta.name}`}
          onchange={() => void pick(level)}
        />
        <span class="text-sm font-semibold text-foreground" aria-hidden="true"
          >{level}. {meta.name}</span
        >
        <span class="text-xs text-muted-foreground">{meta.definition}</span>
        {#if capped}
          <span class="text-xs text-muted-foreground"
            >{area === 'external' ? CAP_REASON : `Capped at level ${String(cap)}.`}</span
          >
        {/if}
      </label>
    {/each}
  </div>
  {#if pending}
    <p class="m-0 text-xs text-muted-foreground" role="status" aria-live="polite">Saving…</p>
  {/if}
  {#if error}
    <p class="m-0 text-sm text-destructive" role="alert">{error}</p>
  {/if}
</fieldset>
