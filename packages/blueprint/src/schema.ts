import { z } from 'zod';

/**
 * `blueprint.json` — a data-only description of a product (ADR-017):
 * entities with typed fields and relations, roles with per-entity actions,
 * and screens. It contains no executable code; every derivation (stores,
 * inputs, policy, generators, services) reads this validated shape.
 *
 * Shapes are strict so typos fail loudly, and cross-references (relation
 * targets, title fields, owner fields, board columns) are checked after
 * parsing with path-specific messages.
 */

export const BLUEPRINT_SCHEMA_URL = 'https://github.com/DailybotHQ/protoyard/schema/blueprint/v1';

/** Entity, plural and role names: lowercase kebab-case. */
const NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
/** Field names become row properties: lowerCamelCase. */
const FIELD_PATTERN = /^[a-z][a-zA-Z0-9]*$/;
/** Table names allow `_` only so the reserved `py_` prefix gets a clear message. */
const TABLE_PATTERN = /^[a-z][a-zA-Z0-9_]*$/;
const RESERVED_PREFIX = 'py_';

/** Columns the platform manages on every row; blueprints cannot redeclare them. */
export const RESERVED_FIELD_NAMES = [
  'id',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'deletedBy',
] as const;

const name = (what: string) =>
  z.string().regex(NAME_PATTERN, { message: `${what} must be lowercase kebab-case` });
const fieldName = z
  .string()
  .regex(FIELD_PATTERN, { message: 'field names must be lowerCamelCase' });
const cents = z.number().int({ message: 'money is integer cents, never a float' });

const fieldBase = {
  name: fieldName,
  label: z.string().min(1).max(60).optional(),
  description: z.string().max(200).optional(),
  required: z.boolean().default(false),
  /** Redacted from audit diffs. */
  sensitive: z.boolean().default(false),
  /** Generator hint: a Faker path such as `company.name`. */
  fake: z
    .string()
    .regex(/^[a-z]+\.[a-zA-Z]+$/, { message: 'fake must look like "module.method"' })
    .optional(),
};

const lengths = (max: number) => ({
  minLength: z.number().int().nonnegative().optional(),
  maxLength: z.number().int().positive().max(max).default(max),
});

const field = <K extends string, S extends z.ZodRawShape = Record<never, never>>(
  kind: K,
  extra?: S
) => z.strictObject({ ...fieldBase, kind: z.literal(kind), ...(extra as S) });

export const FieldSchema = z.discriminatedUnion('kind', [
  field('text', {
    ...lengths(200),
    default: z.string().optional(),
  }),
  field('longText', {
    ...lengths(10_000),
    default: z.string().optional(),
  }),
  field('number', {
    min: z.number().optional(),
    max: z.number().optional(),
    default: z.number().optional(),
  }),
  field('integer', {
    min: z.number().int().optional(),
    max: z.number().int().optional(),
    default: z.number().int().optional(),
  }),
  field('money', {
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/, { message: 'currency must be an ISO 4217 code such as "USD"' })
      .default('USD'),
    min: cents.optional(),
    max: cents.optional(),
    default: cents.optional(),
  }),
  field('boolean', { default: z.boolean().optional() }),
  field('date'),
  field('datetime'),
  field('enum', {
    values: z
      .array(z.string().regex(/^[a-z0-9][a-z0-9_-]*$/, { message: 'enum values are lowercase' }))
      .min(1, { message: 'enum fields need at least one value' }),
    labels: z.record(z.string(), z.string().min(1)).optional(),
    default: z.string().optional(),
  }),
  field('email'),
  field('url'),
  field('phone'),
  field('tags', {
    maxItems: z.number().int().positive().max(64).default(8),
  }),
  field('relation', {
    /** Target entity `name`. */
    to: z.string().min(1),
    cardinality: z.enum(['one', 'many']).default('one'),
    onDelete: z.enum(['restrict', 'cascade', 'nullify']).default('restrict'),
  }),
  /** References a persona in the reserved `py_personas` table. */
  field('persona'),
  field('file', {
    /** MIME types or wildcards (`image/*`). Empty accepts any type. */
    accept: z.array(z.string().regex(/^[a-z]+\/(?:\*|[a-z0-9.+-]+)$/)).default([]),
    maxSizeBytes: z
      .number()
      .int()
      .positive()
      .max(50 * 1024 * 1024)
      .default(5 * 1024 * 1024),
    multiple: z.boolean().default(false),
  }),
  field('json'),
]);
export type BlueprintField = z.infer<typeof FieldSchema>;
export type FieldKind = BlueprintField['kind'];

