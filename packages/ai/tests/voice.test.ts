import { createRng, createSimulationEnvironment } from '@protoyard/core';
import { describe, expect, it, vi } from 'vitest';
import type { AiClock } from '../src/types.ts';
import {
  createVoiceSession,
  type SpeechBackend,
  type VoicePhase,
  type VoiceSession,
} from '../src/voice.ts';

function testClock(): AiClock & { flush(ms: number): Promise<void> } {
  let now = Date.parse('2026-06-01T12:00:00.000Z');
  const waits: Array<{ until: number; resolve: () => void }> = [];
  return {
    now: () => new Date(now),
    nowMs: () => now,
    sleep(ms) {
      if (ms <= 0) return Promise.resolve();
      const until = now + ms;
      return new Promise<void>((resolve) => {
        waits.push({ until, resolve });
        waits.sort((a, b) => a.until - b.until);
      });
    },
    async flush(ms) {
      now += ms;
      const due = waits.filter((w) => w.until <= now);
      for (const w of due) {
        const index = waits.indexOf(w);
        if (index >= 0) waits.splice(index, 1);
        w.resolve();
      }
      // Let chained awaits schedule the next sleeps.
      for (let i = 0; i < 10; i++) await Promise.resolve();
    },
  };
}

async function drain(
  clock: ReturnType<typeof testClock>,
  session: VoiceSession,
  until: (s: VoiceSession) => boolean,
  budgetMs = 5_000
) {
  let spent = 0;
  while (!until(session) && spent < budgetMs) {
    await clock.flush(10);
    spent += 10;
  }
}

function context(clock: AiClock) {
  return {
    seed: 42,
    rng: createRng(42),
    clock,
    environment: createSimulationEnvironment({ sleep: async () => {} }),
  };
}

