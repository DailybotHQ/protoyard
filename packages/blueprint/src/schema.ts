import { CatalogSchema, LayoutIdSchema } from '@protoyard/core';
import { GEO_REGIONS, type GeoRegionId } from '@protoyard/scenarios';
import { z } from 'zod';
import { ArchetypeSchema } from './archetypes/schema.ts';

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

/**
 * How generated values of a number, integer or money field evolve with the
 * row's `createdAt`: `growth` and `decline` trend over time, `seasonal` adds
 * weekly and yearly rhythm. Generation hint only; inputs are not affected.
 */
export const FIELD_TRENDS = ['flat', 'growth', 'decline', 'seasonal'] as const;
const trend = z.enum(FIELD_TRENDS).optional();

/**
 * Where generated dates fall, relative to the scenario's now: `past` (since
 * the organization started, the default), `future` (the next 30 days),
 * `around` (14 days either side), or `{ from, to }` in days (negative is past).
 * Past dates never precede the organization; dates after now are allowed and
 * are therefore left out of the "nothing in the future" integrity check.
 */
export const DateWindowSchema = z.union([
  z.enum(['past', 'future', 'around']),
  z.strictObject({
    from: z.number().int().min(-3650).max(3650),
    to: z.number().int().min(-3650).max(3650),
  }),
]);
export type DateWindow = z.infer<typeof DateWindowSchema>;

