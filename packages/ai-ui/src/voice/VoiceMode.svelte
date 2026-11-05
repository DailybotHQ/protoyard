<script lang="ts">
import type { AiClock } from '@protoyard/ai';
import {
  createVoiceSession,
  type VoiceMode as VoiceModeType,
  type VoiceState,
} from '@protoyard/ai/voice';
import { onDestroy, onMount } from 'svelte';
import { Badge } from 'texuli/badge';
import { Button } from 'texuli/button';
import { useMessages } from 'texuli/i18n';

interface Props {
  clock: AiClock;
  transcripts?: readonly string[];
  reply?: string;
  transcriptDelayMs?: number;
  handsFreeIntervalMs?: number;
  showMicLevelMeter?: boolean;
  /** Receives each transcript to send (not called while dictating). */
  onTranscript?: (transcript: string) => void;
  /** Push to talk becomes press-and-hold: pointer down or Space/Enter down listens, release transcribes. */
  holdToTalk?: boolean;
  /** Push to talk started (hold pressed, or the toggle turned on). */
  onPress?: () => void;
  /** Push to talk ended with its transcript (`null` when muted or nothing was heard). */
  onRelease?: (transcript: string | null) => void;
  /** Simulated microphone mute (bindable). Muted turns produce no transcript. */
  muted?: boolean;
  /** Shows the "Mute microphone" toggle. */
  showMute?: boolean;
  onMuteChange?: (muted: boolean) => void;
  /** Dictation (bindable): transcripts go into `draft` instead of `onTranscript`. */
  dictation?: boolean;
  /** Shows the "Dictate into draft" toggle. */
  showDictation?: boolean;
  /** The dictated draft text (bindable); each transcript is appended with a space. */
  draft?: string;
  /** A transcript was dictated, with the draft after it was appended. */
  onDictate?: (transcript: string, draft: string) => void;
  onStateChange?: (state: VoiceState) => void;
}

// Labels resolve through Texuli's dictionary (mountPrototype({ i18n })).
const messages = useMessages();
const V = 'protoyard.ai.voice';

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
  holdToTalk = false,
  onPress,
  onRelease,
  muted = $bindable(false),
  showMute = false,
  onMuteChange,
  dictation = $bindable(false),
  showDictation = false,
  draft = $bindable(''),
  onDictate,
  onStateChange,
}: Props = $props();

let voiceState = $state<VoiceState>('idle');
let mode = $state<VoiceModeType>('push-to-talk');
let transcript = $state('');
let speechAvailable = $state(false);
let micLevel = $state(0);
let micEnabled = $state(false);
let micError = $state('');
let micPending = $state(false);
let mediaStream: MediaStream | null = null;
let audioContext: AudioContext | null = null;
let animationFrame = 0;
let utterance: SpeechSynthesisUtterance | null = null;
let lastSpokenReply = '';
/** Set in onDestroy so a late getUserMedia resolve cannot leak a stream. */
let destroyed = false;

const session = $derived.by(() =>
  createVoiceSession({
    clock,
    transcripts,
    ...(transcriptDelayMs !== undefined ? { transcriptDelayMs } : {}),
    ...(handsFreeIntervalMs !== undefined ? { handsFreeIntervalMs } : {}),
    onTranscript: deliver,
    onStateChange: (state) => {
      voiceState = state;
      onStateChange?.(state);
    },
    onMuteChange: (value) => onMuteChange?.(value),
  })
);

/** Sends the transcript, or appends it to the draft while dictating. */
function deliver(value: string): void {
  transcript = value;
  if (dictation) {
    draft = draft.trim() ? `${draft.trimEnd()} ${value}` : value;
    onDictate?.(value, draft);
  } else {
    onTranscript?.(value);
  }
}

$effect(() => {
  session.setMuted(muted);
});

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
    void finish();
  } else {
    mode = 'push-to-talk';
    session.press();
    onPress?.();
  }
}

async function finish(): Promise<void> {
  const value = await session.release();
  onRelease?.(value);
}

let holding = false;

function holdStart(): void {
  if (holding || voiceState === 'transcribing') return;
  holding = true;
  mode = 'push-to-talk';
  session.press();
  onPress?.();
}

function holdEnd(): void {
  if (!holding) return;
  holding = false;
  void finish();
}

function holdKeydown(event: KeyboardEvent): void {
  if (event.key !== ' ' && event.key !== 'Enter') return;
  event.preventDefault();
  if (!event.repeat) holdStart();
}

