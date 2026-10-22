import {
  classifyMediaSource,
  isUnsafeTextCharacter,
  normalizeLineSeparators,
} from '@protoyard/blocks';
import { type AnyBlueprint, safeParseAnyBlueprint } from './kinds/envelope.ts';
import { detectBlueprintKind } from './kinds/kind.ts';
import {
  checkContentLimits,
  containsEmbeddedApp,
  DEFAULT_UNTRUSTED_DOCUMENT_LIMITS,
  type TextContext,
  textContextFor,
  type UntrustedDocumentLimits,
} from './kinds/limits.ts';
import { type Blueprint, safeParseBlueprint } from './schema.ts';

/** Limits for data entering a player from a link, paste, file, or message. */
export interface UntrustedBlueprintLimits {
  maxBytes: number;
  maxDepth: number;
  maxEntities: number;
  maxFieldsPerEntity: number;
  maxScreens: number;
  maxRoles: number;
  maxNotifications: number;
  maxHistory: number;
  maxWorldRows: number;
}

export const DEFAULT_UNTRUSTED_BLUEPRINT_LIMITS: Readonly<UntrustedBlueprintLimits> = Object.freeze(
  {
    maxBytes: 256 * 1024,
    maxDepth: 32,
    maxEntities: 64,
    maxFieldsPerEntity: 64,
    maxScreens: 128,
    maxRoles: 32,
    maxNotifications: 128,
    maxHistory: 32,
    maxWorldRows: 100_000,
  }
);

export type UntrustedBlueprintIssue = {
  code:
    | 'invalid-input'
    | 'too-large'
    | 'too-deep'
    | 'too-many'
    | 'unsafe-key'
    | 'invalid-json'
    | 'invalid-blueprint';
  path: (string | number)[];
  message: string;
  fix: string;
};

export type UntrustedBlueprintResult =
  | { success: true; blueprint: Blueprint; issues: [] }
  | { success: false; blueprint: null; issues: UntrustedBlueprintIssue[] };

/**
 * Removes C0/C1 controls, bidi overrides, BOMs and invisible characters, and
 * turns U+2028/U+2029 into line breaks or spaces. `multiline` text keeps
 * `\n` (after normalizing `\r\n`), and `code` keeps `\t` as well.
 */
function stripControlAndBidi(value: string, context: TextContext = 'plain'): string {
  const keepNewlines = context !== 'plain';
  const lines = normalizeLineSeparators(value, keepNewlines);
  return [...(keepNewlines ? lines.replace(/\r\n?/g, '\n') : lines)]
    .filter((char) => {
      return !isUnsafeTextCharacter(char, keepNewlines, context === 'code');
    })
    .join('');
}
const FATAL = (code: UntrustedBlueprintIssue['code'], message: string, fix: string) => ({
  code,
  path: [] as (string | number)[],
  message,
  fix,
});

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function checkJsonDepth(text: string, maxDepth: number): boolean {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (const char of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === '{' || char === '[') {
      depth += 1;
      if (depth > maxDepth) return false;
    } else if (char === '}' || char === ']') depth -= 1;
  }
  return true;
}

type CloneResult = { ok: true; value: unknown } | { ok: false; issue: UntrustedBlueprintIssue };

/**
 * A plain, acyclic, prototype-free copy with every string cleaned. With
 * `textContexts` (content kinds), strings in schema-declared multiline fields
 * keep their newlines; without it (apps), every string is one line.
 */
