<script lang="ts">
import type { AiClock } from '@protoyard/ai';
import {
  createVoiceSession,
  type VoiceMode as VoiceModeType,
  type VoiceState,
} from '@protoyard/ai/voice';
import { onDestroy, onMount } from 'svelte';

interface Props {
  clock: AiClock;
  transcripts?: readonly string[];
  reply?: string;
  transcriptDelayMs?: number;
  handsFreeIntervalMs?: number;
  showMicLevelMeter?: boolean;
  onTranscript?: (transcript: string) => void;
}

const DEFAULT_TRANSCRIPTS = [
  'Summarize the latest project update.',
  'What should I focus on next?',
  'Draft a short response for the team.',
];

let {
  clock,
  transcripts = DEFAULT_TRANSCRIPTS,
  reply = '',
  transcriptDelayMs,
  handsFreeIntervalMs,
  showMicLevelMeter = false,
  onTranscript,
}: Props = $props();

let voiceState = $state<VoiceState>('idle');
let mode = $state<VoiceModeType>('push-to-talk');
let transcript = $state('');
let speechAvailable = $state(false);
let micLevel = $state(0);
let micEnabled = $state(false);
let micError = $state('');
let mediaStream: MediaStream | null = null;
let audioContext: AudioContext | null = null;
let animationFrame = 0;
let utterance: SpeechSynthesisUtterance | null = null;
let lastSpokenReply = '';

const session = $derived.by(() =>
  createVoiceSession({
    clock,
    transcripts,
    ...(transcriptDelayMs !== undefined ? { transcriptDelayMs } : {}),
    ...(handsFreeIntervalMs !== undefined ? { handsFreeIntervalMs } : {}),
    onTranscript: (value) => {
      transcript = value;
      onTranscript?.(value);
    },
    onStateChange: (state) => (voiceState = state),
  })
);

$effect(() => {
  const currentSession = session;
  return () => currentSession.stop();
});

onMount(() => {
  speechAvailable =
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    'SpeechSynthesisUtterance' in window;
});

$effect(() => {
  const value = reply.trim();
  if (!value || value === lastSpokenReply || !speechAvailable) return;
  lastSpokenReply = value;
  window.speechSynthesis.cancel();
  session.startSpeaking();
  utterance = new SpeechSynthesisUtterance(value);
  utterance.onend = () => session.finishSpeaking();
  utterance.onerror = () => session.finishSpeaking();
  window.speechSynthesis.speak(utterance);
});

function chooseMode(nextMode: VoiceModeType): void {
  mode = nextMode;
  session.stop();
  if (nextMode === 'hands-free') session.start('hands-free');
}

function togglePushToTalk(): void {
  if (voiceState === 'listening') {
    void session.finishListening();
  } else {
    mode = 'push-to-talk';
    session.start('push-to-talk');
  }
}

function interrupt(): void {
  session.interrupt();
  if (speechAvailable) window.speechSynthesis.cancel();
  utterance = null;
}

async function toggleMicMeter(): Promise<void> {
  micError = '';
  if (micEnabled) {
    stopMicMeter();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === 'undefined') {
    micError = 'A local microphone level meter is unavailable in this browser.';
    return;
  }
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(mediaStream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    micEnabled = true;
    const sampleLevel = () => {
      if (!audioContext || !micEnabled) return;
      analyser.getByteTimeDomainData(samples);
      let squareSum = 0;
      for (const sample of samples) {
        const centered = (sample - 128) / 128;
        squareSum += centered * centered;
      }
      micLevel = Math.min(1, Math.sqrt(squareSum / samples.length) * 3);
      animationFrame = requestAnimationFrame(sampleLevel);
    };
    sampleLevel();
  } catch {
    stopMicMeter();
    micError = 'Microphone access was not enabled. Voice simulation still works with captions.';
  }
}

function stopMicMeter(): void {
  cancelAnimationFrame(animationFrame);
  mediaStream?.getTracks().forEach((track) => {
    track.stop();
  });
  mediaStream = null;
  if (audioContext && audioContext.state !== 'closed') void audioContext.close();
  audioContext = null;
  micEnabled = false;
  micLevel = 0;
}

onDestroy(() => {
  session.stop();
  if (speechAvailable) window.speechSynthesis.cancel();
  stopMicMeter();
});
</script>