export const FIELD_KINDS = FieldSchema.options.map((option) => option.shape.kind.value);

export const EntityFeaturesSchema = z.strictObject({
  softDelete: z.boolean().default(false),
  audit: z.boolean().default(false),
  notifications: z.boolean().default(false),
  files: z.boolean().default(false),
  csv: z.boolean().default(false),
});

export const EntitySchema = z.strictObject({
  /** Singular kebab-case name: `deal`, `support-ticket`. */
  name: name('entity name'),
  plural: name('entity plural'),
  label: z.string().min(1).max(60).optional(),
  /** Dexie table name; defaults to the plural in lowerCamelCase (see `entityTable`). */
  table: z.string().regex(TABLE_PATTERN, { message: 'table must be lowerCamelCase' }).optional(),
  fields: z.array(FieldSchema).min(1, { message: 'an entity needs at least one field' }),
  /** Field shown as the record's title in lists, pickers and search. */
  titleField: fieldName,
  searchable: z.array(fieldName).default([]),
  /** A `persona` field naming who owns the record (enables `:own` actions). */
  ownerField: fieldName.optional(),
  indexes: z.array(fieldName).default([]),
  defaultSort: z
    .strictObject({ field: fieldName, direction: z.enum(['asc', 'desc']).default('asc') })
    .optional(),
  features: EntityFeaturesSchema.default({
    softDelete: false,
    audit: false,
    notifications: false,
    files: false,
    csv: false,
  }),
});
export type BlueprintEntity = z.infer<typeof EntitySchema>;

export const ENTITY_ACTIONS = [
  'read',
  'create',
  'update',
  'update:own',
  'delete',
  'delete:own',
  'import',
  'export',
] as const;
export type EntityAction = (typeof ENTITY_ACTIONS)[number];

/** Exact capability denials are accepted for the runtime's `-capability` semantics. */
export const PermissionActionSchema = z.union([
  z.enum([...ENTITY_ACTIONS, '*']),
  z.string().regex(/^-[a-z][a-z0-9-]*(?::[a-z][a-z0-9:*-]*)?$/, {
    message: 'denials must name an exact capability such as "-ticket:delete"',
  }),
]);

export const RoleSchema = z.strictObject({
  name: name('role name'),
  label: z.string().min(1).max(40).optional(),
  description: z.string().max(200).optional(),
  /** Entity name (or `*` for every entity) → allowed actions (`*` for all). */
  permissions: z.record(z.string(), z.array(PermissionActionSchema)),
});
export type BlueprintRole = z.infer<typeof RoleSchema>;

const screenBase = {
  /** Hash route; defaults are derived from the entity when omitted. */
  path: z
    .string()
    .regex(/^\/[a-z0-9/:-]*$/, { message: 'path must be a hash route such as "/deals"' })
    .optional(),
  title: z.string().min(1).max(60).optional(),
};

