import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CommandBlock from '../src/components/CommandBlock.svelte';

/**
 * A command block is a Tab stop only while its command scrolls sideways, so
 * keyboard users can scroll it (WCAG 2.1.1) and a page of short commands has
 * no extra stops. The server HTML keeps `tabindex="0"` until hydration.
 */
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function widths(scrollWidth: number, clientWidth: number) {
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(scrollWidth);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(clientWidth);
}

describe('CommandBlock tab stop', () => {
  it('a command that fits adds no Tab stop once hydrated', () => {
    widths(200, 400);
    render(CommandBlock, { command: 'pnpm dev', label: 'Run it' });
    expect(screen.getByRole('region', { name: 'Run it' }).hasAttribute('tabindex')).toBe(false);
  });

  it('a command that scrolls is a Tab stop', () => {
    widths(900, 400);
    render(CommandBlock, { command: 'pnpm protoyard dev a-very-long-slug', label: 'Run it' });
    expect(screen.getByRole('region', { name: 'Run it' }).getAttribute('tabindex')).toBe('0');
  });
});
