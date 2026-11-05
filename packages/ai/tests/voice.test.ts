import { describe, expect, it, vi } from 'vitest';
import { createVoiceSession, type VoiceState } from '../src/voice.ts';

/** A clock whose sleeps resolve only when the test advances it. */
function manualClock() {
  const waiting: (() => void)[] = [];
  return {
    clock: {
      now: () => new Date(0),
      nowMs: () => 0,
      sleep: () => new Promise<void>((resolve) => waiting.push(resolve)),
    },
    async advance(): Promise<void> {
      const next = waiting.shift();
      next?.();
      await Promise.resolve();
      await Promise.resolve();
    },
    pending: () => waiting.length,
  };
}

describe('voice session: hold-to-talk and mute (D-G-045)', () => {
  it('press listens and release resolves the next scripted transcript', async () => {
    const onTranscript = vi.fn();
    const states: VoiceState[] = [];
    const session = createVoiceSession({
      clock: { now: () => new Date(0), nowMs: () => 0, sleep: async () => {} },
      transcripts: ['Book the harbor room.'],
      onTranscript,
      onStateChange: (state) => states.push(state),
    });
    session.press();
    expect(session.state).toBe('listening');
    await expect(session.release()).resolves.toBe('Book the harbor room.');
    expect(onTranscript).toHaveBeenCalledWith('Book the harbor room.');
    expect(states).toEqual(['listening', 'transcribing', 'idle']);
  });

  it('release without a press yields nothing', async () => {
    const session = createVoiceSession({
      clock: { now: () => new Date(0), nowMs: () => 0, sleep: async () => {} },
    });
    await expect(session.release()).resolves.toBeNull();
  });

  it('a muted microphone produces no transcript and reports the change', async () => {
    const onTranscript = vi.fn();
    const onMuteChange = vi.fn();
    const session = createVoiceSession({
      clock: { now: () => new Date(0), nowMs: () => 0, sleep: async () => {} },
      onTranscript,
      onMuteChange,
    });
    session.setMuted(true);
    session.setMuted(true);
    expect(onMuteChange).toHaveBeenCalledTimes(1);
    expect(session.muted).toBe(true);
    session.press();
    await expect(session.release()).resolves.toBeNull();
    expect(session.state).toBe('idle');
    expect(onTranscript).not.toHaveBeenCalled();
    session.setMuted(false);
    expect(onMuteChange).toHaveBeenLastCalledWith(false);
    session.press();
    await expect(session.release()).resolves.toBeTruthy();
  });

  it('muting while transcribing drops that transcript', async () => {
    const time = manualClock();
    const onTranscript = vi.fn();
    const session = createVoiceSession({ clock: time.clock, onTranscript });
    session.press();
    const result = session.release();
    session.setMuted(true);
    await time.advance();
    await expect(result).resolves.toBeNull();
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it('hands-free skips turns while muted and resumes after unmuting', async () => {
    const time = manualClock();
    const onTranscript = vi.fn();
    const session = createVoiceSession({
      clock: time.clock,
      transcripts: ['First turn.', 'Second turn.'],
      onTranscript,
    });
    session.setMuted(true);
    session.start('hands-free');
    await time.advance(); // interval passes, muted: no transcribing
    expect(session.state).toBe('listening');
    expect(onTranscript).not.toHaveBeenCalled();
    session.setMuted(false);
    await time.advance(); // next interval
    expect(session.state).toBe('transcribing');
    await time.advance(); // transcript delay
    expect(onTranscript).toHaveBeenCalledWith('First turn.');
    session.stop();
  });
});