/** A window as day offsets from now; `null` from means "since the organization started". */
export function dateWindowDays(window: DateWindow | undefined): {
  from: number | null;
  to: number;
} {
  if (window === undefined || window === 'past') return { from: null, to: 0 };
  if (window === 'future') return { from: 0, to: 30 };
  if (window === 'around') return { from: -14, to: 14 };
  return window;
}

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
    trend,
  }),
  field('integer', {
    min: z.number().int().optional(),
    max: z.number().int().optional(),
    default: z.number().int().optional(),
    trend,
  }),
  field('money', {
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/, { message: 'currency must be an ISO 4217 code such as "USD"' })
      .default('USD'),
    min: cents.optional(),
    max: cents.optional(),
    default: cents.optional(),
    trend,
  }),
  field('boolean', { default: z.boolean().optional() }),
  field('date', { window: DateWindowSchema.optional() }),
  field('datetime', { window: DateWindowSchema.optional() }),
  field('enum', {
    values: z
      .array(z.string().regex(/^[a-z0-9][a-z0-9_-]*$/, { message: 'enum values are lowercase' }))
      .min(1, { message: 'enum fields need at least one value' }),
    labels: z.record(z.string(), z.string().min(1)).optional(),
    default: z.string().optional(),
    /** Relative generation weights, one per value (default: equal). */
    weights: z.array(z.number().nonnegative()).optional(),
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
  /**
   * A point stored as `{ lat, lng }` (5 decimals). `region` names a fictional
   * region from `@protoyard/scenarios` that generated points fall inside.
   */
  field('geo', {
    region: z.enum(Object.keys(GEO_REGIONS) as [GeoRegionId, ...GeoRegionId[]]).optional(),
  }),
  /**
   * A face from the avatar library, stored as its id (`av-001` … `av-175`).
   * Generated rows get distinct seeded faces; never indexed, searched or sorted.
   */
  field('avatar'),
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
  /** Rows to generate at `normal` density (scaled by density); default 4 for roots, 8 for dependents. */
  seedCount: z.number().int().min(1).max(500).optional(),
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

/**
 * Lucide icon names (kebab-case) a screen's `nav.icon` may use. An allow-list
 * keeps generated imports static and tree-shakeable.
 */
export const SCREEN_NAV_ICONS = [
  'activity',
  'bell',
  'book-open',
  'briefcase',
  'building',
  'calendar',
  'calendar-days',
  'chart-bar',
  'chart-gantt',
  'chart-line',
  'chart-pie',
  'clock',
  'cpu',
  'database',
  'dollar-sign',
  'file-text',
  'folder',
  'globe',
  'graduation-cap',
  'heart-pulse',
  'house',
  'inbox',
  'kanban',
  'layout-dashboard',
  'list',
  'map',
  'map-pin',
  'message-square',
  'package',
  'receipt',
  'settings',
  'shopping-cart',
  'star',
  'table',
  'tag',
  'ticket',
  'truck',
  'users',
  'wallet',
  'wrench',
  'zap',
] as const;
export type ScreenNavIcon = (typeof SCREEN_NAV_ICONS)[number];

/** Sidebar entry options shared by every screen. */
export const ScreenNavSchema = z.strictObject({
  label: z.string().min(1).max(40).optional(),
  icon: z.enum(SCREEN_NAV_ICONS).optional(),
  /** Lower comes first; screens without an order keep blueprint order after ordered ones. */
  order: z.number().int().min(0).max(999).optional(),
  /** Routed but not listed in the sidebar. */
  hidden: z.boolean().default(false),
});
export type BlueprintScreenNav = z.infer<typeof ScreenNavSchema>;

const screenBase = {
  /** Hash route; defaults are derived from the kind and entity (see `screenPath`). */
  path: z
    .string()
    .regex(/^\/[a-z0-9/:-]*$/, { message: 'path must be a hash route such as "/deals"' })
    .optional(),
  title: z.string().min(1).max(60).optional(),
  nav: ScreenNavSchema.optional(),
};

export const AGGREGATES = ['count', 'sum', 'avg', 'min', 'max'] as const;
export type Aggregate = (typeof AGGREGATES)[number];
export const BUCKET_UNITS = ['day', 'week', 'month'] as const;
export const CHART_KINDS = ['line', 'area', 'bar', 'donut'] as const;
export const DETAIL_TABS = ['overview', 'activity', 'files', 'audit'] as const;
export const SETTINGS_SECTIONS = [
  'profile',
  'workspace',
  'appearance',
  'notifications',
  'danger',
] as const;

const filterValue = z.union([z.string(), z.number(), z.boolean()]);

/** Restricts the rows a widget reads: `{ field, op, value }`; `in` takes an array. */
export const ScreenFilterSchema = z.strictObject({
  field: fieldName,
  op: z.enum(['eq', 'in', 'gte', 'lte']),
  value: z.union([filterValue, z.array(filterValue).min(1)]),
});
export type BlueprintScreenFilter = z.infer<typeof ScreenFilterSchema>;

/** Date bucketing for time series: `{ field: 'createdAt', unit: 'week' }`. */
export const ScreenBucketSchema = z.strictObject({
  /** A `date` or `datetime` field, or the managed `createdAt` / `updatedAt`. */
  field: fieldName,
  unit: z.enum(BUCKET_UNITS),
});

const widgetBase = {
  label: z.string().min(1).max(60),
  entity: z.string().min(1),
  filter: ScreenFilterSchema.optional(),
  /** Grid columns the widget spans (1–4). */
  span: z.number().int().min(1).max(4).optional(),
};
const measure = {
  aggregate: z.enum(AGGREGATES).default('count'),
  /** Required for every aggregate except `count`. */
  field: fieldName.optional(),
};

export const DashboardWidgetSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...widgetBase, ...measure, kind: z.literal('kpi') }),
  z.strictObject({
    ...widgetBase,
    ...measure,
    kind: z.literal('chart'),
    chart: z.enum(CHART_KINDS),
    /** An `enum`, `relation`, `persona` or `boolean` field: one series or slice per value. */
    groupBy: fieldName.optional(),
    bucket: ScreenBucketSchema.optional(),
  }),
  z.strictObject({
    ...widgetBase,
    kind: z.literal('list'),
    limit: z.number().int().min(1).max(20).default(5),
    sort: z
      .strictObject({ field: fieldName, direction: z.enum(['asc', 'desc']).default('desc') })
      .optional(),
  }),
  z.strictObject({
    ...widgetBase,
    kind: z.literal('board-summary'),
    /** An `enum` field: one count per value, linking to the board. */
    groupBy: fieldName,
  }),
]);
export type BlueprintDashboardWidget = z.infer<typeof DashboardWidgetSchema>;

/** formatVersion 1 dashboard metric; parsed into a `kpi` widget. */
const LegacyMetricSchema = z.strictObject({
  label: z.string().min(1).max(60),
  entity: z.string().min(1),
  aggregate: z.enum(['count', 'sum']),
  /** Required for `sum`: a number, integer or money field. */
  field: fieldName.optional(),
});