export const ScreenSchema = z.discriminatedUnion('type', [
  z.strictObject({
    ...screenBase,
    type: z.literal('list'),
    entity: z.string().min(1),
    columns: z.array(fieldName).optional(),
  }),
  z.strictObject({ ...screenBase, type: z.literal('detail'), entity: z.string().min(1) }),
  z.strictObject({ ...screenBase, type: z.literal('form'), entity: z.string().min(1) }),
  z.strictObject({
    ...screenBase,
    type: z.literal('board'),
    entity: z.string().min(1),
    /** An `enum` field; each value becomes a column. */
    groupBy: fieldName,
  }),
  z.strictObject({
    ...screenBase,
    type: z.literal('dashboard'),
    metrics: z
      .array(
        z.strictObject({
          label: z.string().min(1).max(60),
          entity: z.string().min(1),
          aggregate: z.enum(['count', 'sum']),
          /** Required for `sum`: a number, integer or money field. */
          field: fieldName.optional(),
        })
      )
      .default([]),
  }),
]);
export type BlueprintScreen = z.infer<typeof ScreenSchema>;

const NotificationRuleSchema = z
  .strictObject({
    on: z.enum(['create', 'update', 'assign']),
    entity: name('notification entity'),
    field: fieldName.optional(),
    notify: z.string().regex(/^(owner|assignee|role:[a-z][a-z0-9]*(?:-[a-z0-9]+)*)$/),
    /** Plain text; `{field}` tokens are substituted from the changed entity row. */
    title: z
      .string()
      .min(1)
      .max(120)
      .refine((value) => !/<\/?[a-z][^>]*>/i.test(value), {
        message: 'notification titles must be plain text, not HTML',
      }),
  })
  .superRefine((rule, ctx) => {
    if (rule.on === 'assign' && !rule.field) {
      ctx.addIssue({
        code: 'custom',
        path: ['field'],
        message: 'assign rules need a persona field',
      });
    }
    if (rule.on !== 'assign' && rule.field !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['field'],
        message: 'field is only valid for assign rules',
      });
    }
  });
export type BlueprintNotificationRule = z.infer<typeof NotificationRuleSchema>;

const BlueprintShape = z.strictObject({
  $schema: z.string().optional(),
  formatVersion: z.literal(1),
  name: z.string().min(1).max(80),
  description: z.string().max(280).optional(),
  entities: z.array(EntitySchema).min(1, { message: 'a blueprint needs at least one entity' }),
  roles: z.array(RoleSchema).min(1, { message: 'a blueprint needs at least one role' }),
  notifications: z.array(NotificationRuleSchema).default([]),
  screens: z.array(ScreenSchema).default([]),
});

/** `plural` in lowerCamelCase unless `table` is set: `support-tickets` → `supportTickets`. */
export function entityTable(entity: Pick<BlueprintEntity, 'plural' | 'table'>): string {
  return entity.table ?? entity.plural.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

type Shape = z.output<typeof BlueprintShape>;
type Issue = { path: (string | number)[]; message: string };
type Add = (path: Issue['path'], message: string) => void;

const TITLE_KINDS = new Set<FieldKind>(['text', 'email', 'url', 'phone', 'enum', 'integer']);
const SUM_KINDS = new Set<FieldKind>(['number', 'integer', 'money']);

function duplicates(values: readonly string[]): Set<string> {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const value of values) (seen.has(value) ? dupes : seen).add(value);
  return dupes;
}

