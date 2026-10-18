import { createRng, hashString, type Rng } from '@protoyard/core';
import type { AiContext } from './types.ts';

/**
 * Simulated voice chat. Default path never touches the microphone or a cloud
 * speech API: user speech is a deterministic transcript timed by the simulated
 * clock; assistant replies optionally use the browser's local `speechSynthesis`
 * when present, otherwise captions only (always shown for accessibility).
 *
 * An opt-in local mic level meter may call `getUserMedia` for amplitude only —
 * it never records, stores or uploads audio. See `enableMicLevelMeter`.
 */

export type VoiceMode = 'push-to-talk' | 'hands-free';

export type VoicePhase =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'thinking'
  | 'speaking'
  | 'interrupted';

export interface VoiceUtterance {
  /** Final user transcript for this turn (fictional). */
  text: string;
  /** Simulated listen duration before transcription starts (ms). */
  listenMs?: number;
}

export interface VoiceSessionOptions {
  context: AiContext;
  /**
   * Build the assistant reply from the finalized user transcript.
   * Callers typically route through `createAiEngine` / response packs.
   */
  reply: (transcript: string) => string | Promise<string>;
  mode?: VoiceMode;
  /** Default listen window for hands-free and when an utterance omits listenMs. */
  listenMs?: number;
  /** Simulated clock delay between caption characters while "transcribing". */
  sttCadenceMs?: number;
  /** Simulated clock delay between caption characters while "speaking". */
  ttsCadenceMs?: number;
  /** Cycled fictional user utterances (picked deterministically from seed). */
  utterances?: readonly (string | VoiceUtterance)[];
  /** Attempt local speechSynthesis for assistant replies (default true). */
  preferSpeechSynthesis?: boolean;
  onPhase?: (phase: VoicePhase) => void;
  onTranscript?: (partial: string, final: boolean) => void;
  onCaption?: (text: string, role: 'user' | 'assistant', final: boolean) => void;
  /** Injected speech backend for tests. */
  speech?: SpeechBackend;
}

/** Minimal speechSynthesis surface so tests can inject a fake. */
export interface SpeechBackend {
  available: boolean;
  speak(
    text: string,
    options: { onEnd: () => void; onBoundary?: (charIndex: number) => void }
  ): { cancel: () => void };
}

export interface VoiceSession {
  readonly phase: VoicePhase;
  readonly mode: VoiceMode;
  readonly transcript: string;
  readonly caption: string;
  readonly captionRole: 'user' | 'assistant' | null;
  readonly muted: boolean;
  readonly micLevel: number;
  setMode(mode: VoiceMode): void;
  /** Begin a listen turn (PTT press or hands-free start). */
  startListening(): Promise<void>;
  /**
   * End listening and run STT → reply → speak.
   * Hands-free calls this automatically after the listen window.
   */
  stopListening(): Promise<void>;
  /** Cut off assistant speech and return to idle. */
  interrupt(): void;
  /**
   * Opt-in local mic amplitude meter via `getUserMedia`.
   * Amplitude only — never records or uploads. Returns a disposer.
   */
  enableMicLevelMeter(): Promise<() => void>;
  destroy(): void;
}

const DEFAULT_UTTERANCES: readonly VoiceUtterance[] = [
  { text: 'Summarize my open deals for this week.', listenMs: 900 },
  { text: 'Draft a friendly follow-up email.', listenMs: 700 },
  { text: 'What should I prioritize tomorrow?', listenMs: 800 },
];

function normalizeUtterance(value: string | VoiceUtterance): VoiceUtterance {
  return typeof value === 'string' ? { text: value } : value;
}

function browserSpeechBackend(): SpeechBackend {
  const synth =
    typeof globalThis !== 'undefined'
      ? (globalThis as { speechSynthesis?: SpeechSynthesis }).speechSynthesis
      : undefined;
  const UtteranceCtor =
    typeof globalThis !== 'undefined'
      ? (globalThis as { SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance })
          .SpeechSynthesisUtterance
      : undefined;
  if (!synth || !UtteranceCtor) {
    return {
      available: false,
      speak(_text, { onEnd }) {
        onEnd();
        return { cancel: () => {} };
      },
    };
  }
  return {
    available: true,
    speak(text, { onEnd, onBoundary }) {
      const utterance = new UtteranceCtor(text);
      utterance.rate = 1;
      utterance.onend = () => onEnd();
      utterance.onerror = () => onEnd();
      if (onBoundary) {
        utterance.onboundary = (event) => {
          if (typeof event.charIndex === 'number') onBoundary(event.charIndex);
        };
      }
      synth.cancel();
      synth.speak(utterance);
      return {
        cancel: () => {
          try {
            synth.cancel();
          } catch {
            // Some engines throw when nothing is queued.
          }
        },
      };
    },
  };
}

