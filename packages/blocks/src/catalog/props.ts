import { BlockSchema, type BlockType } from '../schema/index.ts';
import { blockBase } from '../schema/primitives.ts';

/**
 * Prop summaries read from the live zod schemas, so the reference can never
 * list a prop the schema does not accept (or miss one it requires). Used only
 * by the docs renderer; runtime renderers never import the catalog subpath.
 */

/** Fields every block may carry; listed once in the reference, not per type. */
export const BLOCK_BASE_PROPS = ['id', 'step', 'reveal', 'tone'] as const;

export interface BlockPropSummary {
  name: string;
  required: boolean;
  /** A short type, for example `string`, `number`, `"line" | "space"`, `block[][]`. */
  type: string;
}

interface SchemaDef {
  type: string;
  innerType?: SchemaLike;
  element?: SchemaLike;
  options?: SchemaLike[];
  in?: SchemaLike;
  values?: unknown[];
  entries?: Record<string, unknown>;
  getter?: () => SchemaLike;
}

interface SchemaLike {
  def: SchemaDef;
  shape?: Record<string, SchemaLike>;
}

const MAX_ENUM = 6;

function literal(value: unknown): string {
  return typeof value === 'string' ? `"${value}"` : String(value);
}

/** A compact type name for one schema; recursion is cut at depth 4 and at lazy blocks. */
function typeName(schema: SchemaLike | undefined, depth = 0): string {
  if (!schema || depth > 4) return 'unknown';
  const def = schema.def;
  switch (def.type) {
    case 'optional':
    case 'nullable':
    case 'default':
    case 'readonly':
      return typeName(def.innerType, depth + 1);
    case 'pipe':
      return typeName(def.in, depth + 1);
    case 'lazy':
      return 'block';
    case 'literal':
      return (def.values ?? []).map(literal).join(' | ');
    case 'enum': {
      const values = Object.values(def.entries ?? {});
      return values.length <= MAX_ENUM
        ? values.map(literal).join(' | ')
        : `enum (${values.length} values)`;
    }
    case 'array': {
      const inner = typeName(def.element, depth + 1);
      return inner.includes('|') ? `(${inner})[]` : `${inner}[]`;
    }
    case 'union': {
      const parts = [...new Set((def.options ?? []).map((option) => typeName(option, depth + 1)))];
      return parts.join(' | ');
    }
    case 'object': {
      // Show the keys of nested objects (list items, panels…), not their types.
      const keys = Object.entries(schema.shape ?? {}).map(
        ([key, field]) => `${key}${field.def.type === 'optional' ? '?' : ''}`
      );
      return keys.length > 0 && keys.length <= 10 ? `{ ${keys.join('; ')} }` : 'object';
    }
    case 'record':
      return 'object';
    default:
      return def.type;
  }
}

/** The props of one block type except `type` and the shared base fields (unless required). */
export function blockProps(type: BlockType): BlockPropSummary[] {
  const options = (BlockSchema as unknown as { options: SchemaLike[] }).options;
  const option = options.find((candidate) => {
    const discriminator = candidate.shape?.type?.def;
    return discriminator?.type === 'literal' && discriminator.values?.[0] === type;
  });
  if (!option?.shape) return [];
  const props: BlockPropSummary[] = [];
  for (const [name, schema] of Object.entries(option.shape)) {
    if (name === 'type') continue;
    const required = schema.def.type !== 'optional';
    // Skip the shared base fields (same schema object), not a block's own field
    // with the same name (a counter's `step` is its increment, not a fragment step).
    const base = (blockBase as Record<string, unknown>)[name];
    if (base !== undefined && base === schema) continue;
    props.push({ name, required, type: typeName(schema) });
  }
  return props;
}
