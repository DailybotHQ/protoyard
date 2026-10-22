import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ProposalTag from '../src/components/honesty/ProposalTag.svelte';
import SimulatedTag from '../src/components/honesty/SimulatedTag.svelte';
import Notice from '../src/components/notice/Notice.svelte';
import { NOTICE_TONES } from '../src/components/notice/tones.ts';
import StatusChip from '../src/components/status-chip/StatusChip.svelte';

afterEach(cleanup);

describe('Notice', () => {
  it('uses status for info and alert for error', () => {
    const info = render(Notice, {
      props: { tone: 'info', title: 'Heads up', text: 'Optional tip.' },
    });
    expect(info.getByRole('status').getAttribute('data-tone')).toBe('info');
    expect(info.getByText('Heads up')).toBeTruthy();
    info.unmount();

    const error = render(Notice, {
      props: { tone: 'error', title: 'Could not save', text: 'Try again.' },
    });
    expect(error.getByRole('alert').getAttribute('data-tone')).toBe('error');
  });

  it('renders all five tones without throwing', () => {
    for (const tone of NOTICE_TONES) {
      const view = render(Notice, { props: { tone, title: tone } });
      expect(view.container.querySelector(`[data-tone="${tone}"]`)).toBeTruthy();
      view.unmount();
    }
  });

  it('runs an async action with pending feedback on the button', async () => {
    let resolveAction!: () => void;
    const pending = new Promise<void>((resolve) => {
      resolveAction = resolve;
    });
    const onAction = vi.fn(() => pending);
    const view = render(Notice, {
      props: {
        title: 'Privacy',
        text: 'Data stays on this device.',
        actionLabel: 'Learn more',
        onAction,
      },
    });
    const button = view.getByRole('button', { name: 'Learn more' });
    await fireEvent.click(button);
    expect(onAction).toHaveBeenCalledOnce();
    await waitFor(() => expect(button.getAttribute('aria-busy')).toBe('true'));
    resolveAction();
    await waitFor(() => expect(button.getAttribute('aria-busy')).not.toBe('true'));
  });
});

describe('honesty tags', () => {
  it('SimulatedTag always shows a word and a title explanation', () => {
    const view = render(SimulatedTag, {});
    const tag = view.container.querySelector('[data-py-tag="simulated"]');
    expect(tag?.textContent).toContain('Simulated');
    expect(tag?.getAttribute('title')).toMatch(/simulated/i);
  });

  it('ProposalTag marks proposals under review', () => {
    const view = render(ProposalTag, {});
    const tag = view.container.querySelector('[data-py-tag="proposal"]');
    expect(tag?.textContent).toContain('Proposal under review');
    expect(tag?.getAttribute('title')).toMatch(/proposal/i);
  });

  it('allows custom labels while keeping visible text', () => {
    const sim = render(SimulatedTag, { props: { label: 'Demo only' } });
    expect(sim.container.textContent).toContain('Demo only');
    sim.unmount();
    const prop = render(ProposalTag, { props: { label: 'Draft idea' } });
    expect(prop.container.textContent).toContain('Draft idea');
  });
});

describe('StatusChip', () => {
  it('always renders the label word for every tone', () => {
    for (const tone of ['neutral', 'success', 'warning', 'error', 'info', 'brand'] as const) {
      const view = render(StatusChip, { props: { label: 'Open', tone } });
      const chip = view.container.querySelector('[data-py-status-chip]');
      expect(chip?.textContent).toContain('Open');
      expect(chip?.getAttribute('data-tone')).toBe(tone);
      view.unmount();
    }
  });
});
