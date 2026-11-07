import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Inbox from '@lucide/svelte/icons/inbox';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChipGroup, Select, Sidebar } from '../src/index.ts';
import LabelsHarness from './fixtures/LabelsHarness.svelte';

afterEach(() => cleanup());

const srcDir = join(import.meta.dirname, '../src');

describe('Sidebar icons and labels (UG-21)', () => {
  const items = [
    { label: 'Inbox', href: '#/inbox', icon: Inbox },
    { label: 'Reports', href: '#/reports' },
  ];

  it('renders item.icon on the collapsed rail instead of two letters', () => {
    render(Sidebar, { props: { items, collapsed: true } });
    const links = document.querySelectorAll('[data-tx-sidebar-item]');
    const inbox = links[0] as HTMLElement;
    expect(inbox.querySelector('svg')).toBeTruthy();
    expect(inbox.querySelector('.tx-sidebar__icon')?.textContent?.trim()).toBe('');
    // An item without an icon keeps Texuli's two-letter stand-in.
    expect((links[1] as HTMLElement).querySelector('.tx-sidebar__icon')?.textContent?.trim()).toBe(
      'RE'
    );
  });

  it('forwards collapseLabel and expandLabel, and leaves them to the dictionary otherwise', () => {
    render(Sidebar, { props: { items, collapseLabel: 'Hide navigation' } });
    expect(screen.getByRole('button', { name: 'Hide navigation' })).toBeTruthy();
    cleanup();
    render(Sidebar, { props: { items, collapsed: true, expandLabel: 'Show navigation' } });
    expect(screen.getByRole('button', { name: 'Show navigation' })).toBeTruthy();
    cleanup();
    render(LabelsHarness, {
      component: Sidebar,
      innerProps: { items },
      labels: { 'texuli.sidebar.collapse-label': 'Contraer', 'texuli.sidebar.label': 'Principal' },
    });
    expect(screen.getByRole('button', { name: 'Contraer' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeTruthy();
  });
});

describe('ChipGroup variant (UG-49) and Select fullWidth (UG-20)', () => {
  const options = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta' },
  ];

  it('variant="outline" renders outline toggle items; the default stays default', () => {
    render(ChipGroup, { props: { items: options, label: 'Pick', variant: 'outline' } });
    expect(document.querySelectorAll('.tx-toggle--outline')).toHaveLength(2);
    cleanup();
    render(ChipGroup, { props: { items: options, label: 'Pick' } });
    expect(document.querySelectorAll('.tx-toggle--outline')).toHaveLength(0);
  });

  it('required keeps the selected chip selected in single mode (UG-54)', async () => {
    const onchange = vi.fn();
    render(ChipGroup, {
      props: { items: options, label: 'Pick', value: ['a'], required: true, onchange },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Alpha' }));
    expect(screen.getByRole('button', { name: 'Alpha' }).getAttribute('aria-pressed')).toBe('true');
    expect(onchange).not.toHaveBeenCalledWith([]);
  });

  it('without required, pressing the selected chip clears single mode', async () => {
    const onchange = vi.fn();
    render(ChipGroup, { props: { items: options, label: 'Pick', value: ['a'], onchange } });
    await fireEvent.click(screen.getByRole('button', { name: 'Alpha' }));
    expect(onchange).toHaveBeenCalledWith([]);
  });

  it("fullWidth (or block) sets Texuli's block on the root; without it the root is inline", () => {
    render(Select, { props: { items: options, fullWidth: true, 'aria-label': 'Stage' } });
    expect(document.querySelector('.tx-select-root')?.getAttribute('data-block')).toBe('true');
    cleanup();
    render(Select, { props: { items: options, block: true, 'aria-label': 'Stage' } });
    expect(document.querySelector('.tx-select-root')?.hasAttribute('data-block')).toBe(true);
    cleanup();
    render(Select, { props: { items: options, 'aria-label': 'Stage' } });
    expect(document.querySelector('.tx-select-root')?.hasAttribute('data-block')).toBe(false);
  });

  it('forwards variant="ghost" to the Texuli root (G-059)', () => {
    render(Select, { props: { items: options, variant: 'ghost', 'aria-label': 'Stage' } });
    expect(document.querySelector('.tx-select-root')?.getAttribute('data-variant')).toBe('ghost');
  });
});

describe('ui CSS tokens (UG-15, UG-52)', () => {
  it('declares --tx-app-height and --tx-safe-* on :root as well as inside frames', () => {
    const css = readFileSync(join(srcDir, 'styles.css'), 'utf8');
    const rule = css.match(/([^{}]*)\{\s*--tx-app-height:[^}]*\}/);
    // The selector list is what follows the comment that precedes the rule.
    const selectors = (rule?.[1] ?? '')
      .split('*/')
      .at(-1)
      ?.split(',')
      .map((s) => s.trim());
    expect(selectors).toEqual([
      ':root',
      '.tx-app-shell',
      '.tx-mobile-frame',
      '[data-py-layout-host]',
    ]);
    for (const side of ['top', 'right', 'bottom', 'left']) {
      expect(rule?.[0]).toContain(`--tx-safe-${side}:`);
    }
  });

  it('the drawer and panel close control uses the dialog close size token, not a fixed size', () => {
    const css = readFileSync(join(srcDir, 'components/overlay/sheet-parts.css'), 'utf8');
    const close = css.match(/\.ui-sheet__close \{[^}]*\}/)?.[0] ?? '';
    expect(close).toContain('inline-size: var(--tx-size-control-md');
    expect(close).toContain('block-size: var(--tx-size-control-md');
  });
});
