import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DataTable from '../src/components/data-table/DataTable.svelte';
import type { DataTableColumn } from '../src/components/data-table/types.ts';

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
  { key: 'joined', header: 'Joined', sortable: true, accessor: (row) => row.joined },
];

afterEach(() => cleanup());

function bodyNames(): string[] {
  const table = screen.getByRole('table');
  const rows = within(table).getAllByRole('row').slice(1);
  return rows.map((row) => within(row).getAllByRole('cell')[0]?.textContent?.trim() ?? '');
}

function renderTable(props: Partial<Record<string, unknown>> = {}) {
  return render(DataTable<Person>, {
    columns,
    rows: people,
    getRowId: (row: Person) => row.id,
    caption: 'People',
    ...props,
  });
}

describe('DataTable', () => {
  it('sorts ascending then descending on header click and sets aria-sort', async () => {
    renderTable();
    const nameHeader = screen.getByRole('columnheader', { name: /Name/ });
    expect(nameHeader.hasAttribute('aria-sort')).toBe(false);

    await fireEvent.click(within(nameHeader).getByRole('button'));
    expect(nameHeader.getAttribute('aria-sort')).toBe('ascending');
    expect(bodyNames()).toEqual(['alice', 'Bob', 'Charlie', 'Dana', 'Eve']);

    await fireEvent.click(within(nameHeader).getByRole('button'));
    expect(nameHeader.getAttribute('aria-sort')).toBe('descending');
    expect(bodyNames()).toEqual(['Eve', 'Dana', 'Charlie', 'Bob', 'alice']);

    await fireEvent.click(within(nameHeader).getByRole('button'));
    expect(nameHeader.hasAttribute('aria-sort')).toBe(false);
    expect(bodyNames()).toEqual(['Charlie', 'alice', 'Bob', 'Dana', 'Eve']);
  });

  it('sorts numbers and dates by value, moving aria-sort between headers', async () => {
    renderTable();
    const ageHeader = screen.getByRole('columnheader', { name: /Age/ });
    const joinedHeader = screen.getByRole('columnheader', { name: /Joined/ });

    await fireEvent.click(within(ageHeader).getByRole('button'));
    expect(bodyNames()).toEqual(['Dana', 'alice', 'Eve', 'Charlie', 'Bob']);

    await fireEvent.click(within(joinedHeader).getByRole('button'));
    expect(ageHeader.hasAttribute('aria-sort')).toBe(false);
    expect(joinedHeader.getAttribute('aria-sort')).toBe('ascending');
    expect(bodyNames()).toEqual(['Dana', 'alice', 'Charlie', 'Eve', 'Bob']);
  });

  it('filters rows with the search box using searchKeys', async () => {
    renderTable({ searchKeys: ['name'] });
    const search = screen.getByRole('searchbox', { name: 'Search People' });
    await fireEvent.input(search, { target: { value: 'AL' } });
    expect(bodyNames()).toEqual(['alice']);
    await fireEvent.input(search, { target: { value: 'zzz' } });
    expect(screen.getByText('No results')).toBeTruthy();
  });

  it('supports a custom searchFn', async () => {
    renderTable({ searchFn: (row: Person, query: string) => row.age > Number(query) });
    await fireEvent.input(screen.getByRole('searchbox'), { target: { value: '33' } });
    expect(bodyNames()).toEqual(['Charlie', 'Bob']);
  });

  it('paginates with pageSize and navigates pages', async () => {
    renderTable({ pageSize: 2 });
    expect(bodyNames()).toEqual(['Charlie', 'alice']);
    expect(screen.getByText('Showing 1–2 of 5')).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }));
    expect(bodyNames()).toEqual(['Bob', 'Dana']);

    await fireEvent.click(screen.getByRole('button', { name: 'Page 3' }));
    expect(bodyNames()).toEqual(['Eve']);
    expect(
      (screen.getByRole('button', { name: 'Go to next page' }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(screen.getByRole('button', { name: 'Page 3' }).getAttribute('aria-current')).toBe(
      'page'
    );
  });

  it('activates rows by click, Enter and Space', async () => {
    const onRowClick = vi.fn();
    renderTable({ onRowClick, rowLabel: (row: Person) => `Open ${row.name}` });
    const row = screen.getByRole('row', { name: 'Open Bob' });
    expect(row.getAttribute('tabindex')).toBe('0');

    await fireEvent.click(within(row).getAllByRole('cell')[1] as HTMLElement);
    await fireEvent.keyDown(row, { key: 'Enter' });
    await fireEvent.keyDown(row, { key: ' ' });
    expect(onRowClick).toHaveBeenCalledTimes(3);
    expect(onRowClick).toHaveBeenLastCalledWith(people[2]);
  });

  it('renders skeleton rows while loading', () => {
    renderTable({ loading: true, pageSize: 3 });
    expect(screen.getByRole('table').getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByText('Charlie')).toBeNull();
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(4);
  });
});
