import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buttonVariants } from '../src/index.ts';
import ButtonHarness from './fixtures/ButtonHarness.svelte';

afterEach(() => cleanup());

describe('Button', () => {
  it('renders each variant and size with its class, and keeps custom classes', () => {
    const variants = ['default', 'secondary', 'outline', 'ghost', 'destructive', 'link'] as const;
    for (const variant of variants) {
      const { unmount } = render(ButtonHarness, { variant, label: variant });
      expect(screen.getByRole('button', { name: variant }).className).toContain(
        `tx-button--${variant}`
      );
      unmount();
    }
    render(ButtonHarness, { size: 'lg', class: 'w-full' });
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button.className).toContain('tx-button--lg');
    expect(button.className).toContain('w-full');
    expect(buttonVariants({ size: 'icon' })).toContain('tx-button--icon');
  });

  it('fires click handlers', async () => {
    const onclick = vi.fn();
    render(ButtonHarness, { onclick });
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onclick).toHaveBeenCalledTimes(1);
  });

  it('loading disables the button, sets aria-busy and blocks clicks', async () => {
    const onclick = vi.fn();
    render(ButtonHarness, { loading: true, onclick });
    const button = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.querySelector('[data-tx-button-spinner]')).not.toBeNull();
    await fireEvent.click(button);
    expect(onclick).not.toHaveBeenCalled();
  });

  it('renders an anchor when href is set', () => {
    render(ButtonHarness, { href: '#/projects', label: 'Projects' });
    const link = screen.getByRole('link', { name: 'Projects' });
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('#/projects');
    expect(link.hasAttribute('type')).toBe(false);
  });

  it('disabled links drop href and are removed from the tab order', () => {
    render(ButtonHarness, { href: '#/projects', disabled: true, label: 'Projects' });
    const link = screen.getByText('Projects').closest('a');
    expect(link?.hasAttribute('href')).toBe(false);
    expect(link?.getAttribute('aria-disabled')).toBe('true');
    expect(link?.getAttribute('tabindex')).toBe('-1');
  });
});

describe('Button pending feedback', () => {
  function deferred() {
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it('an async onclick shows the spinner, aria-busy and blocks double clicks until it settles', async () => {
    const work = deferred();
    const onclick = vi.fn(() => work.promise);
    render(ButtonHarness, { onclick });
    const button = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    await fireEvent.click(button);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.disabled).toBe(true);
    expect(button.querySelector('[data-tx-button-spinner]')).not.toBeNull();
    await fireEvent.click(button);
    expect(onclick).toHaveBeenCalledTimes(1);
    work.resolve();
    await settle();
    expect(button.hasAttribute('aria-busy')).toBe(false);
    expect(button.disabled).toBe(false);
    expect(button.querySelector('[data-tx-button-spinner]')).toBeNull();
  });

  it('clears loading after a rejected promise too', async () => {
    const work = deferred();
    render(ButtonHarness, { onclick: () => work.promise.catch(() => undefined) });
    const button = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    await fireEvent.click(button);
    expect(button.disabled).toBe(true);
    work.reject(new Error('nope'));
    await settle();
    expect(button.disabled).toBe(false);
  });

  it('keeps the label in place while loading, so the width cannot change', () => {
    render(ButtonHarness, { loading: true, loadingLabel: 'Saving' });
    // While loading, `loadingLabel` is the accessible name (Texuli 0.3.0).
    const button = screen.getByRole('button', { name: 'Saving' });
    const label = [...button.querySelectorAll('span')].find((s) => s.textContent === 'Save');
    // The label stays in the layout, hidden from sight and from the name, under the spinner.
    expect(label?.className).toContain('tx-button__label--hidden');
    expect(label?.getAttribute('aria-hidden')).toBe('true');
    expect(button.querySelector('[data-tx-button-spinner]')).not.toBeNull();
  });

  it('autoLoading={false} opts out', async () => {
    const work = deferred();
    render(ButtonHarness, { onclick: () => work.promise, autoLoading: false });
    const button = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    await fireEvent.click(button);
    expect(button.disabled).toBe(false);
    expect(button.hasAttribute('aria-busy')).toBe(false);
    work.resolve();
  });

  it('icon buttons keep their icon slot and show the spinner over it', async () => {
    const work = deferred();
    render(ButtonHarness, { size: 'icon', label: 'Delete', onclick: () => work.promise });
    const button = screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement;
    await fireEvent.click(button);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.querySelector('[data-tx-button-spinner]')).not.toBeNull();
    work.resolve();
    await settle();
    expect(button.hasAttribute('aria-busy')).toBe(false);
  });
});
