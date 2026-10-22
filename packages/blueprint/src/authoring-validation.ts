import { safeParseAnyBlueprint } from './kinds/envelope.ts';
import {
  BLUEPRINT_KINDS,
  type BlueprintKind,
  type ContentKind,
  detectBlueprintKind,
  isContentKind,
} from './kinds/kind.ts';
import { BLUEPRINT_BASE_SHAPE } from './schema.ts';

/** A JSON path segment in a blueprint validation diagnostic. */
export type BlueprintDiagnosticPath = string | number;

/** One stable, actionable blueprint validation diagnostic. */
export type BlueprintAuthoringDiagnostic = {
  /** Stable machine-readable category, independent of the Zod error wording. */
  code: string;
  /** Original JSON path segments. */
  path: BlueprintDiagnosticPath[];
  /** JSONPath-style rendering of `path`, with keys quoted for unambiguous use. */
  jsonPath: string;
  /** Concise schema or cross-reference explanation. */
  message: string;
  /** A next step an author can take to resolve this diagnostic. */
  hint: string;
};

/** Full blueprint validity and diagnostics. `valid` uses the complete Zod schema. */
export type BlueprintAuthoringValidation = {
  valid: boolean;
  /**
   * The kind the input was validated as: `app` when `kind` is missing (the
   * legacy compatibility rule), `null` when `kind` itself is unusable.
   */
  kind: BlueprintKind | null;
  diagnostics: BlueprintAuthoringDiagnostic[];
};

/**
 * Validate untrusted author input of any kind and return path-addressed repair
 * guidance. Each kind runs through the shared kind union
 * (`safeParseAnyBlueprint`): an app (with no `kind`, or `kind: "app"`) through
 * the full app schema, including cross-reference checks, and a deck, page or
 * doc through its strict envelope and body schema. A JSON Schema shape check
 * alone is not enough to establish `valid`.
 *
 * Diagnostics never fetch network assets and never render markdown as HTML.
 * Block and media failures map to stable codes (unknown block type, chart
 * specs, alt text, URL schemes, step/fragment targets) with the original path.
 */
export async function validateBlueprintForAuthoring(
  input: unknown
): Promise<BlueprintAuthoringValidation> {
  const detected = detectBlueprintKind(input);
  if (!detected.ok) {
    return {
      valid: false,
      kind: null,
      diagnostics: [kindDiagnostic(input, detected.message, detected.fix)],
    };
  }
  const kind = detected.kind;
  const result = await safeParseAnyBlueprint(input);
  if (result.success) return { valid: true, kind, diagnostics: [] };

  return {
    valid: false,
    kind,
    diagnostics: result.error.issues.map((issue) =>
      issueToDiagnostic(issue, isContentKind(kind) ? kind : null)
    ),
  };
}

/**
 * Map path-addressed block issues (from `@protoyard/blocks` `safeParseBlock` /
 * `safeParseBlocks` / `parseUntrustedBlocks`) into authoring diagnostics.
 * `pathPrefix` is prepended (for example `["deck","slides",0,"blocks"]`) so
 * the JSON path stays relative to the blueprint root. Does not mutate or
 * auto-repair the input.
 */
export function diagnosticsFromBlockIssues(
  issues: readonly { path: readonly (string | number)[]; message: string }[],
  pathPrefix: readonly BlueprintDiagnosticPath[] = []
): BlueprintAuthoringDiagnostic[] {
  return issues.map((issue) => {
    const path = [...pathPrefix, ...issue.path] as BlueprintDiagnosticPath[];
    const code = diagnosticCode('custom', issue.message, path);
    return {
      code,
      path,
      jsonPath: toJsonPath(path),
      message: issue.message,
      hint: blockOrAssetHint(code, issue.message),
    };
  });
}

/** Turn one Zod issue into a stable authoring diagnostic. */
export function issueToDiagnostic(
  issue: {
    code: string;
    message: string;
    path: readonly PropertyKey[];
    keys?: readonly PropertyKey[];
  },
  contentKind: ContentKind | null = null
): BlueprintAuthoringDiagnostic {
  const path = [...issue.path] as BlueprintDiagnosticPath[];
  const message = issue.message;
  if (contentKind && issue.code === 'custom' && path.length === 1 && path[0] === 'kind') {
    return {
      code: 'kind-unavailable',
      path,
      jsonPath: toJsonPath(path),
      message,
      hint: `Update Protoyard to a build that ships the ${contentKind} engine, or author an app blueprint instead.`,
    };
  }
  const code = diagnosticCode(issue.code, message, path);
  return {
    code,
    path,
    jsonPath: toJsonPath(path),
    message,
    hint: contentKind
      ? contentHint(contentKind, code, issue, path, message)
      : blockOrAssetHint(code, message),
  };
}

