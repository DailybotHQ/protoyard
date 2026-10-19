import { z } from 'zod';
import { DeviceIdSchema, OrientationSchema } from './devices.ts';
import { LayoutSettingsSchema } from './layouts.ts';
import { SLUG_MAX_LENGTH, SLUG_PATTERN } from './slug.ts';

/**
 * `protoyard.json` — the static, data-only manifest every prototype and
 * template carries at its root. The CLI indexes it WITHOUT executing any
 * prototype code (see docs/DECISIONS.md, ADR-003), and the runtime imports the
 * very same file, so metadata has exactly one source of truth.
 */

export const MANIFEST_FILENAME = 'protoyard.json';
export const MANIFEST_SCHEMA_URL = 'https://github.com/DailybotHQ/protoyard/schema/manifest/v1';

export const RendererSchema = z.enum(['svelte-vite']);
export type Renderer = z.infer<typeof RendererSchema>;

export const PlatformSchema = z.enum(['desktop', 'mobile', 'responsive']);
export type Platform = z.infer<typeof PlatformSchema>;

export const ColorModeSchema = z.enum(['light', 'dark', 'system']);
export type ColorMode = z.infer<typeof ColorModeSchema>;

export const ViewportPresetSchema = z.enum(['desktop', 'tablet', 'iphone', 'android', 'custom']);
export type ViewportPreset = z.infer<typeof ViewportPresetSchema>;

/**
 * How a prototype is presented (ADR-016). `auto` resolves from the platform
 * (`mobile` → `phone`, anything else → `none`); `none` renders full-bleed.
 */
export const ShellSchema = z.enum([
  'auto',
  'none',
  'phone',
  'tablet',
  'desktop-window',
  'browser',
  'widget-host',
  'extension-popup',
  'side-panel',
]);
export type Shell = z.infer<typeof ShellSchema>;
/** A shell after `auto` has been resolved. */
export type ResolvedShell = Exclude<Shell, 'auto'>;

/** `auto` → `phone` for mobile prototypes, `none` otherwise; concrete shells pass through. */
export function resolveShell(shell: Shell, platform: Platform): ResolvedShell {
  if (shell !== 'auto') return shell;
  return platform === 'mobile' ? 'phone' : 'none';
}

const ORIGIN_LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
/**
 * Only reserved, fictional origins: `https://<label>.example` (any depth) or
 * `https://example.com` and its subdomains. No port, path, query or userinfo,
 * so a shell can never display a real domain.
 */
export const FICTIONAL_ORIGIN_PATTERN = new RegExp(
  `^https://(?:(?:${ORIGIN_LABEL}\\.)+example|(?:${ORIGIN_LABEL}\\.)*example\\.com)$`
);
export const FictionalOriginSchema = z.string().max(253).regex(FICTIONAL_ORIGIN_PATTERN, {
  message: 'origin must be https://<name>.example or https://<sub>.example.com',
});

/** Host apps the side-panel shell can draw (generic, unbranded mocks). */
export const ShellHostVariantSchema = z.enum(['chat-workspace', 'design-canvas', 'code-editor']);
export type ShellHostVariant = z.infer<typeof ShellHostVariantSchema>;

/** Per-shell presentation details. Every field is optional. */
export const ShellChromeSchema = z
  .object({
    /** Window-control layout for desktop-window frames (absent: follow the visitor's OS). */
    os: z.enum(['mac', 'windows']).optional(),
    /** Address shown by browser-like shells (default `https://<slug>.example`). */
    origin: FictionalOriginSchema.optional(),
    /** Fictional brand of the widget-host page. */
    hostName: z.string().min(1).max(60).optional(),
    /** Host app drawn around a side panel. */
    hostVariant: ShellHostVariantSchema.optional(),
  })
  .strict();
export type ShellChrome = z.infer<typeof ShellChromeSchema>;

export const PreviewSchema = z.object({
  viewport: ViewportPresetSchema.default('desktop'),
  shell: ShellSchema.default('auto'),
  /** Device catalog id (`@protoyard/core` DEVICES); absent: the shell's default. */
  device: DeviceIdSchema.optional(),
  orientation: OrientationSchema.optional(),
  chrome: ShellChromeSchema.optional(),
  /** App layout (ADR-023); absent: `custom`, the prototype renders its own. */
  layout: LayoutSettingsSchema.optional(),
});
export type PreviewSettings = z.infer<typeof PreviewSchema>;

/**
 * Marketplace categories: one shared list, so the gallery never shows two
 * spellings of the same shelf. Add a value here instead of free-form text.
 */
export const CATALOG_CATEGORIES = [
  'starter',
  'productivity',
  'communication',
  'sales',
  'marketing',
  'support',
  'finance',
  'commerce',
  'marketplace',
  'ai',
  'analytics',
  'developer-tools',
  'design',
  'education',
  'health',
  'hr',
  'operations',
  'media',
  'social',
  'travel',
  'real-estate',
  'internal-tools',
] as const;
export const CatalogCategorySchema = z.enum(CATALOG_CATEGORIES);
export type CatalogCategory = z.infer<typeof CatalogCategorySchema>;

