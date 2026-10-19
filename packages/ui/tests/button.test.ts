import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buttonVariants } from '../src/components/button/button-variants.ts';
import ButtonHarness from './fixtures/ButtonHarness.svelte';

afterEach(() => cleanup());

describe('Button', () => {
  it('renders each variant with its token classes', () => {
    const expectations = {
      default: 'bg-primary',
      secondary: 'bg-secondary',
      outline: 'border-input',
      ghost: 'hover:bg-muted',
      destructive: 'bg-destructive',
      link: 'underline-offset-4',
    } as const;
    for (const [variant, token] of Object.entries(expectations)) {
      const { unmount } = render(ButtonHarness, {
        variant: variant as keyof typeof expectations,
        label: variant,
      });
      const button = screen.getByRole('button', { name: variant });
      expect(button.className).toContain(token);
      unmount();
    }
  });

  it('applies size classes and merges custom classes', () => {
    render(ButtonHarness, { size: 'lg', class: 'w-full px-10' });
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button.className).toContain('h-11');
    expect(button.className).toContain('px-10');
    expect(button.className).not.toContain('px-6');
    expect(buttonVariants({ size: 'icon' })).toContain('size-9');
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
    expect(button.querySelector('svg')).not.toBeNull();
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
    expect(button.querySelector('[data-ui-button-spinner] svg')).not.toBeNull();
    await fireEvent.click(button);
    expect(onclick).toHaveBeenCalledTimes(1);
    work.resolve();
    await settle();
    expect(button.hasAttribute('aria-busy')).toBe(false);
    expect(button.disabled).toBe(false);
    expect(button.querySelector('[data-ui-button-spinner]')).toBeNull();
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
    const button = screen.getByRole('button', { name: /Save/ });
    const label = [...button.querySelectorAll('span')].find((s) => s.textContent === 'Save');
    expect(label?.className).toContain('opacity-0');
    expect(button.querySelector('[data-ui-button-spinner]')?.className).toContain('absolute');
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
    expect(button.querySelector('[data-ui-button-spinner]')).not.toBeNull();
    work.resolve();
    await settle();
    expect(button.hasAttribute('aria-busy')).toBe(false);
  });
});