const entityScreen = <T extends string, S extends z.ZodRawShape = Record<never, never>>(
  type: T,
  extra?: S
) =>
  z.strictObject({
    ...screenBase,
    type: z.literal(type),
    entity: z.string().min(1),
    ...(extra as S),
  });

const DetailTabSchema = z.union([
  z.enum(DETAIL_TABS),
  z.string().regex(/^related:[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, {
    message: 'tabs are overview, activity, files, audit or related:<entity>',
  }),
]);

/**
 * Screens a generated prototype routes. Additive to formatVersion 1: older
 * files parse unchanged. Parsing keeps what the file says so issues point at
 * real paths; consumers normalize with `dashboardWidgets` (legacy `metrics`
 * become `kpi` widgets) and `screenPath` (default routes).
 */
export const ScreenSchema = z.discriminatedUnion('type', [
  entityScreen('list', { columns: z.array(fieldName).optional() }),
  entityScreen('detail', {
    /** Record page tabs; omitted means the edit form only. */
    tabs: z.array(DetailTabSchema).min(1).optional(),
  }),
  entityScreen('form'),
  entityScreen('board', {
    /** An `enum` field; each value becomes a column. */
    groupBy: fieldName,
    cardFields: z.array(fieldName).max(6).optional(),
    /** A number, integer or money field summed per column. */
    sumField: fieldName.optional(),
  }),
  entityScreen('calendar', {
    /** A `date` or `datetime` field. */
    dateField: fieldName,
    /** Optional end of the event, same kinds as `dateField`. */
    endField: fieldName.optional(),
    /** An `enum` field that colors events. */
    colorBy: fieldName.optional(),
    view: z.enum(['month', 'week', 'day', 'agenda']).default('month'),
  }),
  entityScreen('timeline', {
    startField: fieldName,
    endField: fieldName,
    /** An `enum`, `relation` or `persona` field: one row per value. */
    groupBy: fieldName.optional(),
    zoom: z.enum(['week', 'month', 'quarter']).default('month'),
  }),
  entityScreen('map', {
    /** A `geo` field. */
    geoField: fieldName,
    colorBy: fieldName.optional(),
  }),
  entityScreen('analytics', {
    /** A `date` or `datetime` field (or `createdAt`) the explorer buckets by. */
    dateField: fieldName,
    measures: z
      .array(z.strictObject({ label: z.string().min(1).max(60).optional(), ...measure }))
      .min(1),
    /** `enum`, `relation`, `persona` or `boolean` fields to break measures down by. */
    dimensions: z.array(fieldName).default([]),
  }),
  z.strictObject({
    ...screenBase,
    type: z.literal('dashboard'),
    /** formatVersion 1 KPI list; read both through `dashboardWidgets`. */
    metrics: z.array(LegacyMetricSchema).optional(),
    widgets: z.array(DashboardWidgetSchema).default([]),
  }),
  z.strictObject({
    ...screenBase,
    type: z.literal('settings'),
    sections: z
      .array(z.enum(SETTINGS_SECTIONS))
      .min(1)
      .default(['profile', 'workspace', 'appearance']),
  }),
]);
export type BlueprintScreen = z.infer<typeof ScreenSchema>;
export type BlueprintScreenInput = z.input<typeof ScreenSchema>;
export type ScreenType = BlueprintScreen['type'];
export const SCREEN_TYPES = [
  'list',
  'detail',
  'form',
  'board',
  'calendar',
  'timeline',
  'map',
  'analytics',
  'dashboard',
  'settings',
] as const satisfies readonly ScreenType[];

/** A dashboard's widgets with its legacy `metrics` first, as `kpi` widgets. */
export function dashboardWidgets(
  screen: Extract<BlueprintScreen, { type: 'dashboard' }>
): BlueprintDashboardWidget[] {
  const legacy = (screen.metrics ?? []).map(
    (metric): BlueprintDashboardWidget => ({ ...metric, kind: 'kpi' })
  );
  return [...legacy, ...screen.widgets];
}

/** Route segment each entity-scoped view kind gets below `/<plural>`. */
const VIEW_SEGMENT: Partial<Record<ScreenType, string>> = {
  board: 'board',
  calendar: 'calendar',
  timeline: 'timeline',
  map: 'map',
  analytics: 'analytics',
};

/**
 * The hash route a screen gets: its `path`, or the default for its kind —
 * `/<plural>`, `/<plural>/:id`, `/<plural>/new`, `/<plural>/<kind>`,
 * `/dashboard` and `/settings`. Null when the entity is unknown.
 */
export function screenPath(
  screen: Pick<BlueprintScreen, 'type' | 'path'> & { entity?: string },
  entities: readonly Pick<BlueprintEntity, 'name' | 'plural'>[]
): string | null {
  if (screen.path) return screen.path;
  if (screen.type === 'dashboard') return '/dashboard';
  if (screen.type === 'settings') return '/settings';
  const entity = entities.find((e) => e.name === screen.entity);
  if (!entity) return null;
  if (screen.type === 'list') return `/${entity.plural}`;
  if (screen.type === 'detail') return `/${entity.plural}/:id`;
  if (screen.type === 'form') return `/${entity.plural}/new`;
  return `/${entity.plural}/${VIEW_SEGMENT[screen.type]}`;
}

/** Routes the generated app always owns; screens cannot claim them. */
export const RESERVED_SCREEN_PATHS = ['/members'] as const;

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
      .refine((value) => value.length <= 120 && !/<\/?[a-z][^>]*>/i.test(value), {
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

/**
 * A previous blueprint kept by `protoyard generate` so every database version
 * can be rebuilt from data alone: version 1 is the first entry's stores, and
 * each later entry (and finally the current blueprint) is diffed against the
 * one before it. `migrateNext` holds the options of that next diff.
 */
export const BlueprintHistoryEntrySchema = z.strictObject({
  schemaVersion: z.number().int().positive(),
  /** The blueprint as it was (without its own history); validated when versions are derived. */
  blueprint: z.record(z.string(), z.unknown()),
  migrateNext: z.strictObject({ allowDrop: z.boolean().optional() }).optional(),
});
export type BlueprintHistoryEntry = z.infer<typeof BlueprintHistoryEntrySchema>;

/** Brand fields a `libraryTheme` replaces; setting any of them alongside it is an error. */
const LIBRARY_EXCLUSIVE_KEYS = [
  'id',
  'seed',
  'secondary',
  'preset',
  'styleProfile',
  'font',
  'radius',
  'density',
] as const;

/** Brand hex seed (`#rgb` or `#rrggbb`). */
const brandHex = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, {
  message: 'brand colors must be #rgb or #rrggbb hex',
});

/**
 * Optional product brand for `protoyard generate`. When set, the CLI builds a
 * WCAG AA theme (seed palette and/or built-in preset + style profile + font)
 * and wires it as the prototype default. `libraryTheme` instead names one of
 * the `@protoyard/themes` library looks: the prototype ships it by id, with no
 * generated theme module. Absent brand → template default theme.
 */
export const BlueprintBrandSchema = z
  .strictObject({
    /**
     * Theme id written into the prototype (kebab-case: no leading, trailing or
     * doubled hyphens, so it always maps to a valid export name). Defaults from name.
     */
    id: z
      .string()
      .regex(NAME_PATTERN, { message: 'brand id must be lowercase kebab-case' })
      .max(40)
      .optional(),
    /** Display name for the generated theme (max 40; ThemeSchema limit). */
    name: z.string().min(1).max(40).optional(),
    /** Brand seed for the palette engine. Required unless `preset` is set. */
    seed: brandHex.optional(),
    /** Optional secondary seed for charts and secondary fills. */
    secondary: brandHex.optional(),
    /**
     * Built-in preset id (`violet`, `ocean`, …). Used as the full theme when
     * `seed` is omitted; ignored for palette when `seed` is present.
     */
    preset: z.enum(['violet', 'ocean', 'emerald', 'rose', 'amber', 'monochrome']).optional(),
    /**
     * Named style profile: radius, density and elevation knobs applied after
     * the palette (or preset) is chosen.
     */
    styleProfile: z.enum(['soft', 'crisp', 'flat', 'rounded', 'editorial', 'mono']).optional(),
    /** `FONT_CATALOG` id from `@protoyard/themes`. */
    font: z
      .enum([
        'system',
        'humanist',
        'geometric',
        'grotesk',
        'editorial',
        'rounded',
        'condensed',
        'mono',
      ])
      .optional(),
    /** CSS radius length (`0.5rem`, `8px`). */
    radius: z
      .string()
      .regex(/^(?:0|\d{1,3}(?:\.\d{1,4})?(?:px|rem|em))$/, {
        message: 'radius must look like 0.5rem or 8px',
      })
      .optional(),
    /** Spacing multiplier 0.75–1.25. */
    density: z.number().min(0.75).max(1.25).optional(),
    /**
     * `THEME_LIBRARY_META` id (`fintech-ledger`, `health-clinic`, …) used as-is.
     * Its palette, fonts, radius and density come from the library (AA-tested
     * there), so it excludes `id`, `seed`, `secondary`, `preset`,
     * `styleProfile`, `font`, `radius` and `density`. The id is checked against
     * the library by `brandLibraryThemeId` (generate, `blueprint validate`), not
     * here: `parseBlueprint` runs in prototype bundles, which load the library
     * lazily.
     */
    libraryTheme: z
      .string()
      .regex(/^[a-z][a-z0-9-]*$/, { message: 'libraryTheme must be a lowercase kebab-case id' })
      .max(40)
      .optional(),
  })
  .superRefine((brand, ctx) => {
    if (brand.libraryTheme !== undefined) {
      for (const key of LIBRARY_EXCLUSIVE_KEYS) {
        if (brand[key] !== undefined) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `brand.${key} cannot be combined with libraryTheme (the library theme is used as-is)`,
          });
        }
      }
      return;
    }
    if (!brand.seed && !brand.preset) {
      ctx.addIssue({
        code: 'custom',
        path: ['seed'],
        message: 'brand needs a seed color, a theme preset or a libraryTheme',
      });
    }
  });