export function createVoiceSession(options: VoiceSessionOptions): VoiceSession {
  const ctx = options.context;
  const listenMsDefault = options.listenMs ?? 800;
  const sttCadenceMs = Math.max(0, options.sttCadenceMs ?? 18);
  const ttsCadenceMs = Math.max(0, options.ttsCadenceMs ?? 16);
  const utterances = (options.utterances?.length ? options.utterances : DEFAULT_UTTERANCES).map(
    normalizeUtterance
  );
  const preferSpeech = options.preferSpeechSynthesis !== false;
  const speech = options.speech ?? browserSpeechBackend();
  const muted = !(preferSpeech && speech.available);

  let mode: VoiceMode = options.mode ?? 'push-to-talk';
  let phase: VoicePhase = 'idle';
  let transcript = '';
  let caption = '';
  let captionRole: 'user' | 'assistant' | null = null;
  let micLevel = 0;
  let turn = 0;
  let generation = 0;
  let destroyed = false;
  let activeSpeech: { cancel: () => void } | null = null;
  let micDisposer: (() => void) | null = null;
  let pendingUtterance: VoiceUtterance | null = null;
  let pendingGen = 0;
  let turnLock: Promise<void> = Promise.resolve();

  const rngFor = (label: string): Rng =>
    createRng((hashString(`${String(ctx.seed)}:voice:${label}`) ^ hashString(label)) >>> 0);

  const setPhase = (next: VoicePhase) => {
    if (destroyed) return;
    if (phase === next) return;
    phase = next;
    options.onPhase?.(next);
  };

  const setTranscript = (value: string, final: boolean) => {
    transcript = value;
    options.onTranscript?.(value, final);
  };

  const setCaption = (value: string, role: 'user' | 'assistant', final: boolean) => {
    caption = value;
    captionRole = role;
    options.onCaption?.(value, role, final);
  };

  const pickUtterance = (): VoiceUtterance => {
    const rng = rngFor(`turn:${turn}`);
    const picked = utterances[rng.int(0, Math.max(0, utterances.length - 1))];
    return picked ?? { text: 'Hello', listenMs: 500 };
  };

  const revealText = async (
    text: string,
    role: 'user' | 'assistant',
    cadence: number,
    gen: number
  ): Promise<void> => {
    let built = '';
    setCaption('', role, false);
    for (const ch of text) {
      if (destroyed || gen !== generation) return;
      built += ch;
      setCaption(built, role, false);
      if (role === 'user') setTranscript(built, false);
      if (cadence > 0) await ctx.clock.sleep(cadence);
    }
    if (destroyed || gen !== generation) return;
    setCaption(text, role, true);
    if (role === 'user') setTranscript(text, true);
  };

  const speakAssistant = async (text: string, gen: number): Promise<void> => {
    if (destroyed || gen !== generation) return;
    setPhase('speaking');
    setCaption('', 'assistant', false);

    if (!muted) {
      await new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          activeSpeech = null;
          resolve();
        };
        activeSpeech = speech.speak(text, {
          onEnd: finish,
          onBoundary: (charIndex) => {
            if (gen !== generation) return;
            setCaption(text.slice(0, Math.min(text.length, charIndex + 1)), 'assistant', false);
          },
        });
        // Caption path always runs so a11y captions keep up even without boundaries.
        const captionLoop = async () => {
          let built = '';
          for (const ch of text) {
            if (destroyed || gen !== generation || settled) return;
            built += ch;
            setCaption(built, 'assistant', false);
            if (ttsCadenceMs > 0) await ctx.clock.sleep(ttsCadenceMs);
          }
          if (!settled && gen === generation) setCaption(text, 'assistant', true);
        };
        captionLoop().catch(() => {});
      });
    } else {
      await revealText(text, 'assistant', ttsCadenceMs, gen);
    }

    if (destroyed || gen !== generation) return;
    setCaption(text, 'assistant', true);
    setPhase('idle');
  };

  const runTurn = async (utterance: VoiceUtterance, gen: number): Promise<void> => {
    setPhase('transcribing');
    await revealText(utterance.text, 'user', sttCadenceMs, gen);
    if (destroyed || gen !== generation) return;

    setPhase('thinking');
    let replyText = '';
    try {
      replyText = String((await options.reply(utterance.text)) ?? '');
    } catch (error) {
      replyText =
        error instanceof Error
          ? `I could not finish that turn: ${error.message}`
          : 'I could not finish that turn.';
    }
    if (destroyed || gen !== generation) return;

    await speakAssistant(replyText, gen);
  };

  const enqueue = (work: () => Promise<void>): Promise<void> => {
    const next = turnLock.then(work, work);
    turnLock = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  };

  return {
    get phase() {
      return phase;
    },
    get mode() {
      return mode;
    },
    get transcript() {
      return transcript;
    },
    get caption() {
      return caption;
    },
    get captionRole() {
      return captionRole;
    },
    get muted() {
      return muted;
    },
    get micLevel() {
      return micLevel;
    },
    setMode(next) {
      mode = next;
    },
    startListening() {
      return enqueue(async () => {
        if (destroyed) return;
        if (phase === 'listening' || phase === 'transcribing' || phase === 'thinking') return;
        if (phase === 'speaking') {
          generation += 1;
          activeSpeech?.cancel();
          activeSpeech = null;
          setPhase('interrupted');
          setPhase('idle');
        }

        generation += 1;
        const gen = generation;
        turn += 1;
        const utterance = pickUtterance();
        const windowMs = utterance.listenMs ?? listenMsDefault;

        setTranscript('', false);
        setCaption('', 'user', false);
        setPhase('listening');

        if (mode === 'hands-free') {
          if (windowMs > 0) await ctx.clock.sleep(windowMs);
          if (destroyed || gen !== generation) return;
          await runTurn(utterance, gen);
        } else {
          pendingUtterance = utterance;
          pendingGen = gen;
        }
      });
    },
    stopListening() {
      return enqueue(async () => {
        if (destroyed) return;
        if (mode === 'hands-free') return;
        if (phase !== 'listening') return;
        const utterance = pendingUtterance;
        const gen = pendingGen;
        pendingUtterance = null;
        if (!utterance) return;
        await runTurn(utterance, gen);
      });
    },
    interrupt() {
      if (destroyed) return;
      generation += 1;
      pendingUtterance = null;
      activeSpeech?.cancel();
      activeSpeech = null;
      if (phase === 'speaking' || phase === 'thinking' || phase === 'transcribing') {
        setPhase('interrupted');
        setPhase('idle');
      } else if (phase === 'listening') {
        setPhase('idle');
      }
    },
    async enableMicLevelMeter() {
      if (destroyed) throw new Error('Voice session was destroyed');
      if (micDisposer) return micDisposer;

      const media = globalThis.navigator?.mediaDevices;
      if (!media?.getUserMedia) {
        throw new Error(
          'Microphone level meter is unavailable in this environment (no mediaDevices.getUserMedia)'
        );
      }

      // Amplitude only — the stream is never recorded or uploaded.
      const stream = await media.getUserMedia({
        audio: true,
        video: false,
      });
      const AudioCtx =
        globalThis.AudioContext ??
        (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) {
        for (const track of stream.getTracks()) track.stop();
        throw new Error('Web Audio is unavailable for the local mic level meter');
      }
      const audio = new AudioCtx();
      const source = audio.createMediaStreamSource(stream);
      const analyser = audio.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let raf = 0;
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const sample of data) {
          const v = (sample - 128) / 128;
          sum += v * v;
        }
        micLevel = Math.min(1, Math.sqrt(sum / data.length) * 4);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      micDisposer = () => {
        cancelAnimationFrame(raf);
        source.disconnect();
        audio.close().catch(() => {});
        for (const track of stream.getTracks()) track.stop();
        micLevel = 0;
        micDisposer = null;
      };
      return micDisposer;
    },
    destroy() {
      destroyed = true;
      generation += 1;
      pendingUtterance = null;
      activeSpeech?.cancel();
      activeSpeech = null;
      micDisposer?.();
      micDisposer = null;
      phase = 'idle';
    },
  };
}
