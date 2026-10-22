import type { Block } from '@protoyard/blocks';
import { render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, it } from 'vitest';
import StructureFamily from '../src/structure/StructureFamily.svelte';

describe('timeline label layout', () => {
  it('places each vertical marker in its own column beside the event label', async () => {
    const timeline: Block = {
      type: 'timeline',
      title: 'Quarterly roadmap',
      orientation: 'vertical',
      events: [
        { time: 'JULY', title: 'Pilot launch' },
        { time: 'AUGUST', title: 'Regional rollout' },
      ],
    };

    const view = render(StructureFamily, { block: timeline });
    await tick();

    const region = screen.getByRole('region', { name: 'Quarterly roadmap' });
    expect(region.getAttribute('data-orientation')).toBe('vertical');
    const events = Array.from(region.querySelectorAll('[data-py-timeline-event]'));
    expect(events).toHaveLength(2);
    for (const event of events) {
      const marker = event.querySelector('[data-py-timeline-marker]');
      const time = event.querySelector('[data-py-timeline-time]');
      expect(marker).toBeTruthy();
      expect(time).toBeTruthy();
      expect(marker?.className).not.toMatch(/\babsolute\b/);
      expect(event.className).toMatch(/grid-cols-\[/);
      expect(time?.className).toMatch(/col-start-2/);
    }
    expect(view.container.textContent).toContain('JULY');
    expect(view.container.textContent).toContain('AUGUST');
  });
});
