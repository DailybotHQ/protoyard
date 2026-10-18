import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatAddress, parseAddress } from '../src/components/browser-chrome/address.ts';
import BrowserChrome from '../src/components/browser-chrome/BrowserChrome.svelte';

beforeEach(() => {
  window.history.replaceState(null, '', `${window.location.pathname}#/home`);
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', `${window.location.pathname}#/home`);
  vi.restoreAllMocks();
});

describe('browser address helpers', () => {
  it('round-trips a fictional origin and hash path', () => {
    const address = formatAddress('https://demo.example.test/', '#/projects/42');
    expect(address).toBe('https://demo.example.test/#/projects/42');
    expect(parseAddress(address)).toBe('#/projects/42');
  });

  it('strips a typed scheme and host so navigation stays in the hash router', () => {
    expect(parseAddress('https://outside.example.test/reports?range=week')).toBe(
      '#/reports?range=week'
    );
    expect(parseAddress('localhost:5173/settings')).toBe('#/settings');
  });

  it('neutralizes javascript schemes into an in-app route', () => {
    const route = parseAddress('javascript:alert(1)');
    expect(route).toBe('#/alert(1)');
    expect(route).not.toContain('javascript:');
  });
});

describe('BrowserChrome', () => {
  it('shows the fictional address and disables unavailable history directions', async () => {
    render(BrowserChrome, { origin: 'https://demo.example.test', title: 'Demo app' });
    expect(screen.getByRole('tab', { name: 'Demo app' })).toBeTruthy();
    expect((screen.getByRole('textbox', { name: 'Address' }) as HTMLInputElement).value).toBe(
      'https://demo.example.test/#/home'
    );
    expect(screen.getByRole('button', { name: 'Back' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Forward' }).hasAttribute('disabled')).toBe(true);
  });

  it('navigates only to a sanitized hash route and wires back and forward to history', async () => {
    render(BrowserChrome, { origin: 'https://demo.example.test' });
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const forward = vi.spyOn(window.history, 'forward').mockImplementation(() => {});
    const address = screen.getByRole('textbox', { name: 'Address' });

    await fireEvent.input(address, { target: { value: 'javascript:alert(1)' } });
    await fireEvent.submit(address.closest('form') as HTMLFormElement);
    await waitFor(() => expect(window.location.hash).toBe('#/alert(1)'));
    expect(screen.getByRole('button', { name: 'Back' }).hasAttribute('disabled')).toBe(false);
    expect(window.location.href).not.toContain('javascript:');

    await fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(back).toHaveBeenCalledOnce();

    window.history.replaceState(null, '', `${window.location.pathname}#/home`);
    await fireEvent(window, new PopStateEvent('popstate'));
    expect(screen.getByRole('button', { name: 'Forward' }).hasAttribute('disabled')).toBe(false);
    await fireEvent.click(screen.getByRole('button', { name: 'Forward' }));
    expect(forward).toHaveBeenCalledOnce();
  });

  it('dispatches a route refresh when reload is pressed', async () => {
    const onHashChange = vi.fn();
    window.addEventListener('hashchange', onHashChange);
    render(BrowserChrome, { origin: 'https://demo.example.test' });
    await fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(onHashChange).toHaveBeenCalledOnce();
    window.removeEventListener('hashchange', onHashChange);
  });
});