describe('createVoiceSession', () => {
  it('runs push-to-talk: listen → transcript → reply → speaking captions when muted', async () => {
    const clock = testClock();
    const phases: VoicePhase[] = [];
    const captions: Array<{ text: string; role: string; final: boolean }> = [];
    const speech: SpeechBackend = {
      available: false,
      speak(_text, { onEnd }) {
        onEnd();
        return { cancel: () => {} };
      },
    };

    const session = createVoiceSession({
      context: context(clock),
      mode: 'push-to-talk',
      preferSpeechSynthesis: true,
      speech,
      utterances: [{ text: 'Hello world', listenMs: 100 }],
      sttCadenceMs: 5,
      ttsCadenceMs: 5,
      reply: async (transcript) => `Echo: ${transcript}`,
      onPhase: (p) => phases.push(p),
      onCaption: (text, role, final) => captions.push({ text, role, final }),
    });

    expect(session.muted).toBe(true);
    expect(session.phase).toBe('idle');

    const started = session.startListening();
    await clock.flush(5);
    await started;
    expect(session.phase).toBe('listening');

    const stopped = session.stopListening();
    await drain(clock, session, (s) => s.phase === 'idle' && s.caption === 'Echo: Hello world');
    await stopped;

    expect(session.transcript).toBe('Hello world');
    expect(session.caption).toBe('Echo: Hello world');
    expect(phases).toEqual(
      expect.arrayContaining(['listening', 'transcribing', 'thinking', 'speaking', 'idle'])
    );
    expect(captions.some((c) => c.role === 'user' && c.final && c.text === 'Hello world')).toBe(
      true
    );
    expect(
      captions.some((c) => c.role === 'assistant' && c.final && c.text === 'Echo: Hello world')
    ).toBe(true);
    session.destroy();
  });

  it('hands-free auto-finalizes after the listen window', async () => {
    const clock = testClock();
    const session = createVoiceSession({
      context: context(clock),
      mode: 'hands-free',
      speech: {
        available: false,
        speak: (_t, { onEnd }) => {
          onEnd();
          return { cancel: () => {} };
        },
      },
      utterances: [{ text: 'Status update', listenMs: 40 }],
      sttCadenceMs: 2,
      ttsCadenceMs: 2,
      reply: () => 'Noted.',
    });

    const run = session.startListening();
    await drain(clock, session, (s) => s.phase === 'idle' && s.caption === 'Noted.');
    await run;

    expect(session.transcript).toBe('Status update');
    expect(session.caption).toBe('Noted.');
    expect(session.phase).toBe('idle');
    session.destroy();
  });

  it('interrupts speaking and cancels speechSynthesis', async () => {
    const clock = testClock();
    let cancelled = false;
    const speech: SpeechBackend = {
      available: true,
      speak(_text, { onEnd }) {
        return {
          cancel: () => {
            cancelled = true;
            onEnd();
          },
        };
      },
    };

    const session = createVoiceSession({
      context: context(clock),
      mode: 'push-to-talk',
      speech,
      utterances: [{ text: 'Hi', listenMs: 10 }],
      sttCadenceMs: 1,
      ttsCadenceMs: 1,
      reply: () => 'A very long spoken answer that would keep going',
    });

    const turn = (async () => {
      await session.startListening();
      await session.stopListening();
    })();

    await drain(clock, session, (s) => s.phase === 'speaking');
    expect(session.phase).toBe('speaking');
    expect(session.muted).toBe(false);

    session.interrupt();
    expect(cancelled).toBe(true);
    expect(session.phase).toBe('idle');
    await turn.catch(() => {});
    session.destroy();
  });

  it('picks utterances deterministically for the same seed', async () => {
    const runOnce = async () => {
      const clock = testClock();
      const session = createVoiceSession({
        context: context(clock),
        mode: 'push-to-talk',
        speech: {
          available: false,
          speak: (_t, { onEnd }) => {
            onEnd();
            return { cancel: () => {} };
          },
        },
        utterances: ['Alpha one', 'Bravo two', 'Charlie three'],
        sttCadenceMs: 0,
        ttsCadenceMs: 0,
        reply: (t) => t,
      });
      await session.startListening();
      const done = session.stopListening();
      await drain(clock, session, (s) => s.phase === 'idle' && s.transcript.length > 0);
      await done;
      const text = session.transcript;
      session.destroy();
      return text;
    };

    expect(await runOnce()).toBe(await runOnce());
  });

  it('enableMicLevelMeter refuses when getUserMedia is missing', async () => {
    const clock = testClock();
    const session = createVoiceSession({
      context: context(clock),
      reply: () => 'ok',
      speech: {
        available: false,
        speak: (_t, { onEnd }) => {
          onEnd();
          return { cancel: () => {} };
        },
      },
    });
    const original = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { mediaDevices: undefined },
    });
    await expect(session.enableMicLevelMeter()).rejects.toThrow(/unavailable/i);
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: original });
    session.destroy();
  });

  it('enableMicLevelMeter uses getUserMedia for amplitude only and disposes cleanly', async () => {
    const clock = testClock();
    const stop = vi.fn();
    const track = { stop } as unknown as MediaStreamTrack;
    const stream = { getTracks: () => [track] } as unknown as MediaStream;
    const getUserMedia = vi.fn(async () => stream);

    class FakeAnalyser {
      fftSize = 256;
      frequencyBinCount = 128;
      connect() {}
      disconnect() {}
      getByteTimeDomainData(data: Uint8Array) {
        data.fill(128);
      }
    }
    class FakeAudioContext {
      createMediaStreamSource() {
        return { connect: () => {}, disconnect: () => {} };
      }
      createAnalyser() {
        return new FakeAnalyser();
      }
      close = vi.fn(async () => {});
    }

    const originalNav = globalThis.navigator;
    const originalAC = globalThis.AudioContext;
    const originalRaf = globalThis.requestAnimationFrame;
    const originalCaf = globalThis.cancelAnimationFrame;

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { mediaDevices: { getUserMedia } },
    });
    Object.defineProperty(globalThis, 'AudioContext', {
      configurable: true,
      value: FakeAudioContext,
    });
    let frames = 0;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      frames += 1;
      if (frames <= 2) {
        Promise.resolve().then(() => cb(0));
      }
      return frames;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = vi.fn() as typeof cancelAnimationFrame;

    const session = createVoiceSession({
      context: context(clock),
      reply: () => 'ok',
      speech: {
        available: false,
        speak: (_t, { onEnd }) => {
          onEnd();
          return { cancel: () => {} };
        },
      },
    });
    const dispose = await session.enableMicLevelMeter();
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
    dispose();
    expect(stop).toHaveBeenCalled();
    expect(session.micLevel).toBe(0);

    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: originalNav });
    Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: originalAC });
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCaf;
    session.destroy();
  });
});
