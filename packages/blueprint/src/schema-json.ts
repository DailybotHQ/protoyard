import { z } from 'zod';
import { CONTENT_KINDS } from './kinds/kind.ts';
import { BLUEPRINT_BASE_SHAPE, BLUEPRINT_SCHEMA_URL, BlueprintShape } from './schema.ts';

/**
 * JSON Schema (draft 2020-12) for editors. Content schemas are loaded only
 * when tooling asks for the published union; app parsing stays on its small
 * static graph. Cross-reference refinements are not expressible in JSON Schema.
 */
export async function blueprintJsonSchema(): Promise<Record<string, unknown>> {
  const { kindBodySchema } = await import('./kinds/bodies.ts');
  const contentSchemas = await Promise.all(
    CONTENT_KINDS.map(async (kind) => {
      const body = await kindBodySchema(kind);
      if (!body) throw new Error(`Blueprint kind "${kind}" is not available in this build.`);
      return z.strictObject({
        ...BLUEPRINT_BASE_SHAPE,
        kind: z.literal(kind),
        [kind]: body,
      });
    })
  );
  const generated = z.toJSONSchema(z.union([BlueprintShape, ...contentSchemas]), {
    io: 'input',
    target: 'draft-2020-12',
  });
  if (!Array.isArray(generated.anyOf)) {
    throw new Error('Blueprint JSON Schema generation did not produce the expected union.');
  }
  const { anyOf: branches, ...schema } = generated;
  return {
    $schema: schema.$schema,
    $id: BLUEPRINT_SCHEMA_URL,
    title: 'Protoyard blueprint',
    ...schema,
    oneOf: branches,
  };
}
