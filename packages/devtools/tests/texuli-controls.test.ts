import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import FileInput from '../src/primitives/FileInput.svelte';
import Initials from '../src/primitives/Initials.svelte';
import Segmented from '../src/primitives/Segmented.svelte';
import SourceBadge from '../src/primitives/SourceBadge.svelte';
import Toggle from '../src/primitives/Toggle.svelte';
import BtnHarness from './fixtures/BtnHarness.svelte';

/**
 * DevTools panel adapters mount real Texuli components (T-adopt-devtools).
 */

describe('DevTools Texuli control adapters', () => {
  it('Btn renders a Texuli button with the mapped variant', () => {
    render(BtnHarness, { props: { label: 'Save', variant: 'primary' } });
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button.className).toMatch(/tx-button/);
    expect(button.getAttribute('data-py-devtools-btn')).toBe('');
  });

  it('Toggle renders a Texuli switch', () => {
    render(Toggle, {
      props: {
        checked: false,
        label: 'Dark mode',
        onchange: () => {},
      },
    });
    expect(screen.getByRole('switch', { name: 'Dark mode' })).toBeTruthy();
  });

  it('Segmented keeps the panel radiogroup keyboard model', () => {
    render(Segmented, {
      props: {
        value: 'light',
        label: 'Color mode',
        options: [
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ],
        onchange: () => {},
      },
    });
    expect(screen.getByRole('radiogroup', { name: 'Color mode' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Light' })).toBeTruthy();
  });

  it('SourceBadge uses a Texuli badge', () => {
    const { container } = render(SourceBadge, { props: { source: 'override' } });
    expect(container.querySelector('[data-tx-badge]')).toBeTruthy();
    expect(container.textContent).toMatch(/override/i);
  });

  it('FileInput uses the Texuli upload control and keeps hidden input keyboard behavior', () => {
    const { container } = render(FileInput, {
      props: { accept: 'application/json,.json', label: 'Theme file', hidden: true },
    });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.getAttribute('aria-label')).toBe('Theme file');
    expect(input.accept).toBe('application/json,.json');
    expect(input.tabIndex).toBe(-1);
    expect(container.querySelector('[data-tx-file-upload]')).toBeTruthy();
  });

  it('Initials delegates the decorative persona avatar to Texuli', () => {
    const { container } = render(Initials, {
      props: { name: 'Ada Example', color: '#345678', size: 'sm' },
    });
    const avatar = container.querySelector('[data-tx-avatar]');
    expect(avatar?.getAttribute('aria-hidden')).toBe('true');
    expect(avatar?.getAttribute('data-size')).toBe('sm');
    expect(avatar?.textContent).toContain('AE');
  });
});
