import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet, flushSync, tick } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BottomNav,
  LayoutHost,
  MobileHeader,
  PageGrid,
  StatusChip,
  WindowChrome,
} from '../src/index.ts';
import ContractHarness from './fixtures/ContractHarness.svelte';

/**
 * What the uniform contract (tests/contract.test.ts) does not cover for the
 * frames and adapters: the component's own hooks and ARIA win over a caller's
 * rest attributes, `ref` follows a root that changes, and a ref captured
 * through Texuli's rest spread is released on unmount.
 */

const text = (value: string) => createRawSnippet(() => ({ render: () => `<span>${value}</span>` }));

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

function renderWithRef(component: unknown, props: Record<string, unknown>) {
  const refs: unknown[] = [];
  const result = render(ContractHarness, {
    props: {
      component: component as never,
      props,
      onRef: (value: unknown) => refs.push(value),
    },
  });
  flushSync();
  return { refs, result };
}

describe('frame hooks stay intact under rest attributes', () => {
  it('WindowChrome keeps its data hooks and moves ref to the current state’s root', async () => {
    const { refs } = renderWithRef(WindowChrome, {
      title: 'Notes',
      children: text('Body'),
      'data-state': 'caller',
      'data-window-chrome': 'caller',
      'data-extra': 'yes',
    });
    await tick();
    const open = refs.at(-1) as HTMLElement;
    expect(open.getAttribute('data-state')).toBe('open');
    expect(open.getAttribute('data-window-chrome')).toBe('');
    expect(open.getAttribute('data-extra')).toBe('yes');

    await fireEvent.click(screen.getByRole('button', { name: 'Minimize' }));
    flushSync();
    await tick();
    const minimized = refs.at(-1) as HTMLElement;
    expect(minimized).not.toBe(open);
    expect(minimized.getAttribute('data-state')).toBe('minimized');
    expect(minimized.getAttribute('data-extra')).toBe('yes');
    expect(minimized.isConnected).toBe(true);
  });

  it('LayoutHost keeps its hooks, merges the caller style and refs the host div', async () => {
    const { refs } = renderWithRef(LayoutHost, {
      layout: 'custom',
      children: text('Screen'),
      'data-layout': 'caller',
      style: 'color: red',
    });
    await tick();
    const host = refs.at(-1) as HTMLElement;
    expect(host.getAttribute('data-py-layout-host')).toBe('');
    expect(host.getAttribute('data-layout')).toBe('custom');
    expect(host.style.color).toBe('red');
    expect(host.style.getPropertyValue('container-type')).toBe('inline-size');
  });

  it('StatusChip keeps its tone hook over a caller data-tone', async () => {
    const { refs } = renderWithRef(StatusChip, {
      label: 'Active',
      tone: 'success',
      'data-tone': 'caller',
    });
    await tick();
    const chip = refs.at(-1) as HTMLElement;
    expect(chip.getAttribute('data-tone')).toBe('success');
    expect(chip.hasAttribute('data-py-status-chip')).toBe(true);
  });
});

describe('PageGrid landmark', () => {
  it('keeps a caller role and name when it has no label, and its own region with one', async () => {
    const plain = renderWithRef(PageGrid, {
      children: text('Cards'),
      role: 'list',
      'aria-label': 'Cards',
    });
    await tick();
    const grid = plain.refs.at(-1) as HTMLElement;
    expect(grid.getAttribute('role')).toBe('list');
    expect(grid.getAttribute('aria-label')).toBe('Cards');
    cleanup();

    const labelled = renderWithRef(PageGrid, {
      children: text('Cards'),
      label: 'Deals',
      role: 'list',
    });
    await tick();
    const region = labelled.refs.at(-1) as HTMLElement;
    expect(region.getAttribute('role')).toBe('region');
    expect(region.getAttribute('aria-label')).toBe('Deals');
  });
});

describe('refs captured through Texuli’s rest spread', () => {
  for (const [name, component, props, tag] of [
    ['BottomNav', BottomNav, { items: [{ label: 'Home', href: '#/' }], fixed: false }, 'NAV'],
    ['MobileHeader', MobileHeader, { title: 'Inbox' }, 'HEADER'],
  ] as const) {
    it(`${name} reports its root, keeps its hooks and releases the ref on unmount`, async () => {
      const { refs, result } = renderWithRef(component, { ...props, 'data-extra': 'yes' });
      await tick();
      const root = refs.at(-1) as HTMLElement;
      expect(root.tagName).toBe(tag);
      expect(root.getAttribute('data-extra')).toBe('yes');
      if (name === 'BottomNav') expect(root.hasAttribute('data-py-bottom-nav')).toBe(true);
      result.unmount();
      flushSync();
      expect(root.isConnected).toBe(false);
    });
  }
});
