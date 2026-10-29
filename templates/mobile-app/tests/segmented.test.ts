import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Segmented from '../src/components/Segmented.svelte';

afterEach(cleanup);

describe('Segmented', () => {
  it('keeps a named radio group and selects the next option with arrow keys', async () => {
    const onChange = vi.fn();
    render(Segmented, {
      label: 'Status',
      options: [
        { value: 'todo', label: 'To do' },
        { value: 'doing', label: 'Doing' },
        { value: 'done', label: 'Done' },
      ],
      value: 'todo',
      onChange,
    });

    const group = screen.getByRole('radiogroup', { name: 'Status' });
    expect(group.getAttribute('aria-label')).toBe('Status');
    const todo = screen.getByRole('radio', { name: 'To do' });
    todo.focus();
    await fireEvent.keyDown(todo, { key: 'ArrowRight' });

    expect(screen.getByRole('radio', { name: 'Doing' }).getAttribute('aria-checked')).toBe('true');
    expect(onChange).toHaveBeenCalledWith('doing');
  });
});
