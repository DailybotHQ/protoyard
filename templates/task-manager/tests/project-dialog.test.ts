import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { TaskDatabase } from '../src/database/schema.ts';
import { definition } from '../src/prototype.ts';
import ProjectDialogHarness from './ProjectDialogHarness.svelte';

let harness = createHarness<TaskDatabase>(definition);
afterEach(() => {
  cleanup();
  harness.closeAll();
  harness = createHarness<TaskDatabase>(definition);
});

describe('task-manager project dialog', () => {
  it('changes the selected color with radio-group keyboard navigation', async () => {
    const runtime = await harness.boot('active-team');
    render(ProjectDialogHarness, { runtime });
    const violet = await screen.findByRole('radio', { name: 'violet' });
    expect(violet.getAttribute('aria-checked')).toBe('true');
    await fireEvent.keyDown(violet, { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: 'blue' }).getAttribute('aria-checked')).toBe('true');
  });
});
