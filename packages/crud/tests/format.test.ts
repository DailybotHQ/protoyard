import { parseBlueprint } from '@protoyard/blueprint';
import { describe, expect, it } from 'vitest';
import { entityListColumns, entitySearchKeys } from '../src/columns.ts';
import { formatFieldValue, formatMoney } from '../src/format.ts';

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
});
