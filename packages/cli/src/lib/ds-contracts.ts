import { z } from 'zod';

/**
 * The data contracts of a design-system folder (PLAN_013, ADR-047): every
 * file Protoyard writes next to a Texuli design-system document, in one
 * module. The readers (`design-systems.ts`, `ds-components.ts`) and the JSON
 * Schema files under `ds-schemas/` both come from these zod schemas.
 *
 * The allow set, the library entries and the approval live inside the Texuli
 * document now (spec 0.13.0; Texuli's `design-system.schema.json` describes
 * them). The `approval.json` sidecar is `legacy`: still read when a document
 * has no approval, never written, and folded into the document by
 * `protoyard ds migrate <id>`.
 *
 * Contracts marked `planned` describe files no command writes yet; they may
 * still change before the task that writes them lands.
 */

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const COMPONENT_NAME = /^[A-Z][A-Za-z0-9]{0,63}$/;
const DESIGN_SYSTEM_ID = /^[a-z][a-z0-9-]{0,63}$/;
const SHA256 = /^[0-9a-f]{64}$/;
/**
 * One line of human text: no C0 control characters, DEL, or line and
 * paragraph separators (the same set as `hasControlCharacter`). A pattern,
 * not a refinement, so the JSON Schema carries the rule too.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: the pattern exists to refuse them.
const ONE_LINE = /^[^\u0000-\u001f\u007f\u2028\u2029]*$/;

export const MAX_PURPOSE = 280;
export const MAX_WHY = 1000;
export const MAX_PERSON = 120;

const lineText = (max: number) =>
  z.string().min(1).max(max).regex(ONE_LINE, 'Use one line without control characters.');

/**
 * Legacy `design-systems/<id>/approval.json`: a record of who approved which
 * version, not a proof. The approval now lives in the document (`approval`).
 */
export const ApprovalSchema = z
  .object({
    status: z.enum(['draft', 'approved']),
    version: z.string().regex(SEMVER),
    approvedBy: z.string().min(1).max(MAX_PERSON).optional(),
    approvedAt: z.iso.datetime().optional(),
    contentHash: z.string().regex(SHA256).optional(),
  })
  .strict();
export type Approval = z.infer<typeof ApprovalSchema>;

/** One entry of `components.json`. */
export const LibraryComponentSchema = z
  .object({
    name: z.string().regex(COMPONENT_NAME),
    purpose: z.string().min(1).max(MAX_PURPOSE),
    version: z.string().regex(SEMVER),
    status: z.enum(['draft', 'approved']),
    /** `components/<Name>.svelte`, relative to the design-system folder. */
    file: z.string().regex(/^components\/[A-Z][A-Za-z0-9]{0,63}\.svelte$/),
    sha256: z.string().regex(SHA256),
    approvedBy: z.string().min(1).max(MAX_PERSON).optional(),
    approvedAt: z.iso.datetime().optional(),
  })
  .strict();
export type LibraryComponent = z.infer<typeof LibraryComponentSchema>;

/** `design-systems/<id>/components.json`: the design system's own components. */
export const ComponentsManifestSchema = z
  .object({
    format: z.literal('protoyard/ds-components'),
    version: z.literal(1),
    components: z.array(LibraryComponentSchema).max(500),
  })
  .strict();
export type ComponentsManifest = z.infer<typeof ComponentsManifestSchema>;

/** `design-systems/<id>/requests/<Name>.json`: who asked for which component, and why. */
export const ComponentRequestSchema = z
  .object({
    format: z.literal('protoyard/ds-component-request'),
    version: z.literal(1),
    name: z.string().regex(COMPONENT_NAME),
    purpose: lineText(MAX_PURPOSE),
    /** Why the existing components do not fit. */
    why: lineText(MAX_WHY),
    requestedBy: lineText(MAX_PERSON).optional(),
    requestedAt: z.iso.datetime(),
    status: z.enum(['open', 'approved']),
    approvedBy: lineText(MAX_PERSON).optional(),
    approvedAt: z.iso.datetime().optional(),
  })
  .strict();
export type ComponentRequest = z.infer<typeof ComponentRequestSchema>;

/** Schemes a story prop never carries: they run script or read local data in the kit page. */
const UNSAFE_SCHEME = /^(?:javascript|vbscript|data|file|blob):/i;

/**
 * The path of the first string in a story's props that is a script-capable
 * URL (checked as browsers read it: control characters and whitespace
 * removed), or null. Bounded: deeper than 8 levels or over 2,000 values is
 * refused too.
 */
