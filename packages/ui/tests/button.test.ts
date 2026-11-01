import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ButtonHarness from './fixtures/ButtonHarness.svelte';

afterEach(() => cleanup());

describe('Button', () => {
  it('loading marks the button aria-disabled (it keeps focus), sets aria-busy and blocks clicks', async () => {
    const onclick = vi.fn();
    render(ButtonHarness, { loading: true, onclick });
    const button = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    // Texuli 0.9 (G94): a pending button is aria-disabled, never natively disabled,
    // so a focused button keeps focus instead of dropping it to <body>.
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.querySelector('[data-tx-button-spinner]')).not.toBeNull();
    await fireEvent.click(button);
    expect(onclick).not.toHaveBeenCalled();
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
    button.focus();
    await fireEvent.click(button);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(button);
    expect(button.querySelector('[data-tx-button-spinner]')).not.toBeNull();
    await fireEvent.click(button);
    expect(onclick).toHaveBeenCalledTimes(1);
    work.resolve();
    await settle();
    expect(button.hasAttribute('aria-busy')).toBe(false);
    expect(button.hasAttribute('aria-disabled')).toBe(false);
    expect(button.querySelector('[data-tx-button-spinner]')).toBeNull();
  });

  it('clears loading after a rejected promise too', async () => {
    const work = deferred();
    render(ButtonHarness, { onclick: () => work.promise.catch(() => undefined) });
    const button = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    await fireEvent.click(button);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    work.reject(new Error('nope'));
    await settle();
    expect(button.hasAttribute('aria-disabled')).toBe(false);
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
});
