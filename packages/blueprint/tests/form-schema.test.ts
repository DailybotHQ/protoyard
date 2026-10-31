// @vitest-environment node
/// <reference types="node" />
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseInput } from '@protoyard/core';
import { type FormSchema, validateFormSchema } from '@texuli/forms/model';
import { describe, expect, it } from 'vitest';
import {
  deriveInputSchemas,
  type EntityFormSchema,
  entityFormModel,
  HOSTED_FORM_KINDS,
  parseBlueprint,
  UNASSIGNED_OPTION,
} from '../src/index.ts';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

// The emitted shape stays assignable to Texuli's schema type.
const _assignable = (schema: EntityFormSchema): FormSchema => schema;
void _assignable;

const blueprint = parseBlueprint({
  formatVersion: 1,
  name: 'Form fixture',
  entities: [
    {
      name: 'customer',
      plural: 'customers',
      fields: [{ name: 'name', kind: 'text', required: true }],
      titleField: 'name',
    },
    {
      name: 'support-ticket',
      plural: 'support-tickets',
      fields: [
        { name: 'subject', kind: 'text', required: true, minLength: 3, maxLength: 40 },
        { name: 'body', kind: 'longText', maxLength: 50, description: 'What happened' },
        { name: 'score', kind: 'number', min: 0, max: 1 },
        { name: 'seats', kind: 'integer', min: 1, max: 500, default: 1 },
        { name: 'refund', kind: 'money', currency: 'EUR', min: 0, max: 100_000 },
        { name: 'urgent', kind: 'boolean', required: true },
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
const people = [
  { value: 'persona-ada', label: 'Ada' },
  { value: 'persona-bo', label: 'Bo' },
];

describe('entityFormModel', () => {
  it('maps every paintable kind to a Texuli field that validateFormSchema accepts', () => {
    const model = entityFormModel(ticket, { personaOptions: people });
    const result = validateFormSchema(model.schema);
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
    expect(model.schema.title).toBe('New support ticket');
    expect(Object.fromEntries(model.schema.fields.map((f) => [f.name, f.type]))).toEqual({
      subject: 'text',
      body: 'textarea',
      score: 'number',
      seats: 'number',
      refund: 'number',
      urgent: 'checkbox',
      dueOn: 'date',
      status: 'select',
      contactEmail: 'email',
      website: 'text',
      phone: 'text',
      labels: 'tags',
      assigneeId: 'select',
      metadata: 'textarea',
    });
    expect(model.hosted.map((f) => f.name)).toEqual([
      'firstReplyAt',
      'customer',
      'attachments',
      'location',
      'face',
    ]);
    for (const field of model.hosted) expect(HOSTED_FORM_KINDS.has(field.kind)).toBe(true);
  });

  it('carries the rules the service agrees with', () => {
    const fields = new Map(
      entityFormModel(ticket, { personaOptions: people }).schema.fields.map((f) => [f.name, f])
    );
    expect(fields.get('subject')).toMatchObject({ required: true, minLength: 3, maxLength: 40 });
    expect(fields.get('body')).toMatchObject({ description: 'What happened', maxLength: 50 });
    expect(fields.get('seats')).toMatchObject({ step: 1, min: 1, max: 500 });
    // Money is shown in major units with cent steps.
    expect(fields.get('refund')).toMatchObject({ step: 0.01, min: 0, max: 1000 });
    // A required boolean is not "must be checked".
    expect(fields.get('urgent')?.required).toBeUndefined();
    expect(fields.get('status')?.options).toEqual([
      { value: 'open', label: 'Open' },
      { value: 'pending', label: 'Pending' },
      { value: 'solved', label: 'Solved' },
    ]);
    expect(fields.get('labels')).toMatchObject({ maxItems: 3 });
    expect(fields.get('assigneeId')?.options?.[0]).toEqual({
      value: UNASSIGNED_OPTION,
      label: 'Unassigned',
    });
  });

  it('hosts persona fields when no people are given, or when an id collides with the sentinel', () => {
    expect(entityFormModel(ticket).hosted.some((f) => f.kind === 'persona')).toBe(true);
    const clash = entityFormModel(ticket, {
      personaOptions: [{ value: UNASSIGNED_OPTION, label: 'Odd' }],
    });
    expect(clash.hosted.some((f) => f.kind === 'persona')).toBe(true);
  });

  it('paints a read-only form with every field disabled', () => {
    const model = entityFormModel(ticket, { personaOptions: people, readOnly: true });
    expect(validateFormSchema(model.schema).ok).toBe(true);
    for (const field of model.schema.fields) {
      expect(field.when).toEqual({ enable: { op: 'bool', value: false } });
    }
  });

  it('uses the edit title and a custom submit label', () => {
    const model = entityFormModel(ticket, { mode: 'edit', submitLabel: 'Save' });
    expect(model.schema).toMatchObject({ title: 'Edit support ticket', submitLabel: 'Save' });
  });

  it('starts create forms from field defaults and edit forms from the row', () => {
    const model = entityFormModel(ticket, { personaOptions: people });
    expect(model.toFormValues(null)).toMatchObject({
      subject: '',
      seats: 1,
      status: 'open',
      urgent: false,
      labels: [],
      refund: null,
      assigneeId: UNASSIGNED_OPTION,
      metadata: '',
    });
    expect(
      model.toFormValues({
        subject: 'Printer',
        refund: 1234,
        dueOn: '2026-03-02T00:00:00.000Z',
        status: 'gone',
        assigneeId: 'persona-bo',
        metadata: { a: 1 },
        labels: ['x', 3],
      })
    ).toMatchObject({
      subject: 'Printer',
      refund: 12.34,
      dueOn: '2026-03-02',
      status: null,
      assigneeId: 'persona-bo',
      metadata: '{\n  "a": 1\n}',
      labels: ['x'],
    });
    // A create prefill keeps the defaults of the fields it does not set.
    expect(model.toFormValues({ subject: 'Prefilled' })).toMatchObject({
      subject: 'Prefilled',
      seats: 1,
      status: 'open',
    });
    expect(entityFormModel(ticket, { mode: 'edit' }).toFormValues({ subject: 'x' })).toMatchObject({
      seats: null,
      status: null,
    });
  });

  it('turns submitted values into service input the derived zod schema accepts', () => {
    const model = entityFormModel(ticket, { personaOptions: people });
    const input = model.fromFormValues({
      subject: 'Printer queue',
      body: '',
      score: 0.5,
      seats: 3,
      refund: 12.34,
      urgent: true,
      dueOn: '2026-03-02',
      status: 'pending',
      contactEmail: 'ada@example.com',
      website: '',
      phone: '+1 555 0100',
      labels: ['hardware'],
      assigneeId: UNASSIGNED_OPTION,
      metadata: '{"a":1}',
    });
    expect(input).toMatchObject({ refund: 1234, assigneeId: null, metadata: '{"a":1}' });
    const parsed = parseInput(deriveInputSchemas(ticket).update, input);
    expect(parsed).toMatchObject({
      subject: 'Printer queue',
      refund: 1234,
      urgent: true,
      dueOn: '2026-03-02',
      assigneeId: null,
      metadata: { a: 1 },
      labels: ['hardware'],
    });
  });

  it('rounds float money to whole cents and drops keys Texuli did not submit', () => {
    const model = entityFormModel(ticket);
    expect(model.fromFormValues({ refund: 0.29 })).toEqual({ refund: 29 });
    expect(model.fromFormValues({ refund: null, status: '' })).toEqual({
      refund: null,
      status: null,
    });
  });

  it('maps every entity of every catalog and generated blueprint to a valid Texuli schema', () => {
    const files = [
      ...readdirSync(join(ROOT, 'blueprints'))
        .filter((name) => name.endsWith('.json'))
        .map((name) => join(ROOT, 'blueprints', name)),
      ...readdirSync(join(ROOT, 'prototypes'))
        .map((slug) => join(ROOT, 'prototypes', slug, 'blueprint.json'))
        .filter((file) => existsSync(file)),
    ];
    let checked = 0;
    for (const file of files) {
      const raw = JSON.parse(readFileSync(file, 'utf8')) as { kind?: string };
      if (raw.kind && raw.kind !== 'app') continue;
      for (const entity of parseBlueprint(raw).entities) {
        for (const mode of ['create', 'edit'] as const) {
          const model = entityFormModel(entity, { mode, personaOptions: people });
          expect(model.painted.length + model.hosted.length).toBe(entity.fields.length);
          if (model.schema.fields.length === 0) continue;
          const result = validateFormSchema(model.schema);
          expect(result.issues, `${file} ${entity.name}`).toEqual([]);
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});
