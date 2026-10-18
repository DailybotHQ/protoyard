import { parseInput, ValidationError } from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import {
  type BlueprintField,
  deriveInputSchemas,
  FIELD_KINDS,
  fieldLabel,
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
const createOne = (prop: string, value: unknown) =>
  parseInput(create, { ...valid, [prop]: value })[prop];
const createIssue = (prop: string, value: unknown) =>
  issues(create, { ...valid, [prop]: value })[prop];

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

  it('caches schemas per entity', () => {
    expect(deriveInputSchemas(ticket)).toBe(deriveInputSchemas(ticket));
  });

  it('derives labels from names', () => {
    expect(fieldLabel({ name: 'firstReplyAt' })).toBe('First reply at');
    expect(fieldLabel({ name: 'x', label: 'Custom' })).toBe('Custom');
  });
});

/** [property, accepted input → output pairs, rejected input → message]. */
const cases: Record<string, [string, [unknown, unknown][], [unknown, string][]]> = {
  text: [
    'subject',
    [['  Printer jam  ', 'Printer jam']],
    [
      ['ab', 'Subject must have at least 3 characters'],
      ['x'.repeat(41), 'Subject must have at most 40 characters'],
      [42, 'Subject must be text'],
    ],
  ],
  longText: [
    'body',
    [['Line one\n\nLine two  ', 'Line one\n\nLine two']],
    [['y'.repeat(51), 'Body must have at most 50 characters']],
  ],
  number: [
    'score',
    [
      ['0.75', 0.75],
      [1, 1],
    ],
    [
      ['abc', 'Score must be a number'],
      [1.5, 'Score must be at most 1'],
      [Number.NaN, 'Score must be a number'],
    ],
  ],
  integer: [
    'seats',
    [
      ['12', 12],
      [500, 500],
    ],
    [
      ['2.5', 'Seats must be a whole number'],
      [0, 'Seats must be at least 1'],
    ],
  ],
  money: [
    'refund',
    [
      ['12.34', 1234],
      ['1,000', 100_000],
      ['999.9', 99_990],
      ['€7', 700],
      [999, 999],
    ],
    [
      ['12.345', 'Refund must be an amount like 12.34'],
      [12.5, 'Refund must be an amount like 12.34'],
      ['-1', 'Refund must be at least 0.00 EUR'],
      ['1000.01', 'Refund must be at most 1000.00 EUR'],
    ],
  ],
  boolean: [
    'urgent',
    [
      ['on', true],
      ['false', false],
      [true, true],
      ['', false],
    ],
    [['maybe', 'Urgent must be yes or no']],
  ],
  date: [
    'dueOn',
    [['2026-03-02', '2026-03-02']],
    [
      ['2026-02-30', 'Due on must be a date like 2026-03-02'],
      ['03/02/2026', 'Due on must be a date like 2026-03-02'],
    ],
  ],
  datetime: [
    'firstReplyAt',
    [
      ['2026-03-02T09:30:00+02:00', '2026-03-02T07:30:00.000Z'],
      [new Date('2026-03-02T09:00:00.000Z'), '2026-03-02T09:00:00.000Z'],
    ],
    [
      ['tomorrow', 'First reply at must be a date and time'],
      ['2026-03-02T99:00', 'First reply at must be a date and time'],
    ],
  ],
  enum: [
    'status',
    [[' pending ', 'pending']],
    [['closed', 'Status must be one of: Open, Pending, Solved']],
  ],
  email: [
    'contactEmail',
    [['  Ada@Example.COM ', 'ada@example.com']],
    [['ada@', 'Enter a valid email address']],
  ],
  url: [
    'website',
    [['https://example.com/help', 'https://example.com/help']],
    [
      ['javascript:alert(1)', 'Enter a valid URL starting with https://'],
      ['example.com', 'Enter a valid URL starting with https://'],
    ],
  ],
  phone: [
    'phone',
    [['+1 (555) 010-0199', '+1 (555) 010-0199']],
    [
      ['call me', 'Enter a valid phone number'],
      ['12', 'Enter a valid phone number'],
    ],
  ],
  tags: [
    'labels',
    [
      ['vip, billing, vip', ['vip', 'billing']],
      [
        ['a', ' b '],
        ['a', 'b'],
      ],
    ],
    [
      ['a,b,c,d', 'Labels can have at most 3 tags'],
      [[1, 2], 'Labels must be a list of tags'],
      ['z'.repeat(33), 'Tags must have at most 32 characters'],
    ],
  ],
  relation: [
    'relatedIds',
    [
      [
        ['ticket_0002', 'ticket_0002', 'ticket_0003'],
        ['ticket_0002', 'ticket_0003'],
      ],
    ],
    [
      ['ticket_0002', 'Pick valid related'],
      [['has space'], 'Pick valid related'],
    ],
  ],
  persona: ['assigneeId', [['persona_0001', 'persona_0001']], [[42, 'Pick a valid assignee']]],
  file: [
    'attachmentsIds',
    [[['file_0001'], ['file_0001']]],
    [['file_0001', 'Pick valid attachments']],
  ],
  json: [
    'metadata',
    [
      ['{"plan":"pro"}', { plan: 'pro' }],
      [{ seats: 3 }, { seats: 3 }],
    ],
    [['{not json', 'Metadata must be valid JSON']],
  ],
};

describe('field kinds', () => {
  it('covers every field kind', () => {
    expect(Object.keys(cases).sort()).toEqual([...FIELD_KINDS].sort());
  });

  describe.each(Object.entries(cases))('%s', (_kind, [prop, accepted, rejected]) => {
    it.each(accepted)('accepts %j', (input, output) => {
      expect(createOne(prop, input)).toEqual(output);
      expect(parseInput(update, { [prop]: input })[prop]).toEqual(output);
    });
    it.each(rejected)('rejects %j', (input, message) => {
      expect(createIssue(prop, input)).toBe(message);
      expect(issues(update, { [prop]: input })[prop]).toBe(message);
    });
  });

  it('requires a single relation id when the relation is required', () => {
    expect(createIssue('customerId', '')).toBe('Customer is required');
    expect(createIssue('customerId', ['customer_0001'])).toBe('Pick a valid customer');
  });
});

describe('parseMoneyText', () => {
  it.each([
    ['0', 0],
    ['0.5', 50],
    ['-$3', -300],
    ['$ 1,234.56', 123_456],
    ['1234', 123_400],
  ])('%j → %d cents', (text, cents) => {
    expect(parseMoneyText(text)).toBe(cents);
  });

  it.each(['', '1,23', '1.234', 'abc', '12..3', '9'.repeat(20)])('rejects %j', (text) => {
    expect(parseMoneyText(text)).toBeNull();
  });
});
