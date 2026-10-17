import { z } from 'zod';
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
    preview: z
      .object({
        viewport: ViewportPresetSchema.default('desktop'),
      })
      .default({ viewport: 'desktop' }),
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
