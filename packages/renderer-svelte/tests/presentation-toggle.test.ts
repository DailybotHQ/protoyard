import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createAdaptivePresentation,
  PresentationToggle,
  parsePresentationView,
} from '../src/index.ts';
import LabeledToggle from './fixtures/LabeledToggle.svelte';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('adaptive presentation aliases and toggle (Corag UG-13)', () => {
  it('reads alias link values as views', () => {
    const values = { escritorio: 'desktop', movil: 'phone' } as const;
    expect(parsePresentationView('/?vista=escritorio', 'vista', values)).toBe('desktop');
    expect(parsePresentationView('/#/inicio?vista=movil', 'vista', values)).toBe('phone');
    expect(parsePresentationView('/?vista=phone', 'vista', values)).toBe('phone');
    expect(parsePresentationView('/?vista=toString', 'vista', values)).toBeNull();
    expect(parsePresentationView('/?vista=escritorio', 'vista')).toBeNull();
  });

  it('switches the view and keeps it on a repeat tap', async () => {
    const store = createAdaptivePresentation(undefined, {
      initialWidth: 1280,
      storage: localStorage,
    });
    render(PresentationToggle, { props: { store } });
    const phone = screen.getByRole('button', { name: 'Phone' });
    const desktop = screen.getByRole('button', { name: 'Desktop' });
    expect(desktop.getAttribute('aria-pressed')).toBe('true');
    await fireEvent.click(phone);
    expect(store.view).toBe('phone');
    expect(store.preference).toBe('phone');
    await fireEvent.click(phone);
    expect(store.view).toBe('phone');
    store.destroy();
  });

  it('takes its labels from the dictionary', () => {
    const store = createAdaptivePresentation(undefined, { initialWidth: 400 });
    render(LabeledToggle, { props: { store } });
    expect(screen.getByRole('button', { name: 'Escritorio' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Phone' })).toBeTruthy();
    store.destroy();
  });
});
