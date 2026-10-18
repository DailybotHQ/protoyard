import { type AiClock, createVoiceSession, type VoiceSession } from '@protoyard/ai';
import { createRng, createSimulationEnvironment } from '@protoyard/core';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import axe from 'axe-core';
import { afterEach, describe, expect, it } from 'vitest';
import VoiceOrb from '../src/voice/VoiceOrb.svelte';
import VoicePanel from '../src/voice/VoicePanel.svelte';

afterEach(() => cleanup());

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
      });
    },
    async flush(ms) {
      now += ms;
      const due = waits.filter((w) => w.until <= now);
      for (const w of due) {
        const i = waits.indexOf(w);
        if (i >= 0) waits.splice(i, 1);
        w.resolve();
      }
      for (let i = 0; i < 8; i++) await Promise.resolve();
    },
  };
}

function sessionWith(clock: ReturnType<typeof testClock>): VoiceSession {
  return createVoiceSession({
    context: {
      seed: 7,
      rng: createRng(7),
      clock,
      environment: createSimulationEnvironment({ sleep: async () => {} }),
    },
    mode: 'push-to-talk',
    speech: {
      available: false,
      speak: (_t, { onEnd }) => {
        onEnd();
        return { cancel: () => {} };
      },
    },
    utterances: [{ text: 'Ship the demo', listenMs: 30 }],
    sttCadenceMs: 2,
    ttsCadenceMs: 2,
    reply: (t) => `Heard: ${t}`,
  });
}

describe('VoiceOrb', () => {
  it('exposes phase and an accessible label', () => {
    const { container } = render(VoiceOrb, { phase: 'listening', level: 0.5 });
    const orb = container.querySelector('[data-py-voice-orb]');
    expect(orb?.getAttribute('data-phase')).toBe('listening');
    expect(orb?.getAttribute('aria-label')).toMatch(/voice/i);
    expect(screen.getByText('Listening…')).toBeTruthy();
  });
});

describe('VoicePanel', () => {
  it('push-to-talk hold runs a full simulated turn and always shows captions', async () => {
    const clock = testClock();
    const session = sessionWith(clock);
    render(VoicePanel, { session });

    expect(screen.getByText(/Voice \(simulated\)/i)).toBeTruthy();
    expect(screen.getByText(/Captions always on/i)).toBeTruthy();

    const hold = screen.getByRole('button', { name: /hold to talk/i });
    await fireEvent.pointerDown(hold);
    await clock.flush(5);
    await waitFor(() => expect(session.phase).toBe('listening'));

    await fireEvent.pointerUp(hold);
    for (let i = 0; i < 80 && session.phase !== 'idle'; i++) {
      await clock.flush(10);
    }
    await waitFor(() => expect(session.caption).toContain('Heard: Ship the demo'));
    expect(screen.getByText(/Heard: Ship the demo/)).toBeTruthy();
    session.destroy();
  });

  it('switches to hands-free mode and exposes interrupt', async () => {
    const clock = testClock();
    const session = sessionWith(clock);
    render(VoicePanel, { session });

    await fireEvent.click(screen.getByRole('button', { name: 'Hands-free' }));
    expect(session.mode).toBe('hands-free');
    expect(screen.getByRole('button', { name: /start hands-free listening/i })).toBeTruthy();

    // Interrupt is present (disabled while idle).
    const interrupt = screen.getByRole('button', { name: 'Interrupt assistant' });
    expect(interrupt.hasAttribute('disabled')).toBe(true);

    // Programmatic interrupt while speaking (engine path covered in @protoyard/ai tests).
    session.interrupt();
    expect(session.phase).toBe('idle');
    void clock;
    session.destroy();
  });

  it('has no serious accessibility violations on the idle panel', async () => {
    const clock = testClock();
    const session = sessionWith(clock);
    const { container } = render(VoicePanel, { session });
    const results = await axe.run(container);
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical'
    );
    expect(serious).toEqual([]);
    session.destroy();
  });
});
