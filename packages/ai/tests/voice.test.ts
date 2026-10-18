import { describe, expect, it } from 'vitest';
import { createVoiceSession, type VoiceState } from '../src/voice.ts';

function instantClock() {
  let now = 0;
  return {
    now: () => new Date(now),
    nowMs: () => now,
    sleep: async (ms: number) => {
      now += ms;
    },
  };
}

describe('simulated AI voice session', () => {
  it('times a push-to-talk caption with the injected clock', async () => {
    const clock = instantClock();
    const transcripts: string[] = [];
    const states: VoiceState[] = [];
    const session = createVoiceSession({
      clock,
      transcripts: ['  Plan the next milestone.  '],
      transcriptDelayMs: 350,
      onTranscript: (transcript) => transcripts.push(transcript),
      onStateChange: (state) => states.push(state),
    });

    session.start('push-to-talk');
    expect(session.state).toBe('listening');
    await expect(session.finishListening()).resolves.toBe('Plan the next milestone.');
    expect(clock.nowMs()).toBe(350);
    expect(transcripts).toEqual(['Plan the next milestone.']);
    expect(states).toEqual(['listening', 'transcribing', 'idle']);
  });

  it('cancels a pending caption when interrupted', async () => {
    let finishSleep: (() => void) | undefined;
    const transcripts: string[] = [];
    const session = createVoiceSession({
      clock: {
        now: () => new Date(0),
        nowMs: () => 0,
        sleep: () =>
          new Promise<void>((resolve) => {
            finishSleep = resolve;
          }),
      },
      transcripts: ['Cancel this request.'],
      onTranscript: (transcript) => transcripts.push(transcript),
    });

    session.start();
    const pending = session.finishListening();
    session.interrupt();
    finishSleep?.();
    await expect(pending).resolves.toBeNull();
    expect(session.state).toBe('interrupted');
    expect(transcripts).toEqual([]);
  });

  it('continues hands-free scripted turns on the simulated clock until stopped', async () => {
    const pendingSleeps: (() => void)[] = [];
    const transcripts: string[] = [];
    const states: VoiceState[] = [];
    const session = createVoiceSession({
      clock: {
        now: () => new Date(0),
        nowMs: () => 0,
        sleep: () => new Promise<void>((resolve) => pendingSleeps.push(resolve)),
      },
      transcripts: ['First caption.', 'Second caption.'],
      handsFreeIntervalMs: 100,
      transcriptDelayMs: 50,
      onTranscript: (transcript) => transcripts.push(transcript),
      onStateChange: (state) => states.push(state),
    });

    session.start('hands-free');
    await Promise.resolve();
    pendingSleeps.shift()?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(session.state).toBe('transcribing');
    pendingSleeps.shift()?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(transcripts).toEqual(['First caption.']);
    expect(session.state).toBe('listening');

    session.stop();
    pendingSleeps.shift()?.();
    await Promise.resolve();
    expect(session.state).toBe('idle');
    expect(states).toContain('transcribing');
  });

  it('rejects empty scripted captions and invalid simulated delays', () => {
    expect(() => createVoiceSession({ clock: instantClock(), transcripts: [' ', '\n'] })).toThrow(
      RangeError
    );
    expect(() => createVoiceSession({ clock: instantClock(), transcriptDelayMs: -1 })).toThrow(
      RangeError
    );
  });
});
