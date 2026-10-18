import { parseBlueprint } from '@protoyard/blueprint';
import { describe, expect, it } from 'vitest';
import { helpdeskBlueprint } from '../../../tests/fixtures/blueprint-prototype.ts';
import {
  entityListColumns,
  entityListHeading,
  entitySearchKeys,
  loadEntityListDisplayNames,
} from '../src/columns.ts';
import { formatEntityHeading, formatFieldValue, formatMoney } from '../src/format.ts';

const blueprint = parseBlueprint({
  formatVersion: 1,
  name: 'Format fixture',
  entities: [
    {
      name: 'item',
      plural: 'items',
      fields: [
        { name: 'title', kind: 'text', required: true },
        { name: 'price', kind: 'money', currency: 'USD', required: true },
        { name: 'active', kind: 'boolean' },
        { name: 'tags', kind: 'tags' },
      ],
      titleField: 'title',
    },
  ],
  roles: [{ name: 'owner', permissions: { '*': ['*'] } }],
});

const entity = blueprint.entities[0]!;

describe('crud format helpers', () => {
  it('formats money from integer cents', () => {
    expect(formatMoney(1234, 'USD')).toMatch(/12\.34/);
    expect(formatMoney(null)).toBe('—');
  });

  it('formats field values by kind', () => {
    const money = entity.fields.find((f) => f.name === 'price')!;
    const bool = entity.fields.find((f) => f.name === 'active')!;
    const tags = entity.fields.find((f) => f.name === 'tags')!;
    expect(formatFieldValue(money, 500)).toMatch(/5\.00/);
    expect(formatFieldValue(bool, true)).toBe('Yes');
    expect(formatFieldValue(tags, ['a', 'b'])).toBe('a, b');
  });

  it('builds list columns and search keys from the entity', () => {
    const columns = entityListColumns(entity);
    expect(columns[0]?.key).toBe('title');
    expect(columns.some((c) => c.key === 'price')).toBe(true);
    expect(entitySearchKeys(entity)).toContain('title');
  });

  it('uses the display label or title-cases the blueprint plural for list headings', () => {
    expect(formatEntityHeading({ label: undefined, plural: 'support-tickets' })).toBe(
      'Support Tickets'
    );
    expect(entityListHeading({ label: 'Support tickets', plural: 'support-tickets' })).toBe(
      'Support Tickets'
    );
  });

  it('formats money columns as currency from cents', () => {
    const invoice = helpdeskBlueprint.entities.find((candidate) => candidate.name === 'invoice')!;
    const amountColumn = entityListColumns(invoice).find((column) => column.key === 'amount');
    expect(amountColumn?.accessor?.({ amount: 90_337 } as never)).toMatch(/903\.37/);
    expect(amountColumn?.accessor?.({ amount: 90_337 } as never)).toContain('$');
  });

  it('loads related entities and personas once and displays their names in columns', async () => {
    const ticket = helpdeskBlueprint.entities.find((candidate) => candidate.name === 'ticket')!;
    const calls: string[] = [];
    const displayNames = await loadEntityListDisplayNames(ticket, helpdeskBlueprint, {
      canReadEntity: () => true,
      async listEntity(entityName) {
        calls.push(entityName);
        return [{ id: 'customer_0008', name: 'Northstar Studio' }];
      },
      listPersonas: () => [
        { persona: { id: 'user_0002', name: 'Sam Rivera' } },
        { persona: { id: 'user_0003', name: 'Jordan Lee' } },
      ],
    });
    expect(calls).toEqual(['customer']);

    const columns = entityListColumns(ticket, displayNames);
    expect(
      columns
        .find((column) => column.key === 'customerId')
        ?.accessor?.({
          customerId: 'customer_0008',
        } as never)
    ).toBe('Northstar Studio');
    expect(
      columns
        .find((column) => column.key === 'assigneeId')
        ?.accessor?.({
          assigneeId: 'user_0002',
        } as never)
    ).toBe('Sam Rivera');
  });
});
