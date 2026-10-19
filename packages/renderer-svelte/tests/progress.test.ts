import { render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import { describeLoadProgress } from '../src/progress.ts';
import PendingIndicator from '../src/shell/PendingIndicator.svelte';
import { createFakeRuntime } from './fixtures/fake-runtime.ts';

describe('scenario load progress', () => {
  it('labels every phase, determinate only while writing', () => {
    const base = { scenarioId: 'x', done: 0, total: 1 };
    expect(describeLoadProgress({ ...base, phase: 'generate' })).toEqual({
      label: 'Generating the world…',
      fraction: null,
    });
    expect(describeLoadProgress({ ...base, phase: 'validate' }).fraction).toBeNull();
    expect(
      describeLoadProgress({ scenarioId: 'x', phase: 'write', done: 6000, total: 15000 })
    ).toEqual({
      label: 'Writing 6,000 of 15,000 rows…',
      fraction: 0.4,
    });
    expect(
      describeLoadProgress({ scenarioId: 'x', phase: 'write', done: 0, total: 0 }).fraction
    ).toBeNull();
  });

  it('shows the bar while any caller loads and hides it when the load settles', async () => {
    const runtime = createFakeRuntime();
    const seen: string[] = [];
    runtime.scenarios.subscribeProgress((p) => seen.push(p ? p.phase : 'null'));
    render(PendingIndicator, { runtime, delayMs: 0 });
    expect(screen.queryByRole('progressbar')).toBeNull();
    await runtime.scenarios.load('busy');
    flushSync();
    expect(seen).toEqual(['generate', 'validate', 'write', 'done', 'null']);
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
});