<section class="voice-panel rounded-2xl border border-border bg-surface p-5 text-foreground" aria-label="Simulated voice chat">
  <div class="flex items-center justify-center py-4">
    <div class={`voice-orb ${voiceState}`} aria-hidden="true">
      <span></span><span></span><span></span><span></span><span></span>
    </div>
  </div>
  <p class="text-center text-sm font-medium">Voice chat <span class="ml-1 rounded-full border border-border px-2 py-0.5 text-[0.65rem] text-muted-foreground">Simulated</span></p>
  <p class="mt-1 text-center text-xs text-muted-foreground">Transcripts are scripted and timed by the simulated clock. No audio is recorded or sent.</p>

  <div class="mt-4 flex justify-center gap-2" role="group" aria-label="Voice mode">
    <button type="button" class={`min-h-10 rounded-lg border px-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${mode === 'push-to-talk' ? 'border-primary text-primary' : 'border-border hover:bg-muted'}`} aria-pressed={mode === 'push-to-talk'} onclick={() => chooseMode('push-to-talk')}>Push to talk</button>
    <button type="button" class={`min-h-10 rounded-lg border px-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${mode === 'hands-free' ? 'border-primary text-primary' : 'border-border hover:bg-muted'}`} aria-pressed={mode === 'hands-free'} onclick={() => chooseMode(mode === 'hands-free' ? 'push-to-talk' : 'hands-free')}>{mode === 'hands-free' ? 'Stop hands-free' : 'Hands-free'}</button>
  </div>
  {#if mode === 'push-to-talk'}
    <div class="mt-3 flex justify-center">
      <button type="button" class="min-h-11 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-pressed={voiceState === 'listening' || voiceState === 'transcribing'} onclick={togglePushToTalk} disabled={voiceState === 'transcribing'}>{voiceState === 'listening' ? 'Finish and transcribe' : 'Start push to talk'}</button>
    </div>
  {/if}
  {#if voiceState === 'interrupted'}
    <div class="mt-3 flex justify-center"><button type="button" class="min-h-10 rounded-lg px-3 text-xs text-primary hover:bg-muted" onclick={() => session.start(mode)}>Resume voice mode</button></div>
  {:else if voiceState !== 'idle'}
    <p class="mt-3 text-center text-xs text-muted-foreground" role="status">{voiceState === 'listening' ? (mode === 'hands-free' ? 'Listening for the next scripted turn…' : 'Listening…') : voiceState === 'transcribing' ? 'Preparing caption…' : 'Speaking simulated reply…'}</p>
  {/if}

  {#if transcript}<p class="mt-4 rounded-xl bg-background p-3 text-sm" aria-live="polite"><span class="mb-1 block text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">You said · simulated caption</span>{transcript}</p>{/if}
  {#if reply}<p class="mt-2 rounded-xl border border-border p-3 text-sm" aria-live="polite"><span class="mb-1 block text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">Assistant · simulated caption</span>{reply}</p>{/if}
  {#if !speechAvailable}<p class="mt-2 text-center text-xs text-muted-foreground">Speech output is muted in this browser; captions remain available.</p>{/if}
  {#if showMicLevelMeter}
    <div class="mt-4 border-t border-border pt-3">
      <button type="button" class="min-h-10 rounded-lg px-3 text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-pressed={micEnabled} onclick={() => void toggleMicMeter()}>{micEnabled ? 'Disable local mic level meter' : 'Enable local mic level meter'}</button>
      {#if micEnabled}<div class="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="meter" aria-label="Local microphone amplitude" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(micLevel * 100)}><div class="h-full bg-primary transition-[width]" style={`width:${micLevel * 100}%`}></div></div><p class="mt-1 text-[0.65rem] text-muted-foreground">Amplitude only. Audio is not recorded or uploaded.</p>{/if}
      {#if micError}<p class="mt-2 text-xs text-destructive" role="alert">{micError}</p>{/if}
    </div>
  {/if}
  <div class="mt-3 flex justify-center"><button type="button" class="min-h-9 rounded-lg px-3 text-xs text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onclick={interrupt} disabled={voiceState === 'idle' || voiceState === 'interrupted'}>Interrupt voice</button></div>
</section>

<style>
  .voice-orb { display: flex; width: 7rem; height: 7rem; align-items: center; justify-content: center; gap: 0.22rem; border: 1px solid color-mix(in srgb, currentColor 18%, transparent); border-radius: 50%; color: var(--color-primary); background: radial-gradient(circle at 35% 30%, color-mix(in srgb, currentColor 24%, transparent), transparent 68%); box-shadow: 0 0 2.5rem color-mix(in srgb, currentColor 18%, transparent); }
  .voice-orb span { width: 0.22rem; height: 0.65rem; border-radius: 1rem; background: currentColor; opacity: 0.45; transform: scaleY(0.65); }
  .voice-orb.listening span, .voice-orb.transcribing span, .voice-orb.speaking span { animation: voice-wave 0.9s ease-in-out infinite alternate; opacity: 0.9; }
  .voice-orb span:nth-child(2), .voice-orb span:nth-child(4) { animation-delay: 0.12s; }
  .voice-orb span:nth-child(3) { animation-delay: 0.24s; }
  .voice-orb.interrupted { color: var(--color-destructive); box-shadow: none; }
  @keyframes voice-wave { to { transform: scaleY(1.8); } }
  @media (prefers-reduced-motion: reduce) { .voice-orb span { animation: none !important; } }
</style>