function sanitizeJson(value: unknown, maxDepth: number, textContexts = false): CloneResult {
  const ancestors = new WeakSet<object>();
  const visit = (
    current: unknown,
    path: (string | number)[],
    depth: number,
    context: TextContext = 'plain',
    inListItems = false
  ): CloneResult => {
    if (depth > maxDepth) {
      return {
        ok: false,
        issue: {
          code: 'too-deep',
          path,
          message: 'Blueprint JSON exceeds the maximum nesting depth.',
          fix: `Flatten the blueprint so it is at most ${maxDepth} levels deep.`,
        },
      };
    }
    if (typeof current === 'string') {
      return { ok: true, value: stripControlAndBidi(current, context) };
    }
    if (current === null || typeof current === 'boolean' || typeof current === 'number') {
      return { ok: true, value: current };
    }
    if (Array.isArray(current)) {
      if (ancestors.has(current)) {
        return {
          ok: false,
          issue: FATAL(
            'invalid-input',
            'Input must be acyclic JSON data.',
            'Pass JSON text or a plain JSON object.'
          ),
        };
      }
      ancestors.add(current);
      const output: unknown[] = [];
      for (let i = 0; i < current.length; i += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(current, String(i));
        if (!descriptor || !('value' in descriptor)) {
          return {
            ok: false,
            issue: {
              ...FATAL(
                'invalid-input',
                'Input arrays must contain plain JSON values.',
                'Remove holes, accessors, and non-data properties.'
              ),
              path: [...path, i],
            },
          };
        }
        const item = visit(descriptor.value, [...path, i], depth + 1, context, inListItems);
        if (!item.ok) return item;
        output.push(item.value);
      }
      ancestors.delete(current);
      return { ok: true, value: output };
    }
    if (typeof current !== 'object' || current === null) {
      return {
        ok: false,
        issue: FATAL(
          'invalid-input',
          'Input must be JSON text or plain JSON data.',
          'Provide a JSON blueprint object or its JSON text.'
        ),
      };
    }
    const proto = Object.getPrototypeOf(current);
    if (proto !== Object.prototype && proto !== null) {
      return {
        ok: false,
        issue: FATAL(
          'invalid-input',
          'Input objects must be plain JSON data.',
          'Remove custom prototypes and pass a plain object.'
        ),
      };
    }
    if (ancestors.has(current)) {
      return {
        ok: false,
        issue: FATAL(
          'invalid-input',
          'Input must be acyclic JSON data.',
          'Pass JSON text or a plain JSON object.'
        ),
      };
    }
    ancestors.add(current);
    const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of Object.keys(current)) {
      if (key === '__proto__' || key === 'constructor') {
        return {
          ok: false,
          issue: {
            code: 'unsafe-key',
            path: [...path, key],
            message: `Blueprint contains the unsafe key "${key}".`,
            fix: 'Remove prototype-related keys from the input.',
          },
        };
      }
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (!descriptor || !('value' in descriptor)) {
        return {
          ok: false,
          issue: {
            ...FATAL(
              'invalid-input',
              'Input objects must contain plain JSON values.',
              'Remove getters and setters from the input.'
            ),
            path: [...path, key],
          },
        };
      }
      const safeKey = stripControlAndBidi(key);
      if (safeKey === '__proto__' || safeKey === 'constructor') {
        return {
          ok: false,
          issue: {
            code: 'unsafe-key',
            path: [...path, safeKey],
            message: `Blueprint contains the unsafe key "${safeKey}" after sanitization.`,
            fix: 'Remove prototype-related keys from the input.',
          },
        };
      }
      if (Object.hasOwn(output, safeKey)) {
        return {
          ok: false,
          issue: {
            ...FATAL(
              'invalid-input',
              'Sanitization produced duplicate object keys.',
              'Rename keys so they remain unique after control characters are removed.'
            ),
            path: [...path, key],
          },
        };
      }
      const record = current as Record<string, unknown>;
      const item = textContexts
        ? visit(
            descriptor.value,
            [...path, safeKey],
            depth + 1,
            textContextFor(key, record, inListItems),
            key === 'items' && record.type === 'list'
          )
        : visit(descriptor.value, [...path, safeKey], depth + 1);
      if (!item.ok) return item;
      output[safeKey] = item.value;
    }
    ancestors.delete(current);
    return { ok: true, value: output };
  };
  return visit(value, [], 0);
}

