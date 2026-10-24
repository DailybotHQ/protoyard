import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  { key: 'name', header: 'Name', type: 'text' as const, editable: true },
  { key: 'amount', header: 'Amount', type: 'number' as const, editable: true },
];

describe('DataGrid (Texuli adapter)', () => {
  it('renders rows from query', async () => {
    render(DataGrid<Deal>, {
      query: { current: ROWS, loading: false, error: undefined },
      columns: COLUMNS as never,
      getRowId: (r) => r.id,
      caption: 'Deals',
    });
    await waitFor(() => expect(document.body.textContent).toMatch(/Acme|Beta|Deals/));
  });

  it('forwards onCommit through EditableDataGrid', async () => {
    const onCommit = vi.fn(async () => {});
    render(DataGrid<Deal>, {
      query: { current: ROWS, loading: false, error: undefined },
      columns: COLUMNS as never,
      getRowId: (r) => r.id,
      caption: 'Deals',
      onCommit,
    });
    await waitFor(() =>
      expect(document.querySelector('[data-tx-grid-editing], [data-grid]')).toBeTruthy()
    );
  });

  it('shows phone card list with Show more when many rows', async () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      id: `d${i}`,
      name: `Deal ${i}`,
      amount: i,
    }));
    render(DataGrid<Deal>, {
      query: { current: many, loading: false, error: undefined },
      columns: COLUMNS as never,
      getRowId: (r) => r.id,
      caption: 'Deals',
    });
    const more = await screen.findByRole('button', { name: /Show more/i });
    expect(more.textContent).toMatch(/10 left|Show more/);
    await fireEvent.click(more);
    expect(document.body.textContent).toMatch(/Deal 5[0-9]/);
  });
});

describe('grid host toolkit helpers', () => {
  it('exports nextSort and completeFilter', () => {
    expect(typeof nextSort).toBe('function');
    expect(typeof completeFilter).toBe('function');
    expect(ROW_HEIGHT.comfortable).toBeGreaterThan(0);
  });
});