export function unsafeStoryValue(props: unknown): (string | number)[] | null {
  let budget = 2000;
  const walk = (
    value: unknown,
    path: (string | number)[],
    depth: number
  ): (string | number)[] | null => {
    // Fails closed: what is too deep or too large to check is refused.
    if (--budget < 0 || depth > 8) return path;
    if (typeof value === 'string') {
      // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point.
      return UNSAFE_SCHEME.test(value.replace(/[\u0000-\u0020\u007f-\u009f]/g, '')) ? path : null;
    }
    if (Array.isArray(value)) {
      for (const [index, item] of value.entries()) {
        const found = walk(item, [...path, index], depth + 1);
        if (found) return found;
      }
      return null;
    }
    if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        const found = walk(item, [...path, key], depth + 1);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(props, [], 0);
}

/** `design-systems/<id>/stories/<Name>.json`: the kit's story for one component. */
export const ComponentStorySchema = z
  .object({
    format: z.literal('protoyard/ds-story'),
    version: z.literal(1),
    component: z.string().regex(COMPONENT_NAME),
    variants: z
      .array(
        z
          .object({
            name: z.string().min(1).max(80),
            props: z.record(z.string(), z.unknown()).superRefine((props, ctx) => {
              const unsafe = unsafeStoryValue(props);
              if (unsafe !== null) {
                ctx.addIssue({
                  code: 'custom',
                  path: unsafe,
                  message:
                    'A story prop may not hold a javascript:, vbscript:, data:, file: or blob: URL, nor nest deeper than 8 levels.',
                });
              }
            }),
          })
          .strict()
      )
      .min(1)
      .max(50)
      // The kit shows one figure per variant: two with one name would be ambiguous.
      .superRefine((variants, ctx) => {
        const seen = new Set<string>();
        for (const [index, variant] of variants.entries()) {
          if (seen.has(variant.name)) {
            ctx.addIssue({
              code: 'custom',
              path: [index, 'name'],
              message: `Two variants are named "${variant.name}"; variant names must be unique.`,
            });
          }
          seen.add(variant.name);
        }
      }),
  })
  .strict();
export type ComponentStory = z.infer<typeof ComponentStorySchema>;

/** Characters of a release's changelog entry (Texuli's bundle history cap). */
export const MAX_CHANGELOG = 4000;

/**
 * `design-systems/<id>/releases/<version>.json`: an immutable record of one
 * approved version (`ds approve --release`, `ds release`). It keeps the
 * whole document as approved, so `ds diff`, `ds versions` and the kit can
 * compare versions after the document moved on; `contentHash` is Texuli's
 * `designSystemContentHash` of that document. The components are the
 * `components.json` entries (name, version, source hash) it shipped with.
 * Never rewritten: a new version is a new file.
 */
export const ReleaseRecordSchema = z
  .object({
    format: z.literal('protoyard/ds-release'),
    version: z.literal(1),
    designSystem: z.string().regex(DESIGN_SYSTEM_ID),
    release: z.string().regex(SEMVER),
    contentHash: z.string().regex(SHA256),
    approvedBy: lineText(MAX_PERSON),
    approvedAt: z.iso.datetime(),
    /** What changed in this version: the approver's text, or a summary the CLI wrote. */
    changelog: z.string().min(1).max(MAX_CHANGELOG),
    components: z
      .array(
        z
          .object({
            name: z.string().regex(COMPONENT_NAME),
            version: z.string().regex(SEMVER),
            sha256: z.string().regex(SHA256),
          })
          .strict()
      )
      .max(500),
    /** The Texuli design-system document as approved (approval included). */
    document: z.record(z.string(), z.unknown()),
  })
  .strict();
export type ReleaseRecord = z.infer<typeof ReleaseRecordSchema>;

/** The most files one bundle carries, and the bytes of one file (the document cap). */
export const MAX_BUNDLE_FILES = 400;
export const MAX_BUNDLE_FILE_BYTES = 1_048_576;

/**
 * A portable design-system bundle (`protoyard ds export <id> --bundle`,
 * imported with `protoyard ds import <file>`): one JSON file that carries a
 * design-system folder.
 *
 * - `texuli` is Texuli's own bundle (`texuli/design-system-bundle`, version 1,
 *   from `packBundle` in `@texuli/spec/design-system`): the document, the
 *   library component sources as text with their hashes, the allow manifest
 *   and the release history. Texuli's bundle has a closed schema, so
 *   Protoyard's files ride beside it, not inside it. `validateBundle` checks it.
 * - `files` lists every file of the folder with its SHA-256 and size. A file
 *   carries its UTF-8 `text`, or names where its bytes already are in the
 *   Texuli part: `from: "document"` (the document as the CLI writes it) or
 *   `from: "library:<id>"` (a component source). Exactly one of the two.
 *
 * Untrusted input on import: nothing in it is executed or rendered.
 */
export const BundleFileSchema = z
  .object({
    path: z
      .string()
      .min(1)
      .max(255)
      .regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/),
    sha256: z.string().regex(SHA256),
    bytes: z.number().int().min(0).max(MAX_BUNDLE_FILE_BYTES),
    text: z.string().max(MAX_BUNDLE_FILE_BYTES).optional(),
    from: z
      .string()
      .regex(/^(?:document|library:[a-z][a-z0-9-]{0,63})$/)
      .optional(),
  })
  .strict()
  .refine((file) => (file.text === undefined) !== (file.from === undefined), {
    message: 'A file carries either text or from, not both and not neither.',
  });