/** Validate and sanitize data before any player derives or renders a blueprint. */
export function loadUntrustedBlueprint(
  input: unknown,
  limits: Partial<UntrustedBlueprintLimits> = {}
): UntrustedBlueprintResult {
  const caps = Object.fromEntries(
    Object.entries(DEFAULT_UNTRUSTED_BLUEPRINT_LIMITS).map(([key, defaultValue]) => {
      const requested = limits[key as keyof UntrustedBlueprintLimits];
      return [
        key,
        requested === undefined || !Number.isFinite(requested)
          ? defaultValue
          : Math.min(defaultValue, requested),
      ];
    })
  ) as unknown as UntrustedBlueprintLimits;
  try {
    let parsed: unknown;
    if (typeof input === 'string') {
      if (utf8Length(input) > caps.maxBytes) {
        return {
          success: false,
          blueprint: null,
          issues: [
            FATAL(
              'too-large',
              'Blueprint input exceeds the byte limit.',
              `Keep the input at or below ${caps.maxBytes} UTF-8 bytes.`
            ),
          ],
        };
      }
      if (!checkJsonDepth(input, caps.maxDepth)) {
        return {
          success: false,
          blueprint: null,
          issues: [
            FATAL(
              'too-deep',
              'Blueprint JSON exceeds the maximum nesting depth.',
              `Flatten the blueprint so it is at most ${caps.maxDepth} levels deep.`
            ),
          ],
        };
      }
      try {
        parsed = JSON.parse(input) as unknown;
      } catch {
        return {
          success: false,
          blueprint: null,
          issues: [
            FATAL(
              'invalid-json',
              'Blueprint input is not valid JSON.',
              'Fix the JSON syntax and try again.'
            ),
          ],
        };
      }
    } else {
      parsed = input;
    }

    const safe = sanitizeJson(parsed, caps.maxDepth);
    if (!safe.ok) return { success: false, blueprint: null, issues: [safe.issue] };
    const serialized = JSON.stringify(safe.value);
    if (serialized === undefined || utf8Length(serialized) > caps.maxBytes) {
      return {
        success: false,
        blueprint: null,
        issues: [
          FATAL(
            'too-large',
            'Blueprint input exceeds the byte limit.',
            `Keep the input at or below ${caps.maxBytes} UTF-8 bytes.`
          ),
        ],
      };
    }

    const root = safe.value as Record<string, unknown>;
    const countChecks: [string, number, number][] = [
      ['entities', caps.maxEntities, Array.isArray(root.entities) ? root.entities.length : 0],
      ['roles', caps.maxRoles, Array.isArray(root.roles) ? root.roles.length : 0],
      ['screens', caps.maxScreens, Array.isArray(root.screens) ? root.screens.length : 0],
      [
        'notifications',
        caps.maxNotifications,
        Array.isArray(root.notifications) ? root.notifications.length : 0,
      ],
      ['history', caps.maxHistory, Array.isArray(root.history) ? root.history.length : 0],
    ];
    for (const [key, max, actual] of countChecks) {
      if (actual > max) {
        return {
          success: false,
          blueprint: null,
          issues: [
            {
              code: 'too-many',
              path: [key],
              message: `Blueprint has ${actual} ${key}; the limit is ${max}.`,
              fix: `Reduce ${key} to at most ${max}.`,
            },
          ],
        };
      }
    }
    if (Array.isArray(root.entities)) {
      for (const [index, entity] of root.entities.entries()) {
        const fields =
          entity && typeof entity === 'object' && 'fields' in entity ? entity.fields : undefined;
        if (Array.isArray(fields) && fields.length > caps.maxFieldsPerEntity) {
          return {
            success: false,
            blueprint: null,
            issues: [
              {
                code: 'too-many',
                path: ['entities', index, 'fields'],
                message: `Entity has ${fields.length} fields; the limit is ${caps.maxFieldsPerEntity}.`,
                fix: `Reduce this entity to at most ${caps.maxFieldsPerEntity} fields.`,
              },
            ],
          };
        }
      }
    }

    const parsedBlueprint = safeParseBlueprint(safe.value);
    if (!parsedBlueprint.success) {
      return {
        success: false,
        blueprint: null,
        issues: parsedBlueprint.error.issues.map((issue) => ({
          code: 'invalid-blueprint' as const,
          path: issue.path.filter(
            (part): part is string | number => typeof part === 'string' || typeof part === 'number'
          ),
          message: issue.message,
          fix: 'Correct this value to match the blueprint schema, then try again.',
        })),
      };
    }
    const result = parsedBlueprint.data;
    const estimatedRows = result.entities.reduce((total, entity) => {
      const isDependent = result.entities.some((other) =>
        other.fields.some((field) => field.kind === 'relation' && field.to === entity.name)
      );
      const baseCount = entity.seedCount ?? (isDependent ? 8 : 4);
      return total + Math.max(1, Math.round(baseCount * 25));
    }, 0);
    if (estimatedRows > caps.maxWorldRows) {
      return {
        success: false,
        blueprint: null,
        issues: [
          {
            code: 'too-many',
            path: ['entities'],
            message: `The massive scenario could generate about ${estimatedRows} rows; the limit is ${caps.maxWorldRows}.`,
            fix: `Lower seedCount values so the estimated massive world stays at or below ${caps.maxWorldRows} rows.`,
          },
        ],
      };
    }
    return { success: true, blueprint: result, issues: [] };
  } catch {
    return {
      success: false,
      blueprint: null,
      issues: [
        FATAL(
          'invalid-input',
          'Blueprint could not be safely loaded.',
          'Provide plain JSON data that matches the blueprint schema.'
        ),
      ],
    };
  }
}

