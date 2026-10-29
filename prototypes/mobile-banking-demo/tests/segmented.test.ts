import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Segmented from '../src/components/Segmented.svelte';

afterEach(cleanup);

describe('Segmented', () => {
  it('keeps a named radio group and selects the next option with arrow keys', async () => {
    const onChange = vi.fn();
    render(Segmented, {
      label: 'Color mode',
      options: [
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
        { value: 'system', label: 'System' },
      ],
      value: 'light',
      onChange,
    });

    const group = screen.getByRole('radiogroup', { name: 'Color mode' });
    expect(group.getAttribute('aria-label')).toBe('Color mode');
    const light = screen.getByRole('radio', { name: 'Light' });
    light.focus();
    await fireEvent.keyDown(light, { key: 'ArrowRight' });

    expect(screen.getByRole('radio', { name: 'Dark' }).getAttribute('aria-checked')).toBe('true');
    expect(onChange).toHaveBeenCalledWith('dark');
  });
});
