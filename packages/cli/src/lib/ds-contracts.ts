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
            props: z.record(z.string(), z.unknown()),
          })
          .strict()
      )
      .min(1)
      .max(50),
  })
  .strict();
export type ComponentStory = z.infer<typeof ComponentStorySchema>;

/**
 * Planned (versions task): `design-systems/<id>/releases/<version>.json`, an
 * immutable record of one approved version and the component hashes it
 * shipped with. No command writes it yet.
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
    notes: z.string().max(4000).optional(),
  })
  .strict();
export type ReleaseRecord = z.infer<typeof ReleaseRecordSchema>;

/**
 * Planned (bundle task): `bundle.json` at the root of an exported
 * design-system bundle, listing every file with its hash so a consumer can
 * verify the bundle before it imports it. No command writes it yet.
 */
export const BundleManifestSchema = z
  .object({
    format: z.literal('protoyard/ds-bundle'),
    version: z.literal(1),
    designSystem: z.string().regex(DESIGN_SYSTEM_ID),
    release: z.string().regex(SEMVER),
    contentHash: z.string().regex(SHA256),
    files: z
      .array(
        z
          .object({
            path: z
              .string()
              .min(1)
              .max(255)
              .regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/),
            sha256: z.string().regex(SHA256),
            bytes: z.number().int().min(0).max(1_048_576),
          })
          .strict()
      )
      .min(1)
      .max(1000),
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
    title: 'Design-system release record (protoyard/ds-release), planned',
    status: 'planned',
    schema: ReleaseRecordSchema,
  },
  {
    name: 'bundle',
    id: 'urn:protoyard:design-system:bundle:1',
    path: 'bundle.json (in an exported design-system bundle)',
    title: 'Design-system bundle manifest (protoyard/ds-bundle), planned',
    status: 'planned',
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
