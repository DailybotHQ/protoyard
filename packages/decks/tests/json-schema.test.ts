import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DeckJsonSchema, DeckSchema } from '../src/schema/index.ts';

describe('DeckJsonSchema', () => {
  it('exports the current Draft 2020-12 schema from DeckSchema', () => {
    expect(DeckJsonSchema).toEqual(
      z.toJSONSchema(DeckSchema, { io: 'input', target: 'draft-2020-12' })
    );
    expect(DeckJsonSchema).toMatchObject({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: false,
      properties: {
        style: { type: 'object' },
        slides: { type: 'array', maxItems: 200, minItems: 1 },
      },
    });
  });
});
