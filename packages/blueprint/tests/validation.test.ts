import { parseInput, ValidationError } from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import {
  type BlueprintField,
  deriveInputSchemas,
  inputProperty,
  parseBlueprint,
  parseMoneyText,
} from '../src/index.ts';

const blueprint = parseBlueprint({
  formatVersion: 1,
  name: 'Validation fixture',
  entities: [
    {
      name: 'customer',
      plural: 'customers',
      fields: [{ name: 'name', kind: 'text' }],
      titleField: 'name',
    },
    {
      name: 'ticket',
      plural: 'tickets',
      fields: [
        { name: 'subject', kind: 'text', required: true, minLength: 3, maxLength: 40 },
        { name: 'body', kind: 'longText', maxLength: 50 },
        { name: 'score', kind: 'number', min: 0, max: 1 },
        { name: 'seats', kind: 'integer', min: 1, max: 500, default: 1 },
        { name: 'refund', kind: 'money', currency: 'EUR', min: 0, max: 100_000 },
        { name: 'urgent', kind: 'boolean' },
        { name: 'dueOn', kind: 'date' },
        { name: 'firstReplyAt', kind: 'datetime' },
        {
          name: 'status',
          kind: 'enum',
          values: ['open', 'pending', 'solved'],
          labels: { open: 'Open', pending: 'Pending', solved: 'Solved' },
          default: 'open',
          required: true,
        },
        { name: 'contactEmail', kind: 'email', label: 'Contact email' },
        { name: 'website', kind: 'url' },
        { name: 'phone', kind: 'phone' },
        { name: 'labels', kind: 'tags', maxItems: 3 },
        { name: 'customer', kind: 'relation', to: 'customer', required: true },
        { name: 'related', kind: 'relation', to: 'ticket', cardinality: 'many' },
        { name: 'assignee', kind: 'persona' },
        { name: 'attachments', kind: 'file', multiple: true },
        { name: 'metadata', kind: 'json' },
        { name: 'location', kind: 'geo', region: 'harbor-bay' },
        { name: 'face', kind: 'avatar' },
      ],
      titleField: 'subject',
    },
  ],
  roles: [{ name: 'owner', permissions: { '*': ['*'] } }],
});
const ticket = blueprint.entities[1]!;
const { create, update } = deriveInputSchemas(ticket);
const valid = { subject: 'Printer jam', customerId: 'customer_0001' };

/** Field-keyed issues from `parseInput`, or `{}` when the input is valid. */
function issues(schema: typeof create, input: unknown): Record<string, string> {
  try {
    parseInput(schema, input);
    return {};
  } catch (error) {
    if (error instanceof ValidationError) return error.issues;
    throw error;
  }
}

describe('deriveInputSchemas', () => {
  it('keys inputs by row property and fills create defaults', () => {
    expect(ticket.fields.map(inputProperty)).toContain('customerId');
    expect(inputProperty(ticket.fields.find((f) => f.name === 'related') as BlueprintField)).toBe(
      'relatedIds'
    );
    expect(parseInput(create, { ...valid, extra: 'dropped' })).toEqual({
      subject: 'Printer jam',
      body: null,
      score: null,
      seats: 1,
      refund: null,
      urgent: false,
      dueOn: null,
      firstReplyAt: null,
      status: 'open',
      contactEmail: null,
      website: null,
      phone: null,
      labels: [],
      customerId: 'customer_0001',
      relatedIds: [],
      assigneeId: null,
      attachmentsIds: [],
      metadata: null,
      location: null,
      face: null,
    });
  });

  it('reports every missing required field with a readable, field-keyed message', () => {
    expect(issues(create, {})).toEqual({
      subject: 'Subject is required',
      customerId: 'Customer is required',
    });
    expect(issues(create, 'not an object')).toHaveProperty('form');
  });

  it('validates only present keys on update and lets blanks clear optional fields', () => {
    expect(parseInput(update, { website: '', labels: 'a, b' })).toEqual({
      website: null,
      labels: ['a', 'b'],
    });
    expect(parseInput(update, {})).toEqual({});
    expect(issues(update, { subject: '  ' })).toEqual({ subject: 'Subject is required' });
    expect(issues(update, { status: null })).toEqual({ status: 'Status is required' });
  });
});

it('parses money input in linear time for long whitespace input', () => {
  const started = performance.now();
  expect(parseMoneyText(`${' '.repeat(40_000)}x`)).toBeNull();
  expect(performance.now() - started).toBeLessThan(100);
});