/** `kind` is not a string, or names a kind this version does not know. */
function kindDiagnostic(
  input: unknown,
  message: string,
  fix: string
): BlueprintAuthoringDiagnostic {
  const kind = (input as { kind?: unknown }).kind;
  return {
    code: typeof kind === 'string' ? 'unknown-kind' : 'invalid-kind',
    path: ['kind'],
    jsonPath: toJsonPath(['kind']),
    message,
    hint: fix,
  };
}

const SHARED_KEYS = Object.keys(BLUEPRINT_BASE_SHAPE);

function contentHint(
  kind: ContentKind,
  code: string,
  issue: { code: string; keys?: readonly PropertyKey[] },
  path: readonly BlueprintDiagnosticPath[],
  message: string
): string {
  if (code === 'unknown-key' && path.length === 0) {
    const others = (issue.keys ?? []).filter((key) =>
      (BLUEPRINT_KINDS as readonly PropertyKey[]).includes(key)
    );
    if (others.length) {
      return `A ${kind} blueprint has exactly one body, "${kind}". Remove ${others.map((key) => `"${String(key)}"`).join(', ')}, or change "kind" to match it.`;
    }
    return `A ${kind} blueprint accepts only ${[...SHARED_KEYS, 'kind', kind].join(', ')}. App keys such as entities, roles and screens belong to app blueprints: remove them, or drop "kind" to author an app.`;
  }
  if (code === 'invalid-type' && path.length === 1 && path[0] === kind) {
    return `Add the "${kind}" body: an object with the ${kind}'s content.`;
  }
  return blockOrAssetHint(code, message);
}

export function toJsonPath(path: readonly BlueprintDiagnosticPath[]): string {
  let result = '$';
  for (const segment of path) {
    result += typeof segment === 'number' ? `[${segment}]` : `[${JSON.stringify(segment)}]`;
  }
  return result;
}

/**
 * Stable codes for authoring tools. Block/media messages are matched before
 * generic Zod codes so chart, alt and scheme failures stay specific.
 */
export function diagnosticCode(
  zodCode: string,
  message: string,
  path: readonly BlueprintDiagnosticPath[] = []
): string {
  const lower = message.toLowerCase();
  const last = path.length > 0 ? path[path.length - 1] : undefined;

  if (
    lower.includes('invalid discriminator') ||
    (last === 'type' &&
      (lower.includes('expected') ||
        lower.includes('invalid option') ||
        lower.includes('invalid input')))
  ) {
    return 'unknown-block-type';
  }
  if (
    lower.includes('describe the image in alt') ||
    lower.includes('mark it decorative') ||
    (last === 'alt' && lower.includes('alt'))
  ) {
    return 'missing-alt-text';
  }
  if (lower.includes('decorative image has no alt')) {
    return 'invalid-alt-text';
  }
  if (
    lower.includes('http(s), mailto') ||
    lower.includes('no svg or remote') ||
    lower.includes('no remote urls') ||
    lower.includes('relative image path') ||
    lower.includes('relative video path') ||
    lower.includes('use avatar:av-') ||
    lower.includes('base64 data uri') ||
    lower.includes('javascript:') ||
    lower.includes('protocol-relative')
  ) {
    return 'unsupported-url-scheme';
  }
  if (
    lower.includes('needs one value per label') ||
    lower.includes('chart takes exactly one series') ||
    lower.includes('chart needs non-negative') ||
    lower.includes('chart data is not valid json') ||
    lower.includes('chart data is too large') ||
    lower.includes('invalid chart') ||
    (path.includes('spec') &&
      (lower.includes('series') || lower.includes('label') || lower.includes('kind')))
  ) {
    return 'invalid-chart-spec';
  }
  if (lower.includes('duplicate block id') || lower.includes('first used at')) {
    return 'duplicate-block-id';
  }
  if (
    lower.includes('no such step') ||
    lower.includes('unknown step') ||
    lower.includes('invalid step') ||
    lower.includes('fragment target') ||
    lower.includes('unknown fragment') ||
    lower.includes('unknown block id') ||
    lower.includes('no such block') ||
    (lower.includes('fragment') && lower.includes('target')) ||
    (last === 'step' &&
      (lower.includes('integer') || lower.includes('max') || lower.includes('min')))
  ) {
    return 'invalid-step-or-fragment-target';
  }

  if (message.startsWith('unknown entity') || message.includes('unknown entity "')) {
    return 'unknown-entity';
  }
  if (
    message.startsWith('unknown field') ||
    message.includes('unknown field "') ||
    message.includes('is not a field of')
  ) {
    return 'unknown-field';
  }
  if (message.includes('must be one of') || message.includes('not one of')) {
    return 'invalid-reference';
  }
  if (message.startsWith('duplicate ') || message.includes('duplicate ')) {
    return 'duplicate-value';
  }
  if (message.includes('needs an ownerField')) return 'missing-owner-field';
  if (message.includes('cannot be') || message.includes('must be ')) return 'invalid-field-kind';
  if (zodCode === 'unrecognized_keys') return 'unknown-key';
  if (zodCode === 'invalid_type') return 'invalid-type';
  if (zodCode === 'too_small') return 'value-too-small';
  if (zodCode === 'too_big') return 'value-too-large';
  if (zodCode === 'invalid_value') return 'invalid-value';
  if (zodCode === 'invalid_format') return 'invalid-format';
  if (zodCode === 'custom') return 'invalid-reference';
  return 'invalid-value';
}

