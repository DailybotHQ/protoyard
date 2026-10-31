import { z } from 'zod';

/**
 * The `canvas` screen: an infinite canvas (shapes, sticky notes, frames,
 * connectors) stored in one `json` field of an entity, one canvas per
 * record. The screen picks a record; every edit saves the field through the
 * entity's update service. Rendered by `@protoyard/crud/screens/canvas` over
 * `@protoyard/views-ui/canvas`, which validates the stored value as an
 * untrusted Texuli canvas before it paints.
 *
 * Kept in its own module so the screen union in `schema.ts` only names it.
 */

/**
 * The screen's schema, built from `schema.ts`'s shared screen base and field
 * name rule (passed in, so this module imports nothing from `schema.ts`).
 */
export function canvasScreenSchema<Base extends z.ZodRawShape>(base: Base, fieldName: z.ZodString) {
  return z.strictObject({
    ...base,
    type: z.literal('canvas'),
    entity: z.string().min(1),
    /** A `json` field holding each record's canvas. */
    field: fieldName,
  });
}

/** Cross-reference issues for one canvas screen of `entity` (`add(path, message)`). */
export function canvasScreenIssues(
  entity: { name: string; fields: readonly { name: string; kind: string }[] },
  screen: { field: string },
  path: readonly (string | number)[],
  add: (path: (string | number)[], message: string) => void
): void {
  const field = entity.fields.find((candidate) => candidate.name === screen.field);
  if (!field) add([...path, 'field'], `unknown field "${screen.field}" on "${entity.name}"`);
  else if (field.kind !== 'json') {
    add([...path, 'field'], `field "${screen.field}" must be a json field of "${entity.name}"`);
  }
}
