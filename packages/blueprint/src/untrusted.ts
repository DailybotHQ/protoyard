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

function stripControlAndBidi(value: string): string {
  return [...value]
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return !(
        code <= 0x1f ||
        (code >= 0x7f && code <= 0x9f) ||
        code === 0x061c ||
        code === 0x200e ||
        code === 0x200f ||
        (code >= 0x202a && code <= 0x202e) ||
        (code >= 0x2066 && code <= 0x2069) ||
        code === 0xfeff
      );
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

function sanitizeJson(value: unknown, maxDepth: number): CloneResult {
  const ancestors = new WeakSet<object>();
  const visit = (current: unknown, path: (string | number)[], depth: number): CloneResult => {
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
    if (typeof current === 'string') return { ok: true, value: stripControlAndBidi(current) };
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
        const item = visit(descriptor.value, [...path, i], depth + 1);
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
      const item = visit(descriptor.value, [...path, safeKey], depth + 1);
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
  const caps = { ...DEFAULT_UNTRUSTED_BLUEPRINT_LIMITS, ...limits };
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