export type BlueprintBrand = z.infer<typeof BlueprintBrandSchema>;
export type BlueprintBrandInput = z.input<typeof BlueprintBrandSchema>;

const BlueprintShape = z.strictObject({
  $schema: z.string().optional(),
  formatVersion: z.literal(1),
  name: z.string().min(1).max(80),
  description: z.string().max(280).optional(),
  /**
   * Marketplace shelf metadata (optional). Catalog blueprints under
   * `blueprints/` set this so the registry can index them without a
   * `protoyard.json`. Same shape as the manifest `catalog` block.
   */
  catalog: CatalogSchema.optional(),
  /** Gallery tags when this file is indexed as a catalog blueprint. */
  tags: z.array(z.string().min(1).max(32)).max(16).default([]),
  /** Emoji or short glyph for catalog cards. */
  icon: z.string().max(8).optional(),
  /** Coarse category string (falls back to `catalog.category` when indexed). */
  category: z.string().min(1).max(40).optional(),
  /** Optional brand → generated on-brand theme for `protoyard generate`. */
  brand: BlueprintBrandSchema.optional(),
  /** Shared app layout selected by generated apps. */
  layout: z
    .strictObject({
      id: LayoutIdSchema,
      mobile: LayoutIdSchema.optional(),
    })
    .optional(),
  /** Portable kit-backed runtime data; omitted by ordinary CRUD blueprints. */
  archetype: ArchetypeSchema.optional(),
  entities: z.array(EntitySchema).min(1, { message: 'a blueprint needs at least one entity' }),
  roles: z.array(RoleSchema).min(1, { message: 'a blueprint needs at least one role' }),
  notifications: z.array(NotificationRuleSchema).default([]),
  screens: z.array(ScreenSchema).default([]),
  /** Earlier versions, oldest first. Written by `protoyard generate`; do not edit by hand. */
  history: z.array(BlueprintHistoryEntrySchema).default([]),
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
/** Kinds that are never indexed, searched or used to sort a list. */
const UNSORTABLE_KINDS = new Set<FieldKind>(['geo', 'avatar']);

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
      if (field.weights !== undefined) {
        if (field.weights.length !== field.values.length) {
          add([...path, 'weights'], `weights needs one entry per value (${field.values.length})`);
        } else if (!field.weights.some((w) => w > 0)) {
          add([...path, 'weights'], 'weights needs at least one positive entry');
        }
      }
    }
    if ((field.kind === 'date' || field.kind === 'datetime') && typeof field.window === 'object') {
      if (field.window.from > field.window.to) {
        add([...path, 'window'], 'window.from must not be after window.to');
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
      } else if (UNSORTABLE_KINDS.has(fields.get(ref)?.kind as FieldKind)) {
        add(
          [...base, key, i],
          `${fields.get(ref)?.kind} field "${ref}" cannot be ${key === 'indexes' ? 'indexed' : 'searched'}`
        );
      }
    });
  }
  if (entity.defaultSort && !fields.has(entity.defaultSort.field)) {
    add([...base, 'defaultSort', 'field'], `unknown field "${entity.defaultSort.field}"`);
  } else if (
    entity.defaultSort &&
    UNSORTABLE_KINDS.has(fields.get(entity.defaultSort.field)?.kind as FieldKind)
  ) {
    add(
      [...base, 'defaultSort', 'field'],
      `${fields.get(entity.defaultSort.field)?.kind} field "${entity.defaultSort.field}" cannot sort a list`
    );
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
  if (blueprint.archetype) {
    for (const [slot, entityName] of Object.entries(blueprint.archetype.entities)) {
      if (!entities.has(entityName)) {
        add(
          ['archetype', 'entities', slot],
          `archetype entity slot "${slot}" references unknown entity "${entityName}"`
        );
      }
    }
  }

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
      const field = fields.get(match[1] ?? '');
      if (!field) {
        add([...path, 'title'], `unknown title placeholder "${match[1]}" on "${entity.name}"`);
      } else if (field.sensitive) {
        add(
          [...path, 'title'],
          `sensitive field "${field.name}" cannot be used in a notification title`
        );
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

  checkScreens(blueprint, add);
  return issues;
}

/** The managed timestamps are valid date fields for buckets and analytics. */
const MANAGED_DATE_FIELDS = new Set(['createdAt', 'updatedAt']);
const DATE_KINDS = new Set<FieldKind>(['date', 'datetime']);
const GROUP_KINDS = new Set<FieldKind>(['enum', 'relation', 'persona', 'boolean']);
const MIN_MAX_KINDS = new Set<FieldKind>([...SUM_KINDS, ...DATE_KINDS]);
/** Field kinds a map screen can plot. */
const GEO_KINDS = new Set<FieldKind>(['geo']);

/** `a number, integer or money` / `an enum`: the kinds as an English list with its article. */
function kindList(kinds: Iterable<string>): string {
  const list = [...kinds];
  const text =
    list.length === 1 ? (list[0] as string) : `${list.slice(0, -1).join(', ')} or ${list.at(-1)}`;
  return `${/^[aeiou]/.test(text) ? 'an' : 'a'} ${text}`;
}

/** Cross-reference checks for screens, dashboard widgets and routes. */
function checkScreens(blueprint: Shape, add: Add) {
  const entities = new Map(blueprint.entities.map((e) => [e.name, e]));

  /** Looks up `name` on `entity` and reports it unless its kind is in `kinds`. */
  const expectField = (
    entity: BlueprintEntity,
    name: string,
    kinds: ReadonlySet<string> | null,
    path: Issue['path'],
    what: string,
    managedDates = false
  ): BlueprintField | undefined => {
    if (managedDates && MANAGED_DATE_FIELDS.has(name)) return undefined;
    const field = entity.fields.find((f) => f.name === name);
    if (!field) {
      add(path, `unknown field "${name}" on "${entity.name}"`);
    } else if (kinds && !kinds.has(field.kind)) {
      const managed = managedDates ? ' (or createdAt / updatedAt)' : '';
      add(path, `${what} "${name}" must be ${kindList(kinds)} field of "${entity.name}"${managed}`);
    }
    return field;
  };

  const checkMeasure = (
    entity: BlueprintEntity,
    measure: { aggregate: Aggregate; field?: string | undefined },
    path: Issue['path']
  ) => {
    if (measure.aggregate === 'count') {
      if (measure.field !== undefined) add([...path, 'field'], 'count does not take a field');
      return;
    }
    const kinds =
      measure.aggregate === 'min' || measure.aggregate === 'max' ? MIN_MAX_KINDS : SUM_KINDS;
    const field = entity.fields.find((f) => f.name === measure.field);
    if (!field || !kinds.has(field.kind)) {
      add([...path, 'field'], `${measure.aggregate} needs ${kindList(kinds)} field`);
    }
  };

  const checkFilter = (
    entity: BlueprintEntity,
    filter: BlueprintScreenFilter,
    path: Issue['path']
  ) => {
    const field = expectField(entity, filter.field, null, [...path, 'field'], 'filter field');
    if ((filter.op === 'in') !== Array.isArray(filter.value)) {
      add(
        [...path, 'value'],
        filter.op === 'in'
          ? 'op "in" needs an array value'
          : `op "${filter.op}" needs a single value`
      );
    }
    if (field?.kind === 'enum') {
      const values = Array.isArray(filter.value) ? filter.value : [filter.value];
      for (const value of values) {
        if (!field.values.includes(String(value))) {
          add([...path, 'value'], `"${value}" is not one of ${field.values.join(', ')}`);
        }
      }
    }
  };

  const seen = new Map<string, number>();
  blueprint.screens.forEach((screen, i) => {
    const path = ['screens', i];

    const route = screenPath(screen, blueprint.entities);
    if (route !== null) {
      if ((RESERVED_SCREEN_PATHS as readonly string[]).includes(route)) {
        add([...path, 'path'], `path "${route}" is reserved by the generated app`);
      }
      const first = seen.get(route);
      if (first !== undefined) {
        add([...path, 'path'], `path "${route}" is already used by screens.${first}`);
      } else {
        seen.set(route, i);
      }
    }

    if (screen.type === 'settings') {
      if (
        screen.sections.includes('notifications') &&
        !blueprint.entities.some((e) => e.features.notifications)
      ) {
        add(
          [...path, 'sections'],
          'the notifications section needs an entity with features.notifications'
        );
      }
      for (const section of duplicates(screen.sections)) {
        add([...path, 'sections'], `duplicate section "${section}"`);
      }
      return;
    }

    if (screen.type === 'dashboard') {
      const legacy = screen.metrics ?? [];
      dashboardWidgets(screen).forEach((widget, n) => {
        const at =
          n < legacy.length ? [...path, 'metrics', n] : [...path, 'widgets', n - legacy.length];
        const entity = entities.get(widget.entity);
        if (!entity) {
          add([...at, 'entity'], `unknown entity "${widget.entity}"`);
          return;
        }
        if (widget.filter) checkFilter(entity, widget.filter, [...at, 'filter']);
        if (widget.kind === 'kpi' || widget.kind === 'chart') checkMeasure(entity, widget, at);
        if (widget.kind === 'list' && widget.sort) {
          expectField(entity, widget.sort.field, null, [...at, 'sort', 'field'], 'sort field');
        }
        if (widget.kind === 'board-summary') {
          expectField(entity, widget.groupBy, new Set(['enum']), [...at, 'groupBy'], 'groupBy');
        }
        if (widget.kind === 'chart') {
          if (widget.groupBy !== undefined) {
            expectField(entity, widget.groupBy, GROUP_KINDS, [...at, 'groupBy'], 'groupBy');
          }
          if (widget.bucket) {
            expectField(
              entity,
              widget.bucket.field,
              DATE_KINDS,
              [...at, 'bucket', 'field'],
              'bucket field',
              true
            );
          }
          if (widget.chart === 'donut' && (!widget.groupBy || widget.bucket)) {
            add([...at, 'chart'], 'a donut chart needs groupBy and no bucket');
          }
          if ((widget.chart === 'line' || widget.chart === 'area') && !widget.bucket) {
            add([...at, 'bucket'], `a ${widget.chart} chart needs a date bucket`);
          }
          if (widget.chart === 'bar' && !widget.groupBy && !widget.bucket) {
            add([...at, 'chart'], 'a bar chart needs groupBy or a date bucket');
          }
        }
      });
      return;
    }

    const entity = entities.get(screen.entity);
    if (!entity) {
      add([...path, 'entity'], `unknown entity "${screen.entity}"`);
      return;
    }
    const fields = new Map(entity.fields.map((f) => [f.name, f]));
    const enumOnly = new Set<FieldKind>(['enum']);

    switch (screen.type) {
      case 'list':
        screen.columns?.forEach((column, j) => {
          if (!fields.has(column)) add([...path, 'columns', j], `unknown field "${column}"`);
        });
        break;
      case 'detail':
        for (const tab of duplicates(screen.tabs ?? [])) {
          add([...path, 'tabs'], `duplicate tab "${tab}"`);
        }
        screen.tabs?.forEach((tab, j) => {
          const at = [...path, 'tabs', j];
          if ((tab === 'activity' || tab === 'audit') && !entity.features.audit) {
            add(at, `the ${tab} tab needs features.audit on "${entity.name}"`);
          } else if (tab === 'files' && !entity.features.files) {
            add(at, `the files tab needs features.files on "${entity.name}"`);
          } else if (tab.startsWith('related:')) {
            const other = entities.get(tab.slice('related:'.length));
            if (!other) {
              add(at, `unknown entity "${tab.slice('related:'.length)}"`);
            } else if (!other.fields.some((f) => f.kind === 'relation' && f.to === entity.name)) {
              add(at, `"${other.name}" has no relation field to "${entity.name}"`);
            }
          }
        });
        break;
      case 'board':
        if (fields.get(screen.groupBy)?.kind !== 'enum') {
          add(
            [...path, 'groupBy'],
            `groupBy "${screen.groupBy}" must be an enum field of "${entity.name}"`
          );
        }
        screen.cardFields?.forEach((name, j) => {
          expectField(entity, name, null, [...path, 'cardFields', j], 'card field');
        });
        if (screen.sumField !== undefined) {
          expectField(entity, screen.sumField, SUM_KINDS, [...path, 'sumField'], 'sumField');
        }
        break;
      case 'calendar':
        expectField(entity, screen.dateField, DATE_KINDS, [...path, 'dateField'], 'dateField');
        if (screen.endField !== undefined) {
          expectField(entity, screen.endField, DATE_KINDS, [...path, 'endField'], 'endField');
          if (screen.endField === screen.dateField) {
            add([...path, 'endField'], 'endField must differ from dateField');
          }
        }
        if (screen.colorBy !== undefined) {
          expectField(entity, screen.colorBy, enumOnly, [...path, 'colorBy'], 'colorBy');
        }
        break;
      case 'timeline':
        expectField(entity, screen.startField, DATE_KINDS, [...path, 'startField'], 'startField');
        expectField(entity, screen.endField, DATE_KINDS, [...path, 'endField'], 'endField');
        if (screen.endField === screen.startField) {
          add([...path, 'endField'], 'endField must differ from startField');
        }
        if (screen.groupBy !== undefined) {
          expectField(
            entity,
            screen.groupBy,
            new Set<FieldKind>(['enum', 'relation', 'persona']),
            [...path, 'groupBy'],
            'groupBy'
          );
        }
        break;
      case 'map':
        expectField(entity, screen.geoField, GEO_KINDS, [...path, 'geoField'], 'geoField');
        if (screen.colorBy !== undefined) {
          expectField(entity, screen.colorBy, enumOnly, [...path, 'colorBy'], 'colorBy');
        }
        break;
      case 'analytics':
        expectField(
          entity,
          screen.dateField,
          DATE_KINDS,
          [...path, 'dateField'],
          'dateField',
          true
        );
        screen.measures.forEach((measure, j) => {
          checkMeasure(entity, measure, [...path, 'measures', j]);
        });
        screen.dimensions.forEach((name, j) => {
          expectField(entity, name, GROUP_KINDS, [...path, 'dimensions', j], 'dimension');
        });
        break;
      case 'form':
        break;
    }
  });

  blueprint.archetype?.screens.forEach((screen, i) => {
    const path = ['archetype', 'screens', i, 'path'];
    if ((RESERVED_SCREEN_PATHS as readonly string[]).includes(screen.path)) {
      add(path, `path "${screen.path}" is reserved by the generated app`);
    }
    const first = seen.get(screen.path);
    if (first !== undefined) {
      add(path, `path "${screen.path}" is already used by screens.${first}`);
    } else {
      seen.set(screen.path, blueprint.screens.length + i);
    }
  });
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
