import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import VoiceMode from '../src/voice/VoiceMode.svelte';

afterEach(() => cleanup());

describe('VoiceMode', () => {
  it('runs push-to-talk captions on simulated time and always presents reply captions', async () => {
    let elapsed = 0;
    const onTranscript = vi.fn();
    render(VoiceMode, {
      clock: {
        now: () => new Date(elapsed),
        nowMs: () => elapsed,
        sleep: async (ms: number) => {
          elapsed += ms;
        },
      },
      transcripts: ['A scripted voice request.'],
      transcriptDelayMs: 250,
      reply: 'A simulated spoken answer.',
      onTranscript,
    });

    expect(
      screen.getByText('Speech output is muted in this browser; captions remain available.')
    ).toBeTruthy();
    expect(screen.getByText('A simulated spoken answer.')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Start push to talk' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Finish and transcribe' }));

    await waitFor(() => expect(onTranscript).toHaveBeenCalledWith('A scripted voice request.'));
    expect(elapsed).toBe(250);
    expect(screen.getByText('A scripted voice request.')).toBeTruthy();
  });

  it('does not request microphone access unless the optional meter is enabled and chosen', async () => {
    const getUserMedia = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    render(VoiceMode, { clock: { now: () => new Date(0), nowMs: () => 0, sleep: async () => {} } });

    expect(screen.queryByRole('button', { name: /local mic level meter/i })).toBeNull();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('exposes hands-free mode and an interruption control', async () => {
    render(VoiceMode, {
      clock: { now: () => new Date(0), nowMs: () => 0, sleep: () => new Promise<void>(() => {}) },
      transcripts: ['A hands-free caption.'],
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Hands-free' }));

    expect(screen.getByRole('button', { name: 'Stop hands-free' })).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Interrupt voice' }));
    expect(screen.getByRole('button', { name: 'Resume voice mode' })).toBeTruthy();
  });

  it('uses local speech synthesis when present and cancels it on interruption', async () => {
    const originalSynthesis = Object.getOwnPropertyDescriptor(window, 'speechSynthesis');
    const originalUtterance = Object.getOwnPropertyDescriptor(window, 'SpeechSynthesisUtterance');
    const speak = vi.fn();
    const cancel = vi.fn();
    class TestUtterance {
      text: string;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: { speak, cancel },
    });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: TestUtterance,
    });

    try {
      render(VoiceMode, {
        clock: { now: () => new Date(0), nowMs: () => 0, sleep: async () => {} },
        reply: 'Local synthesized reply.',
      });
      await waitFor(() =>
        expect(speak).toHaveBeenCalledWith(
          expect.objectContaining({ text: 'Local synthesized reply.' })
        )
      );
      await fireEvent.click(screen.getByRole('button', { name: 'Start push to talk' }));
      await fireEvent.click(screen.getByRole('button', { name: 'Interrupt voice' }));
      expect(cancel).toHaveBeenCalled();
    } finally {
      cleanup();
      if (originalSynthesis) Object.defineProperty(window, 'speechSynthesis', originalSynthesis);
      else Reflect.deleteProperty(window, 'speechSynthesis');
      if (originalUtterance)
        Object.defineProperty(window, 'SpeechSynthesisUtterance', originalUtterance);
      else Reflect.deleteProperty(window, 'SpeechSynthesisUtterance');
    }
  });
});
