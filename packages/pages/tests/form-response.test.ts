import { describe, expect, it } from 'vitest';
import {
  FORM_RESPONSE_LIMITS,
  FORM_RESPONSES_STORE_STRING,
  FORM_RESPONSES_TABLE,
  FormResponseSchema,
  PAGE_FEATURE_STORE_STRINGS,
  PAGE_FEATURE_TABLES,
} from '../src/form-response.ts';

const validResponse = {
  id: 'response-1',
  formId: 'contact-form',
  createdAt: '2030-01-02T03:04:05.000Z',
  values: {
    name: 'Avery Example',
    age: 32,
    subscribed: true,
    topics: ['product', 'research'],
  },
};

describe('FormResponseSchema', () => {
  it('accepts bounded scalar and string-array values and preserves the row', () => {
    expect(FormResponseSchema.parse(validResponse)).toEqual(validResponse);
    expect(FORM_RESPONSE_LIMITS).toMatchObject({
      maxValues: 32,
      maxKeyLength: 32,
      maxStringLength: 4_000,
      maxArrayValues: 20,
      maxValuesBytes: 8 * 1024,
    });
  });

  it('rejects unsafe value keys before record parsing', () => {
    for (const key of ['__proto__', 'constructor', 'prototype']) {
      const input = JSON.parse(
        `{"id":"response-1","formId":"contact-form","createdAt":"2030-01-02T03:04:05.000Z","values":{"${key}":"unsafe"}}`
      );
      const result = FormResponseSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toContainEqual(
          expect.objectContaining({ path: ['values', key] })
        );
      }
    }
  });

  it('rejects unknown row fields and invalid field names or value types', () => {
    expect(FormResponseSchema.safeParse({ ...validResponse, extra: 'no' }).success).toBe(false);
    expect(
      FormResponseSchema.safeParse({
        ...validResponse,
        values: { 'bad-key': 'value' },
      }).success
    ).toBe(false);
    expect(
      FormResponseSchema.safeParse({ ...validResponse, values: { nested: { value: 'no' } } })
        .success
    ).toBe(false);
    expect(
      FormResponseSchema.safeParse({
        ...validResponse,
        values: { score: Number.POSITIVE_INFINITY },
      }).success
    ).toBe(false);
  });

  it('requires valid ids and ISO datetimes', () => {
    expect(FormResponseSchema.safeParse({ ...validResponse, id: 'Response_1' }).success).toBe(
      false
    );
    expect(FormResponseSchema.safeParse({ ...validResponse, formId: 'bad id' }).success).toBe(
      false
    );
    expect(
      FormResponseSchema.safeParse({ ...validResponse, createdAt: '2030-13-55 03:04:05' }).success
    ).toBe(false);
  });

  it('rejects overlong values, oversized arrays, too many fields and oversized value JSON', () => {
    expect(
      FormResponseSchema.safeParse({
        ...validResponse,
        values: { message: 'x'.repeat(FORM_RESPONSE_LIMITS.maxStringLength + 1) },
      }).success
    ).toBe(false);
    expect(
      FormResponseSchema.safeParse({
        ...validResponse,
        values: {
          tags: Array.from({ length: FORM_RESPONSE_LIMITS.maxArrayValues + 1 }, () => 'x'),
        },
      }).success
    ).toBe(false);
    expect(
      FormResponseSchema.safeParse({
        ...validResponse,
        values: Object.fromEntries(
          Array.from({ length: FORM_RESPONSE_LIMITS.maxValues + 1 }, (_, index) => [
            `field${index}`,
            true,
          ])
        ),
      }).success
    ).toBe(false);
    expect(
      FormResponseSchema.safeParse({
        ...validResponse,
        values: { first: 'x'.repeat(3_000), second: 'y'.repeat(3_000), third: 'z'.repeat(3_000) },
      }).success
    ).toBe(false);
  });

  it('exports the ordinary feature table and stable Dexie store string', () => {
    expect(FORM_RESPONSES_TABLE).toBe('formResponses');
    expect(FORM_RESPONSES_STORE_STRING).toBe('id, formId, createdAt, [formId+createdAt]');
    expect(PAGE_FEATURE_TABLES.formResponses).toBe(FORM_RESPONSES_TABLE);
    expect(PAGE_FEATURE_STORE_STRINGS.formResponses).toBe(FORM_RESPONSES_STORE_STRING);
    expect(FORM_RESPONSES_TABLE.startsWith('py_')).toBe(false);
  });
});
