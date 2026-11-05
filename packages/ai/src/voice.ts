import type { AiClock } from './types.ts';

export type VoiceMode = 'push-to-talk' | 'hands-free';
export type VoiceState = 'idle' | 'listening' | 'transcribing' | 'speaking' | 'interrupted';

export interface VoiceSessionOptions {
  clock: AiClock;
  transcripts?: readonly string[];
  transcriptDelayMs?: number;
  handsFreeIntervalMs?: number;
  onTranscript?: (transcript: string) => void;
  onStateChange?: (state: VoiceState) => void;
  /** Called when the simulated microphone is muted or unmuted. */
  onMuteChange?: (muted: boolean) => void;
}

export interface VoiceSession {
  readonly mode: VoiceMode;
  readonly state: VoiceState;
  /** True while the simulated microphone is muted: listening yields no transcript. */
  readonly muted: boolean;
  start(mode?: VoiceMode): void;
  finishListening(): Promise<string | null>;
  /** Hold-to-talk: starts push-to-talk listening (same as `start('push-to-talk')`). */
  press(): void;
  /** Hold-to-talk: stops listening and resolves the transcript (`null` when muted or not listening). */
  release(): Promise<string | null>;
  /** Mutes or unmutes the simulated microphone. */
  setMuted(muted: boolean): void;
  startSpeaking(): void;
  finishSpeaking(): void;
  interrupt(): void;
  stop(): void;
}

const DEFAULT_TRANSCRIPTS = [
  'Summarize the latest project update.',
  'What should I focus on next?',
  'Draft a short response for the team.',
] as const;

/** Deterministic voice interaction using supplied captions and simulated time only. */
export function createVoiceSession(options: VoiceSessionOptions): VoiceSession {
  const transcripts = (options.transcripts ?? DEFAULT_TRANSCRIPTS)
    .map((transcript) => transcript.trim())
    .filter(Boolean);
  if (transcripts.length === 0) throw new RangeError('At least one voice transcript is required.');
  const transcriptDelayMs = requireDelay(options.transcriptDelayMs ?? 650, 'transcriptDelayMs');
  const handsFreeIntervalMs = requireDelay(
    options.handsFreeIntervalMs ?? 3_000,
    'handsFreeIntervalMs'
  );
  let currentMode: VoiceMode = 'push-to-talk';
  let currentState: VoiceState = 'idle';
  let transcriptIndex = 0;
  let generation = 0;
  let muted = false;

  const setState = (state: VoiceState) => {
    currentState = state;
    options.onStateChange?.(state);
  };
  const nextTranscript = () => {
    const transcript = transcripts[transcriptIndex % transcripts.length] ?? '';
    transcriptIndex += 1;
    options.onTranscript?.(transcript);
    return transcript;
  };
  const handsFreeCycle = async (run: number): Promise<void> => {
    while (run === generation && currentMode === 'hands-free' && currentState !== 'interrupted') {
      await options.clock.sleep(handsFreeIntervalMs);
      if (run !== generation) return;
      // A muted microphone hears nothing: the turn passes without a transcript.
      if (muted) continue;
      setState('transcribing');
      await options.clock.sleep(transcriptDelayMs);
      if (run !== generation) return;
      if (!muted) nextTranscript();
      setState('listening');
    }
  };

  const start = (mode: VoiceMode = 'push-to-talk') => {
    generation += 1;
    currentMode = mode;
    setState('listening');
    if (mode === 'hands-free') void handsFreeCycle(generation);
  };
  const finishListening = async (): Promise<string | null> => {
    if (currentMode !== 'push-to-talk' || currentState !== 'listening') return null;
    if (muted) {
      setState('idle');
      return null;
    }
    const run = generation;
    setState('transcribing');
    await options.clock.sleep(transcriptDelayMs);
    if (run !== generation) return null;
    if (muted) {
      setState('idle');
      return null;
    }
    const transcript = nextTranscript();
    setState('idle');
    return transcript;
  };

  return {
    get mode() {
      return currentMode;
    },
    get state() {
      return currentState;
    },
    get muted() {
      return muted;
    },
    start,
    finishListening,
    press() {
      start('push-to-talk');
    },
    release() {
      return finishListening();
    },
    setMuted(next) {
      if (next === muted) return;
      muted = next;
      options.onMuteChange?.(muted);
    },
    startSpeaking() {
      if (currentState !== 'interrupted') setState('speaking');
    },
    finishSpeaking() {
      if (currentState === 'speaking')
        setState(currentMode === 'hands-free' ? 'listening' : 'idle');
    },
    interrupt() {
      generation += 1;
      setState('interrupted');
    },
    stop() {
      generation += 1;
      setState('idle');
    },
  };
}

function requireDelay(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0)
    throw new RangeError(`${name} must be a non-negative number.`);
  return value;
}
