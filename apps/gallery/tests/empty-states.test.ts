import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EmptyBrowseState from '../src/components/EmptyBrowseState.svelte';

afterEach(() => cleanup());

describe('gallery empty states', () => {
  it('filters empty offers clear filters, templates, and create CTAs', async () => {
    const onClearFilters = vi.fn();
    render(EmptyBrowseState, { kind: 'filters', onClearFilters });
    expect(screen.getByTestId('browse-empty').getAttribute('data-empty')).toBe('filters');
    expect(screen.getByTestId('browse-empty-title').textContent).toMatch(/Nothing matches/i);
    expect(screen.getByTestId('empty-browse-templates').getAttribute('href')).toBe('#templates');
    expect(screen.getByTestId('empty-create-prototype').getAttribute('href')).toMatch(/\/new\/?/);
    await fireEvent.click(screen.getByTestId('empty-clear-filters'));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  it('favorites empty offers browse-all', async () => {
    const onBrowseAll = vi.fn();
    render(EmptyBrowseState, { kind: 'favorites', onBrowseAll });
    expect(screen.getByTestId('browse-empty').getAttribute('data-empty')).toBe('favorites');
    await fireEvent.click(screen.getByTestId('empty-browse-all'));
    expect(onBrowseAll).toHaveBeenCalledTimes(1);
  });

  it('recent empty points people back to the full list', () => {
    render(EmptyBrowseState, { kind: 'recent', onBrowseAll: () => {} });
    expect(screen.getByTestId('browse-empty').getAttribute('data-empty')).toBe('recent');
    expect(screen.getByTestId('empty-browse-all')).toBeTruthy();
  });
});