export type UntrustedDocumentResult =
  | { success: true; blueprint: AnyBlueprint; issues: [] }
  | { success: false; blueprint: null; issues: UntrustedBlueprintIssue[] };

const failed = (...issues: UntrustedBlueprintIssue[]): UntrustedDocumentResult => ({
  success: false,
  blueprint: null,
  issues,
});

function relativeMediaIssue(
  value: unknown,
  path: (string | number)[] = []
): UntrustedBlueprintIssue | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = relativeMediaIssue(value[index], [...path, index]);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  for (const [key, child] of Object.entries(value)) {
    const childPath = [...path, key];
    if ((key === 'src' || key === 'poster' || key === 'image') && typeof child === 'string') {
      const kinds =
        key === 'image' || key === 'poster' ? (['image'] as const) : (['image', 'video'] as const);
      for (const kind of kinds) {
        const result = classifyMediaSource(child, kind);
        if (result.ok && result.kind === 'relative') {
          return {
            code: 'invalid-blueprint',
            path: childPath,
            message: 'Level-1 documents cannot load relative media paths.',
            fix: 'Use an avatar id or an allowed raster data URI; relative assets require a level-2 prototype.',
          };
        }
      }
    }
    const nested = relativeMediaIssue(child, childPath);
    if (nested) return nested;
  }
  return null;
}

function capsOf(limits: Partial<UntrustedDocumentLimits>): UntrustedDocumentLimits {
  return Object.fromEntries(
    Object.entries(DEFAULT_UNTRUSTED_DOCUMENT_LIMITS).map(([key, defaultValue]) => {
      const requested = limits[key as keyof UntrustedDocumentLimits];
      return [
        key,
        requested === undefined || !Number.isFinite(requested)
          ? defaultValue
          : Math.min(defaultValue, requested),
      ];
    })
  ) as unknown as UntrustedDocumentLimits;
}

/**
 * Validates and sanitizes a blueprint of any kind before a player derives or
 * renders it (ADR-036). Apps keep their exact `loadUntrustedBlueprint`
 * contract and limits. Content kinds (deck, page, doc):
 *
 * - size and depth are checked before parsing (`maxBytes`, `maxDepth`);
 * - relative block media is refused at level 1 (generated level-2 schemas
 *   continue to accept deck-local paths);
 * - strings lose C0/C1 controls and bidi overrides, except `\n` in the
 *   schema-declared multiline fields (markdown, speaker notes, quotes, list
 *   items) and `\t` in code; `\r\n` becomes `\n`;
 * - slides, blocks per slide, blocks in total (nested blocks count), chart
 *   points and embedded apps are capped (`too-many`);
 * - each embedded app must be an app (no kind or `"app"`), may not embed
 *   another app (`too-deep`), and passes `loadUntrustedBlueprint` with the
 *   app caps;
 * - then the kind's body schema (loaded on demand) validates the document.
 *
 * Never throws.
 */