/** Hints for block, media and generic blueprint failures. Never auto-repairs. */
export function blockOrAssetHint(code: string, message: string): string {
  if (code === 'unknown-block-type') {
    return 'Set "type" to a supported block type (heading, text, image, chart, …). Custom or script types are not allowed.';
  }
  if (code === 'missing-alt-text') {
    return 'Add a short alt description of the image, or set decorative: true when the image is purely decorative.';
  }
  if (code === 'invalid-alt-text') {
    return 'Remove alt when decorative is true, or drop decorative and keep a meaningful alt.';
  }
  if (code === 'unsupported-url-scheme') {
    return 'Use only allowed sources: avatar:av-001…175, a bounded data: URI, a relative asset path, or http(s)/mailto/#anchor links. Remote media and javascript: URLs are refused; nothing is fetched during validation.';
  }
  if (code === 'invalid-chart-spec') {
    return 'Fix the chart spec: every series needs one value per label; part-whole charts need one series of non-negative numbers; keep kind, title and labels within the schema bounds.';
  }
  if (code === 'duplicate-block-id') {
    return 'Give each block a unique id within the document (deep links and interactive state key on id).';
  }
  if (code === 'invalid-step-or-fragment-target') {
    return 'Point the step or fragment at an existing block id or a step index in range (0–32). Do not invent targets.';
  }
  return diagnosticHint(code, message);
}

function diagnosticHint(code: string, message: string): string {
  if (code === 'unknown-entity') {
    return 'Use the exact name of an entity declared in entities, or add that entity first.';
  }
  if (code === 'unknown-field') {
    return 'Use the exact field name declared on this entity, or add the field first.';
  }
  if (code === 'unknown-key') {
    return 'Remove this key or replace it with a property supported by the blueprint schema.';
  }
  if (code === 'invalid-type') {
    return 'Change this value to the type required by the schema at this path.';
  }
  if (code === 'value-too-small') {
    return 'Add the required minimum number of items or increase this value to the allowed minimum.';
  }
  if (code === 'value-too-large') {
    return 'Remove items or reduce this value to the allowed maximum.';
  }
  if (code === 'invalid-format') {
    return 'Use the format shown by the schema message, such as kebab-case names or an ISO currency code.';
  }
  if (code === 'duplicate-value') {
    return 'Give each item a unique name or value within its collection.';
  }
  if (code === 'missing-owner-field') {
    return 'Add an ownerField that names a persona field, or remove the :own permission.';
  }
  if (code === 'invalid-field-kind') {
    return 'Choose a field of the required kind, or change this setting to match the existing field.';
  }
  if (code === 'invalid-reference') {
    return 'Update the reference to point to a declared entity, field, role, route, or allowed value.';
  }
  if (message.includes('money is integer cents')) {
    return 'Use an integer amount in cents; for example, 1250 represents 12.50.';
  }
  return 'Adjust this value to satisfy the schema constraint described in the message.';
}
