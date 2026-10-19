import { PermissionDeniedError, SimulatedServiceError } from '@protoyard/core';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { createRawSnippet, tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { classifyQueryError, QueryState } from '../src/states/index.ts';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

interface Deal {
  id: string;
  name: string;
}

const list = createRawSnippet((deals: () => Deal[]) => ({
  render: () =>
    `<ul data-testid="deals">${deals()
      .map((deal) => `<li>${deal.name}</li>`)
      .join('')}</ul>`,
}));
const newDeal = createRawSnippet(() => ({
  render: () => '<button type="button">New deal</button>',
}));

const query = (state: { current?: Deal[]; loading?: boolean; error?: unknown }) => ({
  current: state.current,
  loading: state.loading ?? false,
  error: state.error,
});

const base = { label: 'Loading deals', children: list };

describe('QueryState', () => {
  it('waits 150 ms before showing a named skeleton, then shows the data', async () => {
    vi.useFakeTimers();
    const view = render(QueryState<Deal[]>, {
      ...base,
      query: query({ current: [], loading: true }),
    });
    expect(screen.queryByRole('status')).toBeNull();
    await vi.advanceTimersByTimeAsync(149);
    expect(screen.queryByRole('status')).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(screen.getByRole('status', { name: 'Loading deals' })).toBeTruthy();
    await view.rerender({
      ...base,
      query: query({ current: [{ id: 'd1', name: 'Northwind renewal' }] }),
    });
    expect(screen.getByTestId('deals').textContent).toBe('Northwind renewal');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('never flashes a skeleton for a fast load', async () => {
    vi.useFakeTimers();
    const view = render(QueryState<Deal[]>, { ...base, query: query({ loading: true }) });
    await vi.advanceTimersByTimeAsync(80);
    await view.rerender({
      ...base,
      query: query({ current: [{ id: 'd1', name: 'Globex pilot' }] }),
    });
    await vi.advanceTimersByTimeAsync(200);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByTestId('deals').textContent).toBe('Globex pilot');
  });

  it('keeps showing the data while it reloads', async () => {
    const data = [{ id: 'd1', name: 'Initech seats' }];
    const view = render(QueryState<Deal[]>, { ...base, query: query({ current: data }) });
    await view.rerender({ ...base, query: query({ current: data, loading: true }) });
    expect(screen.getByTestId('deals').textContent).toBe('Initech seats');
    expect(screen.getByTestId('deals').parentElement?.getAttribute('aria-busy')).toBe('true');
  });

  it('shows a named empty state with its primary action', () => {
    render(QueryState<Deal[]>, {
      ...base,
      query: query({ current: [] }),
      emptyTitle: 'No deals yet',
      emptyDescription: 'Create one to start the pipeline.',
      emptyAction: newDeal,
    });
    const empty = screen.getByRole('status', { name: 'No deals yet' });
    expect(empty.textContent).toContain('Create one to start the pipeline.');
    expect(screen.getByRole('button', { name: 'New deal' })).toBeTruthy();
  });

  it('shows an error with retry, and the retry calls back', async () => {
    const onRetry = vi.fn(async () => {});
    render(QueryState<Deal[]>, {
      ...base,
      query: query({ error: new Error('Disk quota exceeded') }),
      onRetry,
    });
    const alert = screen.getByRole('alert', { name: "Couldn't load this" });
    expect(alert.textContent).toContain('Disk quota exceeded');
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(onRetry).toHaveBeenCalledTimes(1));
  });

  it('shows the simulated offline variant with retry', async () => {
    const onRetry = vi.fn();
    render(QueryState<Deal[]>, {
      ...base,
      query: query({ error: new SimulatedServiceError('offline', 'deals.list') }),
      onRetry,
    });
    expect(screen.getByRole('alert', { name: "You're offline" }).textContent).toContain(
      'simulated network'
    );
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows permission denied without a retry that cannot help', async () => {
    render(QueryState<Deal[]>, {
      ...base,
      query: query({ error: new PermissionDeniedError('deals:read', 'viewer') }),
      onRetry: vi.fn(),
    });
    await tick();
    const alert = screen.getByRole('alert', { name: "You don't have access" });
    expect(alert.textContent).toContain('deals:read');
    expect(alert.textContent).toContain('simulated');
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });
});

describe('classifyQueryError', () => {
  it('sorts by error class, never by message text', () => {
    expect(classifyQueryError(new PermissionDeniedError('deals:read', 'viewer'))).toMatchObject({
      kind: 'denied',
      retryable: false,
      capability: 'deals:read',
    });
    expect(classifyQueryError(new SimulatedServiceError('offline', 'x')).kind).toBe('offline');
    expect(classifyQueryError(new SimulatedServiceError('timeout', 'x'))).toMatchObject({
      kind: 'failed',
      retryable: true,
    });
    // A message that mentions "offline" or "permission" is still just a failure.
    expect(classifyQueryError(new Error('offline: permission denied')).kind).toBe('failed');
    expect(classifyQueryError('boom').message).toBe('Something went wrong while loading.');
  });

  it('recognizes errors from a duplicated core copy by class name', () => {
    const copy = Object.assign(new Error('nope'), {
      name: 'PermissionDeniedError',
      capability: 'deals:read',
    });
    expect(classifyQueryError(copy).kind).toBe('denied');
    const offline = Object.assign(new Error('down'), {
      name: 'SimulatedServiceError',
      code: 'offline',
    });
    expect(classifyQueryError(offline).kind).toBe('offline');
  });
});
