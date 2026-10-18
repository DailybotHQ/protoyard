<script lang="ts">
import { Mic, MicOff, PhoneOff, Waves } from '@lucide/svelte';
import type { VoiceMode, VoicePhase, VoiceSession } from '@protoyard/ai';
import { onDestroy } from 'svelte';
import VoiceOrb from './VoiceOrb.svelte';

/**
 * Simulated voice chat panel: push-to-talk or hands-free, live captions
 * (always visible), animated orb, and optional local mic level meter.
 * Captions stay on for accessibility even when speechSynthesis is available.
 */
let {
  session,
  enableMicMeter = false,
  class: className = '',
}: {
  session: VoiceSession;
  /** Opt-in local amplitude meter (getUserMedia). Never records audio. */
  enableMicMeter?: boolean;
  class?: string;
} = $props();

// svelte-ignore state_referenced_locally -- session is an imperative handle; we poll it.
let phase = $state<VoicePhase>(session.phase);
// svelte-ignore state_referenced_locally
let mode = $state<VoiceMode>(session.mode);
// svelte-ignore state_referenced_locally
let caption = $state(session.caption);
// svelte-ignore state_referenced_locally
let captionRole = $state(session.captionRole);
// svelte-ignore state_referenced_locally
let transcript = $state(session.transcript);
let level = $state(0);
let micError = $state<string | null>(null);
let micDispose: (() => void) | null = null;
let poll = 0;

function sync() {
  phase = session.phase;
  mode = session.mode;
  caption = session.caption;
  captionRole = session.captionRole;
  transcript = session.transcript;
  level = session.micLevel;
}

onDestroy(() => {
  if (poll) cancelAnimationFrame(poll);
  micDispose?.();
});

$effect(() => {
  const tick = () => {
    sync();
    poll = requestAnimationFrame(tick);
  };
  poll = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(poll);
});

$effect(() => {
  if (!enableMicMeter) {
    micDispose?.();
    micDispose = null;
    micError = null;
    return;
  }
  let cancelled = false;
  void session
    .enableMicLevelMeter()
    .then((dispose) => {
      if (cancelled) dispose();
      else micDispose = dispose;
    })
    .catch((error: unknown) => {
      micError = error instanceof Error ? error.message : String(error);
    });
  return () => {
    cancelled = true;
    micDispose?.();
    micDispose = null;
  };
});

function setMode(next: VoiceMode) {
  session.setMode(next);
  mode = next;
}

async function onPttDown() {
  if (mode !== 'push-to-talk') return;
  await session.startListening();
  sync();
}

async function onPttUp() {
  if (mode !== 'push-to-talk') return;
  await session.stopListening();
  sync();
}

async function toggleHandsFree() {
  if (mode !== 'hands-free') {
    setMode('hands-free');
    return;
  }
  if (phase === 'idle' || phase === 'interrupted') {
    await session.startListening();
  } else {
    session.interrupt();
  }
  sync();
}
</script>

<section
  class="py-voice-panel flex min-h-0 flex-col gap-4 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-soft {className}"
  data-py-voice-panel=""
  data-phase={phase}
  data-mode={mode}
  aria-label="Simulated voice chat"
>
  <header class="flex flex-wrap items-center justify-between gap-2">
    <div>
      <p class="text-sm font-semibold">Voice (simulated)</p>
      <p class="text-xs text-muted-foreground">
        No cloud speech APIs. Captions always on.
        {session.muted ? ' Speech is caption-only in this browser.' : ' Local speechSynthesis may speak replies.'}
      </p>
    </div>
    <div class="flex gap-1 rounded-lg border border-border p-1" role="group" aria-label="Voice mode">
      <button
        type="button"
        class="rounded-md px-2.5 py-1.5 text-xs font-medium {mode === 'push-to-talk'
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted'}"
        aria-pressed={mode === 'push-to-talk'}
        onclick={() => setMode('push-to-talk')}
      >
        Push to talk
      </button>
      <button
        type="button"
        class="rounded-md px-2.5 py-1.5 text-xs font-medium {mode === 'hands-free'
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted'}"
        aria-pressed={mode === 'hands-free'}
        onclick={() => setMode('hands-free')}
      >
        Hands-free
      </button>
    </div>
  </header>

  <VoiceOrb {phase} level={Math.max(level, phase === 'speaking' ? 0.45 : 0)} />

  <div
    class="min-h-16 rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2"
    data-py-voice-captions=""
    aria-live="polite"
  >
    <p class="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
      {captionRole === 'assistant' ? 'Assistant caption' : captionRole === 'user' ? 'You (simulated)' : 'Captions'}
    </p>
    <p class="mt-1 text-sm leading-relaxed">
      {caption || transcript || 'Captions appear here while you talk or the assistant replies.'}
    </p>
  </div>

  <div class="flex flex-wrap items-center gap-2">
    {#if mode === 'push-to-talk'}
      <button
        type="button"
        class="inline-flex min-h-touch items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.98]"
        aria-label={phase === 'listening' ? 'Release to send' : 'Hold to talk'}
        onpointerdown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          void onPttDown();
        }}
        onpointerup={() => void onPttUp()}
        onpointercancel={() => void onPttUp()}
        onpointerleave={(e) => {
          if (e.buttons === 0) return;
          void onPttUp();
        }}
      >
        <Mic class="size-4" aria-hidden="true" />
        {phase === 'listening' ? 'Release to send' : 'Hold to talk'}
      </button>
    {:else}
      <button
        type="button"
        class="inline-flex min-h-touch items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label={phase === 'idle' ? 'Start hands-free listening' : 'Stop voice turn'}
        onclick={() => void toggleHandsFree()}
      >
        <Waves class="size-4" aria-hidden="true" />
        {phase === 'idle' || phase === 'interrupted' ? 'Start listening' : 'Listening…'}
      </button>
    {/if}

    <button
      type="button"
      class="inline-flex min-h-touch items-center gap-2 rounded-full border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-40"
      aria-label="Interrupt assistant"
      disabled={phase !== 'speaking' && phase !== 'thinking' && phase !== 'transcribing'}
      onclick={() => {
        session.interrupt();
        sync();
      }}
    >
      <PhoneOff class="size-4" aria-hidden="true" />
      Interrupt
    </button>
  </div>

  {#if enableMicMeter}
    <p class="flex items-center gap-2 text-xs text-muted-foreground" data-py-voice-mic="">
      {#if micError}
        <MicOff class="size-3.5 shrink-0" aria-hidden="true" />
        Mic level unavailable: {micError}
      {:else}
        <Mic class="size-3.5 shrink-0" aria-hidden="true" />
        Local mic level only (not recorded): {Math.round(level * 100)}%
      {/if}
    </p>
  {/if}
</section>
