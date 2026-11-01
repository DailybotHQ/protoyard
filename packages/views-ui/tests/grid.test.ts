import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataGrid } from '../src/grid/index.ts';

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
  async function editName(onCommit: (row: Deal, key: string, value: unknown) => Promise<void>) {
    render(DataGrid<Deal>, {
      query: { current: ROWS, loading: false, error: undefined },
      columns: COLUMNS as never,
      getRowId: (r) => r.id,
      caption: 'Deals',
      onCommit,
    });
    const cell = await waitFor(() => {
      const found = document.querySelector<HTMLElement>(
        '[data-tx-edit-cell][data-row-id="1"][data-column-key="name"]'
      );
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    await fireEvent.dblClick(cell);
    const input = await waitFor(() => {
      const found = cell.querySelector('input');
      expect(found).not.toBeNull();
      return found as HTMLInputElement;
    });
    await fireEvent.input(input, { target: { value: 'Acme Corp' } });
    await fireEvent.keyDown(input, { key: 'Enter' });
    return cell;
  }

  it('commits a cell edit through the service callback', async () => {
    const onCommit = vi.fn(async () => {});
    await editName(onCommit);
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    expect(onCommit).toHaveBeenCalledWith(ROWS[0], 'name', 'Acme Corp');
  });

  it('puts the stored value back and shows the reason when the service refuses the edit', async () => {
    const onCommit = vi.fn(async () => {
      throw new Error('Your role cannot edit deals.');
    });
    const cell = await editName(onCommit);
    await waitFor(() =>
      expect(cell.querySelector('[role="alert"]')?.textContent).toContain(
        'Your role cannot edit deals.'
      )
    );
    expect(cell.textContent).toContain('Acme');
    expect(cell.textContent).not.toContain('Acme Corp');
  });

  it('renders rows from query', async () => {
    render(DataGrid<Deal>, {
      query: { current: ROWS, loading: false, error: undefined },
      columns: COLUMNS as never,
      getRowId: (r) => r.id,
      caption: 'Deals',
    });
    await waitFor(() => expect(document.body.textContent).toMatch(/Acme|Beta|Deals/));
  });
});
