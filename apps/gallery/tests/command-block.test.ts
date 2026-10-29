import { cleanup, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
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

  it('a command that grows past the width becomes a Tab stop', async () => {
    // The width follows the text, as a one-line `<pre>` that scrolls sideways does.
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (
      this: HTMLElement
    ) {
      return (this.textContent?.length ?? 0) * 10;
    });
    const view = render(CommandBlock, { command: 'pnpm dev', label: 'Run it' });
    const region = screen.getByRole('region', { name: 'Run it' });
    expect(region.hasAttribute('tabindex')).toBe(false);
    await view.rerender({
      command: `pnpm protoyard new ${'a-long-name-'.repeat(6)}`,
      label: 'Run it',
    });
    await tick();
    await vi.waitFor(() => expect(region.getAttribute('tabindex')).toBe('0'));
  });
});
