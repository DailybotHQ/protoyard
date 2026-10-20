import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import A11yHarness from './fixtures/A11yHarness.svelte';
import ShellHarness from './fixtures/ShellHarness.svelte';

afterEach(() => cleanup());

describe('axe regressions', () => {
  it('AppShell wraps the desktop sidebar in a labelled landmark (region rule)', () => {
    render(ShellHarness, {});
    expect(screen.getByRole('complementary', { name: 'Navigation' })).toBeTruthy();
    expect(screen.getByRole('main')).toBeTruthy();
  });

  it('Select never puts aria-required on its button trigger (aria-allowed-attr)', () => {
    render(A11yHarness);
    const trigger = screen.getByRole('combobox', { name: /Stage/ });
    expect(trigger.hasAttribute('aria-required')).toBe(false);
  });

  it('Kanban headings follow the requested level (heading-order)', () => {
    render(A11yHarness);
    expect(screen.getByRole('heading', { level: 2, name: 'To do' })).toBeTruthy();
  });
});
