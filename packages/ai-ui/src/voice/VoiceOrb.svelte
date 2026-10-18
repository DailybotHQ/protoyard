<script lang="ts">
import type { VoicePhase } from '@protoyard/ai';

/**
 * Animated orb / waveform for simulated voice. Purely decorative levels —
 * driven by phase and optional mic amplitude, never by recorded audio.
 */
let {
  phase = 'idle',
  level = 0,
  label = 'Simulated voice activity',
}: {
  phase?: VoicePhase;
  /** 0–1 amplitude (mic meter or speech energy). */
  level?: number;
  label?: string;
} = $props();

const active = $derived(
  phase === 'listening' || phase === 'transcribing' || phase === 'speaking' || phase === 'thinking'
);
const bars = $derived(
  Array.from({ length: 5 }, (_, i) => {
    const wave = active ? 0.35 + level * 0.55 + (i % 3) * 0.08 : 0.18;
    return Math.min(1, wave);
  })
);
</script>

<div
  class="py-voice-orb"
  data-py-voice-orb=""
  data-phase={phase}
  role="img"
  aria-label={label}
>
  <div class="py-voice-orb__glow" class:py-voice-orb__glow--active={active} aria-hidden="true"></div>
  <div class="py-voice-orb__core" data-phase={phase} aria-hidden="true">
    {#each bars as height, index (index)}
      <span
        class="py-voice-orb__bar"
        style:height="{Math.round(height * 100)}%"
        style:animation-delay="{index * 80}ms"
      ></span>
    {/each}
  </div>
  <p class="py-voice-orb__phase text-xs text-muted-foreground">
    {#if phase === 'listening'}Listening…
    {:else if phase === 'transcribing'}Transcribing…
    {:else if phase === 'thinking'}Thinking…
    {:else if phase === 'speaking'}Speaking…
    {:else if phase === 'interrupted'}Interrupted
    {:else}Ready{/if}
  </p>
</div>
