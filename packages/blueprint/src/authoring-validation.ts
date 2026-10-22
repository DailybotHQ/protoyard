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
 */
export function validateBlueprintForAuthoring(input: unknown): BlueprintAuthoringValidation {
  const detected = detectBlueprintKind(input);
  if (!detected.ok) {
    return {
      valid: false,
      kind: null,
      diagnostics: [kindDiagnostic(input, detected.message, detected.fix)],
    };
  }
  const kind = detected.kind;
  const result = safeParseAnyBlueprint(input);
  if (result.success) return { valid: true, kind, diagnostics: [] };

  return {
    valid: false,
    kind,
    diagnostics: result.error.issues.map((issue) => {
      const path = [...issue.path] as BlueprintDiagnosticPath[];
      const message = issue.message;
      if (
        isContentKind(kind) &&
        issue.code === 'custom' &&
        path.length === 1 &&
        path[0] === 'kind'
      ) {
        return {
          code: 'kind-unavailable',
          path,
          jsonPath: toJsonPath(path),
          message,
          hint: `Update Protoyard to a build that ships the ${kind} engine, or author an app blueprint instead.`,
        };
      }
      const code = diagnosticCode(issue.code, message);
      return {
        code,
        path,
        jsonPath: toJsonPath(path),
        message,
        hint: isContentKind(kind)
          ? contentHint(kind, code, issue, path, message)
          : diagnosticHint(code, message),
      };
    }),
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
  return diagnosticHint(code, message);
}

function toJsonPath(path: readonly BlueprintDiagnosticPath[]): string {
  let result = '$';
  for (const segment of path) {
    result += typeof segment === 'number' ? `[${segment}]` : `[${JSON.stringify(segment)}]`;
  }
  return result;
}

function diagnosticCode(zodCode: string, message: string): string {
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