function checkEntity(entity: BlueprintEntity, at: number, names: Set<string>, add: Add) {
  const base = ['entities', at];
  const fields = new Map(entity.fields.map((f) => [f.name, f]));
  const table = entityTable(entity);
  if (table.startsWith(RESERVED_PREFIX)) {
    add([...base, 'table'], `table "${table}" uses the reserved "${RESERVED_PREFIX}" prefix`);
  }

  const dupes = duplicates(entity.fields.map((f) => f.name));
  entity.fields.forEach((field, i) => {
    const path = [...base, 'fields', i];
    if ((RESERVED_FIELD_NAMES as readonly string[]).includes(field.name)) {
      add([...path, 'name'], `"${field.name}" is managed by the platform and cannot be declared`);
    }
    if (dupes.has(field.name)) {
      add([...path, 'name'], `duplicate field "${field.name}"`);
    }
    if (field.kind === 'relation') {
      if (!names.has(field.to)) {
        add(
          [...path, 'to'],
          `relation "${entity.name}.${field.name}" targets unknown entity "${field.to}"`
        );
      }
      if (field.onDelete === 'nullify' && field.required) {
        add(
          [...path, 'onDelete'],
          `required relation "${field.name}" cannot use onDelete "nullify"`
        );
      }
    }
    if (field.kind === 'enum') {
      for (const value of duplicates(field.values)) {
        add([...path, 'values'], `duplicate enum value "${value}"`);
      }
      if (field.default !== undefined && !field.values.includes(field.default)) {
        add(
          [...path, 'default'],
          `default "${field.default}" is not one of ${field.values.join(', ')}`
        );
      }
    }
    if ('min' in field && field.min !== undefined && field.max !== undefined) {
      if (field.min > field.max) {
        add([...path, 'min'], 'min must not exceed max');
      }
    }
  });

  const title = fields.get(entity.titleField);
  if (!title) {
    add(
      [...base, 'titleField'],
      `titleField "${entity.titleField}" is not a field of "${entity.name}"`
    );
  } else if (!TITLE_KINDS.has(title.kind)) {
    add(
      [...base, 'titleField'],
      `titleField "${entity.titleField}" must be a text-like field, not ${title.kind}`
    );
  }
  if (entity.ownerField !== undefined && fields.get(entity.ownerField)?.kind !== 'persona') {
    add(
      [...base, 'ownerField'],
      `ownerField "${entity.ownerField}" must be a persona field of "${entity.name}"`
    );
  }
  for (const key of ['searchable', 'indexes'] as const) {
    entity[key].forEach((ref, i) => {
      if (!fields.has(ref)) {
        add([...base, key, i], `unknown field "${ref}"`);
      }
    });
  }
  if (entity.defaultSort && !fields.has(entity.defaultSort.field)) {
    add([...base, 'defaultSort', 'field'], `unknown field "${entity.defaultSort.field}"`);
  }
  if (entity.features.files && !entity.fields.some((f) => f.kind === 'file')) {
    add(
      [...base, 'features', 'files'],
      `features.files needs at least one file field on "${entity.name}"`
    );
  }
}

