import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import DataTable from '../src/components/data-table/DataTable.svelte';
import type {
  DataTableBulkActionContext,
  DataTableColumn,
} from '../src/components/data-table/types.ts';

interface Person {
  id: string;
  name: string;
  age: number;
  joined: Date;
}

const people: Person[] = [
  { id: 'p1', name: 'Charlie', age: 35, joined: new Date('2024-03-01') },
  { id: 'p2', name: 'alice', age: 28, joined: new Date('2023-01-15') },
  { id: 'p3', name: 'Bob', age: 42, joined: new Date('2025-06-20') },
  { id: 'p4', name: 'Dana', age: 19, joined: new Date('2022-11-05') },
  { id: 'p5', name: 'Eve', age: 31, joined: new Date('2024-09-09') },
];

const columns: DataTableColumn<Person>[] = [
  { key: 'name', header: 'Name', sortable: true },
  { key: 'age', header: 'Age', sortable: true, align: 'right' },
];

afterEach(() => cleanup());

function actionsSnippet() {
  return createRawSnippet<[DataTableBulkActionContext<Person>]>((getContext) => ({
    render: () =>
      `<div><output aria-label="Selected IDs">${getContext().selected.join(',')}</output><output aria-label="Selected names">${getContext()
        .rows.map((row) => row.name)
        .join(',')}</output></div>`,
  }));
}

function renderTable(props: Partial<Record<string, unknown>> = {}) {
  return render(DataTable<Person>, {
    columns,
    rows: people,
    getRowId: (row: Person) => row.id,
    caption: 'People',
    selectable: true,
    bulkActions: actionsSnippet(),
    ...props,
  });
}

function selectedIds(): string[] {
  const output = screen.queryByLabelText('Selected IDs');
  return output?.textContent ? output.textContent.split(',') : [];
}

describe('DataTable row selection', () => {
  it('keeps selection opt-in for existing tables', () => {
    renderTable({ selectable: false });
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByLabelText('Selected IDs')).toBeNull();
  });

  it('selects a row and exposes selected IDs and row objects to bulk actions', async () => {
    renderTable();

    await fireEvent.click(screen.getByRole('checkbox', { name: 'Select row p2' }));

    expect(selectedIds()).toEqual(['p2']);
    expect(screen.getByLabelText('Selected names').textContent).toBe('alice');
    expect(
      screen
        .getByRole('checkbox', { name: 'Select all rows on this page' })
        .getAttribute('aria-checked')
    ).toBe('mixed');
  });

  it('selects the visible page and supports shift-range selection', async () => {
    renderTable({ pageSize: 3 });
    const firstPageCheckbox = screen.getByRole('checkbox', {
      name: 'Select all rows on this page',
    });

    await fireEvent.click(screen.getByRole('checkbox', { name: 'Select row p1' }));
    expect(firstPageCheckbox.getAttribute('aria-checked')).toBe('mixed');
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Select row p3' }), {
      shiftKey: true,
    });

    expect(
      screen.getByRole('checkbox', { name: 'Select row p1' }).getAttribute('aria-checked')
    ).toBe('true');
    expect(
      screen.getByRole('checkbox', { name: 'Select row p2' }).getAttribute('aria-checked')
    ).toBe('true');
    expect(
      screen.getByRole('checkbox', { name: 'Select row p3' }).getAttribute('aria-checked')
    ).toBe('true');
    expect(firstPageCheckbox.getAttribute('aria-checked')).toBe('true');
    await fireEvent.click(firstPageCheckbox);
    expect(selectedIds()).toEqual([]);
  });

  it('preserves selection through sorting, search and pagination, then drops removed rows', async () => {
    const { rerender } = renderTable({ pageSize: 2, searchKeys: ['name'] });
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Select row p1' }));
    await fireEvent.click(screen.getByRole('button', { name: /Name/ }));
    expect(selectedIds()).toEqual(['p1']);

    await fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(selectedIds()).toEqual(['p1']);
    await fireEvent.input(screen.getByRole('searchbox', { name: 'Search People' }), {
      target: { value: 'Dana' },
    });
    expect(selectedIds()).toEqual(['p1']);

    await rerender({ rows: people.slice(1) });
    expect(selectedIds()).toEqual([]);
  });
});
