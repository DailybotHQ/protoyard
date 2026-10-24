import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { completeFilter, DataGrid, nextSort, ROW_HEIGHT } from '../src/grid/index.ts';

afterEach(() => cleanup());

interface Deal {
  id: string;
  name: string;
  amount: number;
}

const ROWS: Deal[] = [
  { id: '1', name: 'Acme', amount: 100 },
  { id: '2', name: 'Beta', amount: 200 },
];

const COLUMNS = [
  { key: 'name', header: 'Name', type: 'text' as const },
  { key: 'amount', header: 'Amount', type: 'number' as const },
];

describe('DataGrid (Texuli adapter)', () => {
  it('renders rows from query', async () => {
    render(DataGrid<Deal>, {
      query: { current: ROWS, loading: false, error: undefined },
      columns: COLUMNS as never,
      getRowId: (r) => r.id,
      caption: 'Deals',
    });
    await waitFor(() => expect(screen.getByText('Acme')).toBeTruthy());
    expect(screen.getByText('Beta')).toBeTruthy();
  });
});

describe('grid host toolkit helpers', () => {
  it('exports nextSort and completeFilter', () => {
    expect(typeof nextSort).toBe('function');
    expect(typeof completeFilter).toBe('function');
    expect(ROW_HEIGHT.comfortable).toBeGreaterThan(0);
  });
});