/** Cross-reference checks that a JSON shape cannot express. */
export function blueprintIssues(blueprint: Shape): Issue[] {
  const issues: Issue[] = [];
  const add: Add = (path, message) => {
    issues.push({ path, message });
  };
  const entities = new Map(blueprint.entities.map((e) => [e.name, e]));
  const names = new Set(entities.keys());

  for (const [key, values] of [
    ['name', blueprint.entities.map((e) => e.name)],
    ['plural', blueprint.entities.map((e) => e.plural)],
    ['table', blueprint.entities.map(entityTable)],
  ] as const) {
    const dupes = duplicates(values);
    values.forEach((value, i) => {
      if (dupes.has(value)) {
        add(['entities', i, key], `duplicate entity ${key} "${value}"`);
      }
    });
  }
  blueprint.entities.forEach((entity, i) => {
    checkEntity(entity, i, names, add);
  });

  blueprint.notifications.forEach((rule, i) => {
    const path = ['notifications', i];
    const entity = entities.get(rule.entity);
    if (!entity) {
      add([...path, 'entity'], `unknown entity "${rule.entity}"`);
      return;
    }
    const fields = new Map(entity.fields.map((field) => [field.name, field]));
    if (rule.on === 'assign' && rule.field && fields.get(rule.field)?.kind !== 'persona') {
      add(
        [...path, 'field'],
        `assign field "${rule.field}" must be a persona field of "${entity.name}"`
      );
    }
    if (
      rule.notify === 'owner' &&
      (!entity.ownerField || fields.get(entity.ownerField)?.kind !== 'persona')
    ) {
      add([...path, 'notify'], `notify "owner" needs an ownerField on "${entity.name}"`);
    }
    if (
      rule.notify === 'assignee' &&
      !entity.fields.some((field) => field.name === 'assignee' && field.kind === 'persona')
    ) {
      add(
        [...path, 'notify'],
        `notify "assignee" needs an assignee persona field on "${entity.name}"`
      );
    }
    if (rule.notify.startsWith('role:')) {
      const roleName = rule.notify.slice('role:'.length);
      if (!blueprint.roles.some((role) => role.name === roleName)) {
        add([...path, 'notify'], `unknown notification role "${roleName}"`);
      }
    }
    for (const match of rule.title.matchAll(/\{([^{}]+)\}/g)) {
      if (!fields.has(match[1] ?? '')) {
        add([...path, 'title'], `unknown title placeholder "${match[1]}" on "${entity.name}"`);
      }
    }
  });

  const roleDupes = duplicates(blueprint.roles.map((r) => r.name));
  blueprint.roles.forEach((role, i) => {
    if (roleDupes.has(role.name)) {
      add(['roles', i, 'name'], `duplicate role "${role.name}"`);
    }
    for (const [target, actions] of Object.entries(role.permissions)) {
      const path = ['roles', i, 'permissions', target];
      const entity = entities.get(target);
      if (target !== '*' && !entity) {
        add(path, `unknown entity "${target}"`);
        continue;
      }
      const own = actions.filter((a) => a.endsWith(':own'));
      if (own.length > 0) {
        const lacking =
          target === '*'
            ? blueprint.entities.filter((e) => !e.ownerField)
            : entity && !entity.ownerField
              ? [entity]
              : [];
        for (const e of lacking) {
          add(path, `"${own.join('", "')}" needs an ownerField on entity "${e.name}"`);
        }
      }
    }
  });

  blueprint.screens.forEach((screen, i) => {
    const path = ['screens', i];
    const refs =
      screen.type === 'dashboard'
        ? screen.metrics.map((m, j) => ({ entity: m.entity, path: [...path, 'metrics', j] }))
        : [{ entity: screen.entity, path }];
    for (const ref of refs) {
      if (!entities.has(ref.entity)) {
        add([...ref.path, 'entity'], `unknown entity "${ref.entity}"`);
      }
    }
    if (screen.type === 'dashboard') {
      screen.metrics.forEach((metric, j) => {
        const field = entities.get(metric.entity)?.fields.find((f) => f.name === metric.field);
        if (metric.aggregate === 'sum' && (!field || !SUM_KINDS.has(field.kind))) {
          add([...path, 'metrics', j, 'field'], 'sum needs a number, integer or money field');
        }
      });
      return;
    }
    const entity = entities.get(screen.entity);
    if (!entity) return;
    const fields = new Map(entity.fields.map((f) => [f.name, f]));
    if (screen.type === 'board' && fields.get(screen.groupBy)?.kind !== 'enum') {
      add(
        [...path, 'groupBy'],
        `groupBy "${screen.groupBy}" must be an enum field of "${entity.name}"`
      );
    }
    if (screen.type === 'list') {
      screen.columns?.forEach((column, j) => {
        if (!fields.has(column)) {
          add([...path, 'columns', j], `unknown field "${column}"`);
        }
      });
    }
  });
  return issues;
}

export const BlueprintSchema = BlueprintShape.superRefine((blueprint, ctx) => {
  for (const issue of blueprintIssues(blueprint)) {
    ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message });
  }
});

export type Blueprint = z.output<typeof BlueprintSchema>;
export type BlueprintInput = z.input<typeof BlueprintSchema>;

export function parseBlueprint(input: unknown): Blueprint {
  return BlueprintSchema.parse(input);
}

export function safeParseBlueprint(input: unknown) {
  return BlueprintSchema.safeParse(input);
}

/** JSON Schema (draft 2020-12) for editors; refinements above are not expressible in it. */
export function blueprintJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(BlueprintShape, { io: 'input', target: 'draft-2020-12' });
  return {
    $schema: schema.$schema,
    $id: BLUEPRINT_SCHEMA_URL,
    title: 'Protoyard blueprint',
    ...schema,
  };
}