/** Where the product runs (a marketplace filter; distinct from the layout `platform`). */
export const CatalogPlatformSchema = z.enum([
  'web',
  'mobile',
  'tablet',
  'desktop',
  'widget',
  'extension',
  'plugin',
]);
export type CatalogPlatform = z.infer<typeof CatalogPlatformSchema>;

export const CatalogDifficultySchema = z.enum(['beginner', 'intermediate', 'advanced']);
export type CatalogDifficulty = z.infer<typeof CatalogDifficultySchema>;

const unique = <T>(items: readonly T[]) => new Set(items).size === items.length;

/**
 * Optional marketplace metadata. Data only, like the rest of the manifest:
 * the registry indexes it without running prototype code.
 */
export const CatalogSchema = z
  .object({
    category: CatalogCategorySchema,
    /** Short product noun shown on cards, e.g. "CRM" or "Helpdesk". */
    productType: z.string().trim().min(1).max(40).optional(),
    platforms: z
      .array(CatalogPlatformSchema)
      .max(7)
      .refine(unique, { message: 'platforms must not repeat' })
      .default([]),
    /** Shell the marketplace card frames the demo in (default: `preview.shell`). */
    shell: ShellSchema.optional(),
    /** Kebab-case feature keys used as filters, e.g. `auth`, `billing`, `offline`. */
    features: z
      .array(
        z
          .string()
          .max(40)
          .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, { message: 'feature must be kebab-case' })
      )
      .max(24)
      .refine(unique, { message: 'features must not repeat' })
      .default([]),
    /** One-line selling points for the detail page. */
    highlights: z.array(z.string().trim().min(1).max(120)).max(6).default([]),
    difficulty: CatalogDifficultySchema.optional(),
  })
  .strict();
export type Catalog = z.infer<typeof CatalogSchema>;

export const ProjectKindSchema = z.enum(['prototype', 'template']);
export type ProjectKind = z.infer<typeof ProjectKindSchema>;

export const ProjectStatusSchema = z.enum(['draft', 'active', 'ready', 'archived']);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

/** Stable reverse-DNS-ish id, e.g. `example.crm` or `acme.mobile-banking`. */
export const PrototypeIdSchema = z
  .string()
  .min(3)
  .max(96)
  .regex(/^[a-z][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+$/, {
    message: 'id must be dotted lowercase segments, e.g. "example.crm"',
  });

export const SlugSchema = z
  .string()
  .min(2)
  .max(SLUG_MAX_LENGTH)
  .regex(SLUG_PATTERN, { message: 'slug must be lowercase kebab-case' });

/** Storage namespace: becomes part of IndexedDB database names. */
export const NamespaceSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z][a-z0-9-]*$/, { message: 'namespace must be lowercase kebab-case' });

export const PrototypeManifestSchema = z
  .object({
    $schema: z.string().optional(),
    id: PrototypeIdSchema,
    slug: SlugSchema,
    kind: ProjectKindSchema.default('prototype'),
    name: z.string().min(1).max(80),
    description: z.string().max(280).default(''),
    version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, {
      message: 'version must be semver, e.g. "0.1.0"',
    }),
    renderer: RendererSchema.default('svelte-vite'),
    platform: PlatformSchema.default('responsive'),
    category: z.string().min(1).max(40).default('general'),
    tags: z.array(z.string().min(1).max(32)).max(16).default([]),
    /** Template this prototype was created from (informational). */
    template: z.string().optional(),
    status: ProjectStatusSchema.default('active'),
    /** Emoji or short glyph used by the gallery when no thumbnail exists. */
    icon: z.string().max(8).optional(),
    /** Path relative to the prototype folder, e.g. `public/thumbnail.png`. */
    thumbnail: z.string().optional(),
    defaultScenario: z.string().min(1).optional(),
    defaultTheme: z.string().min(1).default('violet'),
    defaultMode: ColorModeSchema.default('system'),
    preview: PreviewSchema.default({ viewport: 'desktop', shell: 'auto' }),
    storage: z.object({
      namespace: NamespaceSchema,
      schemaVersion: z.number().int().positive(),
    }),
    build: z
      .object({
        /** Include the floating DevTools panel in standalone builds. */
        includeDevtools: z.boolean().default(false),
        /** Show a small "Prototype" badge in standalone builds. */
        demoBadge: z.boolean().default(true),
        /** Public base path. `./` produces relocatable output. */
        base: z.string().default('./'),
        /**
         * Opt-in offline support for exported builds (a service worker that
         * caches the app shell; data is already local in IndexedDB).
         */
        offline: z.boolean().default(false),
      })
      .default({ includeDevtools: false, demoBadge: true, base: './', offline: false }),
    /** Marketplace metadata (optional; indexed by the registry). */
    catalog: CatalogSchema.optional(),
    /** Scenario ids declared by the prototype (indexed for the gallery). */
    scenarios: z.array(z.string()).default([]),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .strict();

export type PrototypeManifest = z.infer<typeof PrototypeManifestSchema>;
export type PrototypeManifestInput = z.input<typeof PrototypeManifestSchema>;

export function parseManifest(input: unknown): PrototypeManifest {
  return PrototypeManifestSchema.parse(input);
}

export function safeParseManifest(input: unknown) {
  return PrototypeManifestSchema.safeParse(input);
}
