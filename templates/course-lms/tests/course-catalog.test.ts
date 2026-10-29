import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import type { CourseLmsDatabase } from '../src/database/schema.ts';
import { definition } from '../src/prototype.ts';
import AppHost from './AppHost.svelte';

let harness = createHarness<CourseLmsDatabase>(definition);
afterEach(() => {
  cleanup();
  harness.closeAll();
  harness = createHarness<CourseLmsDatabase>(definition);
});

describe('course catalog quiz choices', () => {
  it('uses named Texuli radio groups and preserves arrow-key selection', async () => {
    const runtime = await harness.boot('student-active');
    render(AppHost, { runtime });

    const groups = await screen.findAllByRole('radiogroup');
    expect(groups.length).toBeGreaterThan(0);
    const group = groups[0];
    if (!group) throw new Error('expected a quiz question radio group');
    expect(group.getAttribute('aria-label')).toBeTruthy();
    expect(group.getAttribute('role')).toBe('radiogroup');

    const choices = within(group).getAllByRole('radio');
    const first = choices[0];
    const second = choices[1];
    if (!first || !second) throw new Error('expected at least two quiz choices');
    first.focus();
    await fireEvent.keyDown(first, { key: 'ArrowDown' });

    expect(second.getAttribute('aria-checked')).toBe('true');
  });
});
