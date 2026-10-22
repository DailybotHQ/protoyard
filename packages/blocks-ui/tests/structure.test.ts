import type { Block } from '@protoyard/blocks';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StructureFamily from '../src/structure/StructureFamily.svelte';
import StructureHarness from './fixtures/StructureHarness.svelte';

afterEach(() => {
  document.body.replaceChildren();
});

const timeline: Block = {
  type: 'timeline',
  title: 'Roadmap',
  orientation: 'vertical',
  events: [
    { time: '2024', title: 'Launch', body: 'Shipped the pilot.' },
    { time: '2025', title: 'Scale', icon: 'rocket', tone: 'accent' },
  ],
};

const steps: Block = {
  type: 'steps',
  title: 'How it works',
  numbered: true,
  items: [
    { title: 'Connect', body: 'Link your workspace.' },
    { title: 'Configure', icon: 'settings' },
    { title: 'Publish' },
  ],
};

const comparison: Block = {
  type: 'comparison',
  title: 'Plans',
  columns: [{ label: 'Starter' }, { label: 'Team', highlight: true }],
  rows: [
    { label: 'Seats', values: ['3', 'Unlimited'] },
    { label: 'SSO', values: [false, true] },
  ],
};

const cards: Block = {
  type: 'cards',
  title: 'Features',
  columns: 2,
  items: [
    { title: 'Fast', body: 'Loads quickly.', icon: 'zap', tone: 'success' },
    { title: 'Safe', href: 'https://example.com/security', icon: 'shield' },
  ],
};

const icon: Block = {
  type: 'icon',
  icon: 'star',
  label: 'Featured',
  size: 'lg',
  tone: 'warning',
};

const cta: Block = {
  type: 'cta',
  title: 'Start free',
  body: 'No credit card required.',
  actions: [
    {
      label: 'Create account',
      href: 'https://example.com/signup',
      variant: 'primary',
      icon: 'rocket',
    },
    { label: 'Learn more', href: '#docs', variant: 'link' },
  ],
  footnote: 'Simulated prototype.',
};

describe('structure family renderers', () => {
  it('renders timeline as a labelled ordered list', async () => {
    render(StructureFamily, { block: timeline });
    await tick();
    expect(screen.getByRole('region', { name: 'Roadmap' })).toBeTruthy();
    expect(screen.getByText('Launch')).toBeTruthy();
    expect(screen.getByText('Scale')).toBeTruthy();
    expect(document.querySelectorAll('[data-block-type="timeline"] ol li').length).toBe(2);
  });

  it('renders steps with numbers and icons', async () => {
    render(StructureFamily, { block: steps });
    await tick();
    expect(document.querySelector('[data-block-type="steps"]')).toBeTruthy();
    expect(screen.getByText('How it works')).toBeTruthy();
    expect(screen.getByText('Connect')).toBeTruthy();
    expect(screen.getByText('Configure')).toBeTruthy();
    expect(document.querySelectorAll('[data-block-type="steps"] ol li').length).toBe(3);
  });

  it('renders comparison as a real table with row and column headers', async () => {
    render(StructureFamily, { block: comparison });
    await tick();
    const table = screen.getByRole('table', { name: 'Plans' });
    expect(within(table).getByRole('columnheader', { name: /Team/ })).toBeTruthy();
    expect(within(table).getByRole('rowheader', { name: 'Seats' })).toBeTruthy();
    expect(within(table).getByText('Unlimited')).toBeTruthy();
    expect(within(table).getByText('Yes')).toBeTruthy();
    expect(within(table).getByText('No')).toBeTruthy();
  });

  it('renders cards and icons with accessible names', async () => {
    render(StructureFamily, { block: cards });
    await tick();
    expect(screen.getByText('Features')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Safe' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Safe' }).getAttribute('href')).toBe(
      'https://example.com/security'
    );

    document.body.replaceChildren();
    render(StructureFamily, { block: icon });
    await tick();
    expect(screen.getByRole('img', { name: 'Featured' })).toBeTruthy();
  });

  it('shows CTA pending state until the host action promise settles', async () => {
    let finish: (() => void) | undefined;
    const onCtaAction = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    render(StructureHarness, { block: cta, onCtaAction });
    await tick();
    const button = screen.getByRole('button', { name: /Create account/ });
    await fireEvent.click(button);
    expect(onCtaAction).toHaveBeenCalledWith({
      label: 'Create account',
      href: 'https://example.com/signup',
    });
    await waitFor(() => expect(button.getAttribute('aria-busy')).toBe('true'));
    finish?.();
    await waitFor(() => expect(button.getAttribute('aria-busy')).not.toBe('true'));
  });

  it('renders columns and resolves nested structure children', async () => {
    const columns: Block = {
      type: 'columns',
      widths: 'equal',
      columns: [
        [{ type: 'icon', icon: 'check', label: 'Left' }],
        [{ type: 'icon', icon: 'star', label: 'Right' }],
      ],
    };
    render(StructureFamily, { block: columns });
    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Left' })).toBeTruthy();
      expect(screen.getByRole('img', { name: 'Right' })).toBeTruthy();
    });
    expect(document.querySelector('[data-block-type="columns"]')).toBeTruthy();
  });
});

describe('structure grids on a slide', () => {
  // Regression: on a phone, `sm:`/`lg:` breakpoints follow the 412px viewport,
  // not the fixed-size slide canvas, so cards stacked in one column and ran
  // past the stage over the deck footer (deck design gate, flagship "kinds").
  const viewportBreakpoint = /(^|\s)(sm|md|lg|xl|max-\[[^\]]+\]):grid-cols/;
  const gridClassOf = (container: HTMLElement) =>
    [...container.querySelectorAll<HTMLElement>('.grid')]
      .map((node) => node.getAttribute('class') ?? '')
      .filter((value) => value.includes('grid-cols'));

  it('fixes the columns of cards, columns and steps on a slide', () => {
    const blocks = [
      {
        type: 'cards',
        columns: 4,
        items: [1, 2, 3, 4].map((n) => ({ title: `Card ${n}`, text: 'Fictional.' })),
      },
      {
        type: 'columns',
        columns: [[{ type: 'text', markdown: 'Left' }], [{ type: 'text', markdown: 'Right' }]],
      },
      { type: 'steps', items: [{ title: 'One' }, { title: 'Two' }, { title: 'Three' }] },
    ];
    for (const block of blocks) {
      const { container, unmount } = render(StructureHarness, {
        props: { block: block as never, canvasMode: 'slide' },
      });
      const classes = gridClassOf(container);
      expect(classes.length, block.type).toBeGreaterThan(0);
      for (const value of classes) expect(value, block.type).not.toMatch(viewportBreakpoint);
      unmount();
    }
    // Pages and docs (flow) stay responsive.
    const { container } = render(StructureHarness, {
      props: { block: blocks[0] as never, canvasMode: 'flow' },
    });
    expect(gridClassOf(container).join(' ')).toMatch(viewportBreakpoint);
  });
});
