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
  ENTITY_FORM_CUSTOM_KINDS,
  type EntityFormSchema,
  entityFormModel,
  HOSTED_FORM_KINDS,
  parseBlueprint,
  UNASSIGNED_OPTION,
} from '../src/index.ts';

/** What EntityForm passes: the host paints the custom kinds it lists. */
const validate = (schema: EntityFormSchema) =>
  validateFormSchema(schema, { tier: 'developer', kinds: [...ENTITY_FORM_CUSTOM_KINDS] });

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
  it('maps every kind to a Texuli field that validateFormSchema accepts, hosted kinds as custom fields', () => {
    const model = entityFormModel(ticket, { personaOptions: people });
    const result = validate(model.schema);
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
      firstReplyAt: 'datetime',
      status: 'select',
      contactEmail: 'email',
      website: 'url',
      phone: 'text',
      labels: 'tags',
      customerId: 'custom',
      assigneeId: 'select',
      attachmentsIds: 'custom',
      metadata: 'textarea',
      location: 'custom',
      face: 'custom',
    });
    expect(model.hosted.map((f) => f.name)).toEqual([
      'customer',
      'attachments',
      'location',
      'face',
    ]);
    for (const field of model.hosted) expect(HOSTED_FORM_KINDS.has(field.kind)).toBe(true);
    // A hosted field is a custom field of its blueprint kind (G113), in blueprint order.
    expect(model.schema.fields.find((f) => f.name === 'customerId')).toEqual({
      name: 'customerId',
      type: 'custom',
      kind: 'relation',
      label: 'Customer',
      required: true,
    });
    expect(model.fieldFor('customerId')?.name).toBe('customer');
    expect(model.names.get('customerId')).toBe('customerId');
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
    // An optional persona lists only people: Texuli's select adds "None" (G118).
    expect(fields.get('assigneeId')?.options).toEqual(people);
    expect(fields.get('assigneeId')?.required).toBeUndefined();
    // Urls accept http as the service does (G121).
    expect(fields.get('website')).toMatchObject({ type: 'url', protocols: ['http', 'https'] });
  });

  it('hosts persona fields as custom fields when no people are given, or ids repeat', () => {
    const custom = (model: ReturnType<typeof entityFormModel>) =>
      model.schema.fields.find((f) => f.name === 'assigneeId');
    expect(custom(entityFormModel(ticket))).toMatchObject({ type: 'custom', kind: 'persona' });
    const clash = entityFormModel(ticket, {
      personaOptions: [people[0]!, { value: 'persona-ada', label: 'Ada again' }],
    });
    expect(clash.hosted.some((f) => f.kind === 'persona')).toBe(true);
    expect(validate(clash.schema).ok).toBe(true);
  });

  it('renames a field Texuli refuses and maps it back', () => {
    const odd = {
      ...ticket,
      fields: [{ name: 'valueOf', kind: 'text', required: false, maxLength: 20, sensitive: false }],
    } as typeof ticket;
    const model = entityFormModel(odd);
    expect(model.schema.fields.map((f) => f.name)).toEqual(['field_0']);
    expect(model.names.get('valueOf')).toBe('field_0');
    expect(model.fieldFor('field_0')?.name).toBe('valueOf');
    expect(model.toFormValues({ valueOf: 'x' })).toEqual({ field_0: 'x' });
    expect(model.fromFormValues({ field_0: 'y' })).toEqual({ valueOf: 'y' });
    expect(validate(model.schema).ok).toBe(true);
  });

  it('paints a read-only form with every field disabled', () => {
    const model = entityFormModel(ticket, { personaOptions: people, readOnly: true });
    expect(validate(model.schema).ok).toBe(true);
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
      assigneeId: null,
      metadata: '',
      // Hosted fields start empty for their host control.
      customerId: null,
      location: null,
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
        firstReplyAt: '2026-03-02T09:30:00.000Z',
        customerId: 'cus_1',
        location: { lat: 1, lng: 2 },
      })
    ).toMatchObject({
      subject: 'Printer',
      refund: 12.34,
      dueOn: '2026-03-02',
      firstReplyAt: '2026-03-02T09:30',
      customerId: 'cus_1',
      location: { lat: 1, lng: 2 },
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
      assigneeId: null,
      metadata: '{"a":1}',
      firstReplyAt: '',
      location: { lat: 1, lng: 2 },
    });
    expect(input).toMatchObject({
      refund: 1234,
      assigneeId: null,
      metadata: '{"a":1}',
      firstReplyAt: null,
      location: { lat: 1, lng: 2 },
    });
    // A hosted value passes through; an empty one becomes null for the service to judge.
    expect(model.fromFormValues({ customerId: 'cus_1', face: undefined })).toEqual({
      customerId: 'cus_1',
      face: null,
    });
    // A datetime round-trips as UTC wall time, whatever the machine's time zone.
    const at = model.toFormValues({ firstReplyAt: '2026-06-01T09:00:00.000Z' }).firstReplyAt;
    expect(at).toBe('2026-06-01T09:00');
    expect(model.fromFormValues({ firstReplyAt: at })).toEqual({
      firstReplyAt: '2026-06-01T09:00:00.000Z',
    });
    // A value saved before Texuli 0.10 with the old sentinel still reads as unassigned.
    expect(model.fromFormValues({ assigneeId: UNASSIGNED_OPTION })).toEqual({ assigneeId: null });
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
          expect(model.schema.fields.length).toBe(entity.fields.length);
          const result = validate(model.schema);
          expect(result.issues, `${file} ${entity.name}`).toEqual([]);
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});