export type BundleFile = z.infer<typeof BundleFileSchema>;

export const BundleManifestSchema = z
  .object({
    format: z.literal('protoyard/ds-bundle'),
    version: z.literal(1),
    designSystem: z.string().regex(DESIGN_SYSTEM_ID),
    release: z.string().regex(SEMVER),
    contentHash: z.string().regex(SHA256),
    /** Texuli's bundle (`texuli/design-system-bundle`), checked by Texuli's `validateBundle`. */
    texuli: z.record(z.string(), z.unknown()),
    files: z.array(BundleFileSchema).min(1).max(MAX_BUNDLE_FILES),
  })
  .strict();
export type BundleManifest = z.infer<typeof BundleManifestSchema>;

export type ContractStatus = 'current' | 'planned' | 'legacy';

export interface DesignSystemContract {
  /** Stable name; also the JSON Schema file stem (`<name>.schema.json`). */
  name: string;
  /** JSON Schema `$id`: a URN, so nothing implies a hosted URL. */
  id: string;
  /** Where the file lives, relative to the workspace. */
  path: string;
  title: string;
  status: ContractStatus;
  schema: z.ZodType;
}

export const DESIGN_SYSTEM_CONTRACTS: readonly DesignSystemContract[] = [
  {
    name: 'approval',
    id: 'urn:protoyard:design-system:approval:1',
    path: 'design-systems/<id>/approval.json',
    title: 'Design-system approval record (legacy sidecar)',
    status: 'legacy',
    schema: ApprovalSchema,
  },
  {
    name: 'components',
    id: 'urn:protoyard:design-system:components:1',
    path: 'design-systems/<id>/components.json',
    title: 'Design-system component library (protoyard/ds-components)',
    status: 'current',
    schema: ComponentsManifestSchema,
  },
  {
    name: 'component-request',
    id: 'urn:protoyard:design-system:component-request:1',
    path: 'design-systems/<id>/requests/<Name>.json',
    title: 'Design-system component request (protoyard/ds-component-request)',
    status: 'current',
    schema: ComponentRequestSchema,
  },
  {
    name: 'story',
    id: 'urn:protoyard:design-system:story:1',
    path: 'design-systems/<id>/stories/<Name>.json',
    title: 'Design-system component story (protoyard/ds-story)',
    status: 'current',
    schema: ComponentStorySchema,
  },
  {
    name: 'release',
    id: 'urn:protoyard:design-system:release:1',
    path: 'design-systems/<id>/releases/<version>.json',
    title: 'Design-system release record (protoyard/ds-release)',
    status: 'current',
    schema: ReleaseRecordSchema,
  },
  {
    name: 'bundle',
    id: 'urn:protoyard:design-system:bundle:1',
    path: '<id>-<version>.ds-bundle.json (protoyard ds export <id> --bundle)',
    title: 'Portable design-system bundle (protoyard/ds-bundle)',
    status: 'current',
    schema: BundleManifestSchema,
  },
];

const STATUS_NOTE: Record<ContractStatus, string> = {
  current: '',
  planned: ' (planned: no command writes this file yet; the contract may change before it lands)',
  legacy:
    ' (legacy: read when document.json has no approval section, never written; `protoyard ds migrate <id>` moves it into the document)',
};

/**
 * The JSON Schema (draft 2020-12) of one contract, generated from its zod
 * schema. The files in `ds-schemas/` are this output; a test fails when they
 * drift.
 */
export function contractJsonSchema(contract: DesignSystemContract): Record<string, unknown> {
  const { $schema: _schema, ...body } = z.toJSONSchema(contract.schema, {
    target: 'draft-2020-12',
    io: 'input',
  }) as Record<string, unknown>;
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: contract.id,
    title: contract.title,
    description: `${contract.path}${STATUS_NOTE[contract.status]}. Generated from packages/cli/src/lib/ds-contracts.ts.`,
    ...body,
  };
}