export async function loadUntrustedDocument(
  input: unknown,
  limits: Partial<UntrustedDocumentLimits & UntrustedBlueprintLimits> = {}
): Promise<UntrustedDocumentResult> {
  const caps = capsOf(limits);
  try {
    let parsed: unknown;
    if (typeof input === 'string') {
      if (utf8Length(input) > caps.maxBytes) {
        return failed(
          FATAL(
            'too-large',
            'Document input exceeds the byte limit.',
            `Keep the input at or below ${caps.maxBytes} UTF-8 bytes.`
          )
        );
      }
      try {
        parsed = JSON.parse(input) as unknown;
      } catch {
        // Not JSON at all: the app loader's contract (size, depth, then JSON) answers.
        return loadUntrustedBlueprint(input, limits);
      }
    } else {
      parsed = input;
    }

    const detected = detectBlueprintKind(parsed);
    if (!detected.ok) {
      return failed({
        code: 'invalid-blueprint',
        path: ['kind'],
        message: detected.message,
        fix: detected.fix,
      });
    }
    // Apps: the app loader, its limits and its result, unchanged, on the original input.
    if (detected.kind === 'app') return loadUntrustedBlueprint(input, limits);

    if (typeof input === 'string' && !checkJsonDepth(input, caps.maxDepth)) {
      return failed(
        FATAL(
          'too-deep',
          'Document JSON exceeds the maximum nesting depth.',
          `Flatten the document so it is at most ${caps.maxDepth} levels deep.`
        )
      );
    }
    const safe = sanitizeJson(parsed, caps.maxDepth, true);
    if (!safe.ok) return failed(safe.issue);
    const disallowedMedia = relativeMediaIssue(safe.value);
    if (disallowedMedia) return failed(disallowedMedia);
    const serialized = JSON.stringify(safe.value);
    if (serialized === undefined || utf8Length(serialized) > caps.maxBytes) {
      return failed(
        FATAL(
          'too-large',
          'Document input exceeds the byte limit.',
          `Keep the input at or below ${caps.maxBytes} UTF-8 bytes.`
        )
      );
    }

    const root = safe.value as Record<string, unknown>;
    const counted = checkContentLimits(root, detected.kind, caps);
    if (counted.issue) return failed({ code: 'too-many', ...counted.issue });

    for (const { path, app } of counted.embeddedApps) {
      const nestedKind = detectBlueprintKind(app);
      if (!nestedKind.ok || nestedKind.kind !== 'app') {
        return failed({
          code: 'invalid-blueprint',
          path: [...path, 'kind'],
          message: 'An embedded app must be an app blueprint (no kind, or kind "app").',
          fix: 'Embed an app blueprint, or link to the deck, page or doc instead.',
        });
      }
      if (containsEmbeddedApp(app)) {
        return failed({
          code: 'too-deep',
          path,
          message: 'An embedded app cannot embed another app (one level only).',
          fix: 'Remove the nested embed-app block.',
        });
      }
      const nested = loadUntrustedBlueprint(app, limits);
      if (!nested.success) {
        return failed(
          ...nested.issues.map((issue) => ({ ...issue, path: [...path, ...issue.path] }))
        );
      }
    }

    const result = await safeParseAnyBlueprint(root);
    if (!result.success) {
      return failed(
        ...result.error.issues.map((issue) => ({
          code: 'invalid-blueprint' as const,
          path: issue.path.filter(
            (part): part is string | number => typeof part === 'string' || typeof part === 'number'
          ),
          message: issue.message,
          fix: 'Correct this value to match the schema for this kind, then try again.',
        }))
      );
    }
    return { success: true, blueprint: result.data, issues: [] };
  } catch {
    return failed(
      FATAL(
        'invalid-input',
        'Document could not be safely loaded.',
        'Provide plain JSON data that matches the blueprint schema.'
      )
    );
  }
}
