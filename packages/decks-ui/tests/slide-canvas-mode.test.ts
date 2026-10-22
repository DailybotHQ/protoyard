import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import CanvasModeHarness from './fixtures/CanvasModeHarness.svelte';

afterEach(cleanup);

describe('SlideStepHost canvas mode', () => {
  it('lays blocks out for the slide even when the surrounding host says flow', () => {
    // Regression (deck design gate): a generated deck mounts DeckApp without a
    // block host, so slide blocks inherited "flow" and stacked their columns by
    // the phone's width, past the stage.
    const { container } = render(CanvasModeHarness, {
      props: { slide: { id: 'cards', layout: 'free', blocks: [] } as never },
    });
    const mode = (label: string) =>
      container.querySelector(`[data-canvas-mode-probe="${label}"]`)?.textContent;
    expect(mode('outside')).toBe('flow');
    expect(mode('inside')).toBe('slide');
  });
});