function holdKeyup(event: KeyboardEvent): void {
  if (event.key !== ' ' && event.key !== 'Enter') return;
  event.preventDefault();
  holdEnd();
}

function holdPointerdown(event: PointerEvent): void {
  if (event.button !== 0) return;
  event.preventDefault();
  holdStart();
}

function interrupt(): void {
  session.interrupt();
  if (speechAvailable) window.speechSynthesis.cancel();
  utterance = null;
}

async function toggleMicMeter(): Promise<void> {
  micError = '';
  if (micEnabled || micPending) {
    if (micEnabled) stopMicMeter();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === 'undefined') {
    micError = messages(
      `${V}.meter-unavailable`,
      'A local microphone level meter is unavailable in this browser.'
    );
    return;
  }
  micPending = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (destroyed || !micPending) {
      stream.getTracks().forEach((track) => {
        track.stop();
      });
      return;
    }
    mediaStream = stream;
    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(mediaStream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    micEnabled = true;
    const sampleLevel = () => {
      if (!audioContext || !micEnabled || destroyed) return;
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
    if (!destroyed) {
      micError = messages(
        `${V}.mic-denied`,
        'Microphone access was not enabled. Voice simulation still works with captions.'
      );
    }
  } finally {
    micPending = false;
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
  destroyed = true;
  micPending = false;
  session.stop();
  if (speechAvailable) window.speechSynthesis.cancel();
  stopMicMeter();
});
</script>

<section class="voice-panel rounded-2xl border border-border bg-surface p-5 text-foreground" aria-label={messages(`${V}.label`, 'Simulated voice chat')}>
  <div class="flex items-center justify-center py-4">
    <div class={`voice-orb ${voiceState}`} aria-hidden="true">
      <span></span><span></span><span></span><span></span><span></span>
    </div>
  </div>
  <p class="text-center text-sm font-medium">{messages(`${V}.title`, 'Voice chat')} <Badge variant="outline" class="ml-1">{messages(`${V}.simulated`, 'Simulated')}</Badge></p>
  <p class="mt-1 text-center text-xs text-muted-foreground">{messages(`${V}.note`, 'Transcripts are scripted and timed by the simulated clock. No audio is recorded or sent.')}</p>

  <div class="mt-4 flex justify-center gap-2" role="group" aria-label={messages(`${V}.mode`, 'Voice mode')}>
    <Button size="sm" variant={mode === 'push-to-talk' ? 'secondary' : 'outline'} aria-pressed={mode === 'push-to-talk'} onclick={() => chooseMode('push-to-talk')}>{messages(`${V}.push-to-talk`, 'Push to talk')}</Button>
    <Button size="sm" variant={mode === 'hands-free' ? 'secondary' : 'outline'} aria-pressed={mode === 'hands-free'} onclick={() => chooseMode(mode === 'hands-free' ? 'push-to-talk' : 'hands-free')}>{mode === 'hands-free' ? messages(`${V}.stop-hands-free`, 'Stop hands-free') : messages(`${V}.hands-free`, 'Hands-free')}</Button>
  </div>
  {#if showMute || showDictation}
    <div class="mt-3 flex justify-center gap-2" role="group" aria-label={messages(`${V}.input`, 'Voice input')}>
      {#if showMute}
        <Button size="sm" variant={muted ? 'secondary' : 'outline'} aria-pressed={muted} onclick={() => (muted = !muted)}>{messages(`${V}.mute`, 'Mute microphone')}</Button>
      {/if}
      {#if showDictation}
        <Button size="sm" variant={dictation ? 'secondary' : 'outline'} aria-pressed={dictation} onclick={() => (dictation = !dictation)}>{messages(`${V}.dictate`, 'Dictate into draft')}</Button>
      {/if}
    </div>
  {/if}
  {#if mode === 'push-to-talk'}
    <div class="mt-3 flex justify-center">
      {#if holdToTalk}
        <Button
          size="lg"
          class="rounded-full touch-none select-none"
          aria-pressed={voiceState === 'listening' || voiceState === 'transcribing'}
          disabled={voiceState === 'transcribing'}
          data-voice-hold
          onpointerdown={holdPointerdown}
          onpointerup={holdEnd}
          onpointercancel={holdEnd}
          onpointerleave={holdEnd}
          onkeydown={holdKeydown}
          onkeyup={holdKeyup}
          onblur={holdEnd}
        >{voiceState === 'listening' ? messages(`${V}.release`, 'Release to transcribe') : messages(`${V}.hold`, 'Hold to talk')}</Button>
      {:else}
        <Button size="lg" class="rounded-full" aria-pressed={voiceState === 'listening' || voiceState === 'transcribing'} onclick={togglePushToTalk} disabled={voiceState === 'transcribing'}>{voiceState === 'listening' ? messages(`${V}.finish`, 'Finish and transcribe') : messages(`${V}.start`, 'Start push to talk')}</Button>
      {/if}
    </div>
  {/if}
  {#if muted}
    <p class="mt-2 text-center text-xs text-muted-foreground" data-voice-muted>{messages(`${V}.muted`, 'Microphone muted (simulated): turns produce no caption.')}</p>
  {/if}
  {#if voiceState === 'interrupted'}
    <div class="mt-3 flex justify-center"><Button size="sm" variant="ghost" onclick={() => session.start(mode)}>{messages(`${V}.resume`, 'Resume voice mode')}</Button></div>
  {:else if voiceState !== 'idle'}
    <p class="mt-3 text-center text-xs text-muted-foreground" role="status">{voiceState === 'listening' ? (mode === 'hands-free' ? messages(`${V}.listening-hands-free`, 'Listening for the next scripted turn…') : messages(`${V}.listening`, 'Listening…')) : voiceState === 'transcribing' ? messages(`${V}.transcribing`, 'Preparing caption…') : messages(`${V}.speaking`, 'Speaking simulated reply…')}</p>
  {/if}

  {#if dictation}
    <div class="mt-4 rounded-xl border border-dashed border-border p-3 text-sm" data-voice-draft>
      <p class="mb-1 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">{messages(`${V}.draft`, 'Draft · simulated dictation, not sent')}</p>
      <p aria-live="polite">{draft || messages(`${V}.draft-empty`, 'Dictated words appear here.')}</p>
      {#if draft}<Button size="sm" variant="ghost" class="mt-2" onclick={() => (draft = '')}>{messages(`${V}.clear-draft`, 'Clear draft')}</Button>{/if}
    </div>
  {/if}
  {#if transcript && !dictation}<p class="mt-4 rounded-xl bg-background p-3 text-sm" aria-live="polite"><span class="mb-1 block text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">{messages(`${V}.you-said`, 'You said · simulated caption')}</span>{transcript}</p>{/if}
  {#if reply}<p class="mt-2 rounded-xl border border-border p-3 text-sm" aria-live="polite"><span class="mb-1 block text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">{messages(`${V}.assistant-said`, 'Assistant · simulated caption')}</span>{reply}</p>{/if}
  {#if !speechAvailable}<p class="mt-2 text-center text-xs text-muted-foreground">{messages(`${V}.no-speech`, 'Speech output is muted in this browser; captions remain available.')}</p>{/if}
  {#if showMicLevelMeter}
    <div class="mt-4 border-t border-border pt-3">
      <Button size="sm" variant="ghost" aria-pressed={micEnabled} autoLoading={false} loading={micPending} onclick={() => void toggleMicMeter()}>{micEnabled ? messages(`${V}.meter-off`, 'Disable local mic level meter') : micPending ? messages(`${V}.meter-waiting`, 'Waiting for microphone…') : messages(`${V}.meter-on`, 'Enable local mic level meter')}</Button>
      {#if micEnabled}<div class="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="meter" aria-label={messages(`${V}.amplitude`, 'Local microphone amplitude')} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(micLevel * 100)}><div class="h-full bg-primary transition-[width]" style={`width:${micLevel * 100}%`}></div></div><p class="mt-1 text-[0.65rem] text-muted-foreground">{messages(`${V}.amplitude-note`, 'Amplitude only. Audio is not recorded or uploaded.')}</p>{/if}
      {#if micError}<p class="mt-2 text-xs text-destructive" role="alert">{micError}</p>{/if}
    </div>
  {/if}
  <div class="mt-3 flex justify-center"><Button size="sm" variant="ghost" onclick={interrupt} disabled={voiceState === 'idle' || voiceState === 'interrupted'}>{messages(`${V}.interrupt`, 'Interrupt voice')}</Button></div>
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
  :global([data-py-motion='reduce']) .voice-orb span { animation: none !important; }
</style>
