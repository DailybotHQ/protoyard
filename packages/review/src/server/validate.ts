import type { ReviewComment } from '@protoyard/core/review';

/**
 * A dependency-free validator for the review comment document, used by the
 * comments handler so the Cloudflare worker does not ship zod (about 125 KB
 * minified). It accepts exactly what `ReviewCommentSchema` in
 * `@protoyard/core/review` accepts and returns the same parsed value
 * (`formatVersion` defaulted, unknown keys rejected). The parity test
 * (`packages/review/tests/server-validate.test.ts`) runs both validators on
 * many valid and invalid documents; change both together.
 */

/** Mirrors `REVIEW_LIMITS` (asserted equal by the parity test). */
export const SERVER_REVIEW_LIMITS = {
  bodyMaxChars: 2000,
  nameMaxChars: 60,
  reactionKinds: 20,
  reactionsPerKind: 200,
  locators: 5,
  locatorMaxChars: 500,
  fingerprintMaxChars: 120,
  routeMaxChars: 500,
} as const;

const FORMAT_VERSION = 1;
const ID = /^[A-Za-z0-9_-]{10,64}$/;
const CLIENT_ID = /^[A-Za-z0-9_:.-]{8,128}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const SLUG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const KEBAB = /^[a-z][a-z0-9-]*$/;
const PERSONA = /^[A-Za-z0-9_-]{1,64}$/;
const LOCATOR_KINDS = ['py-anchor', 'test-id', 'id', 'role-path', 'css-path'];
const SHELLS = [
  'auto',
  'none',
  'phone',
  'tablet',
  'desktop-window',
  'browser',
  'widget-host',
  'extension-popup',
  'side-panel',
];
const ORIENTATIONS = ['portrait', 'landscape'];
const COLOR_MODES = ['light', 'dark', 'system'];

export interface ServerValidationIssue {
  path: string[];
  code: string;
  message: string;
}

export type ServerValidationResult =
  | { success: true; data: ReviewComment }
  | { success: false; issues: ServerValidationIssue[] };

type Path = readonly string[];
type Issues = ServerValidationIssue[];
type Obj = Record<string, unknown>;

function issue(issues: Issues, path: Path, code: string, message: string): false {
  issues.push({ path: [...path], code, message });
  return false;
}

function isObject(value: unknown): value is Obj {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isControl(code: number): boolean {
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
}

function isBidi(code: number): boolean {
  return (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069);
}

function unsafe(value: string, name: boolean): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (!name && (code === 0x09 || code === 0x0a || code === 0x0d)) continue;
    if (isControl(code) || isBidi(code)) return true;
    if (name && (code === 0x2028 || code === 0x2029)) return true;
  }
  return false;
}

interface StringRule {
  min?: number;
  max?: number;
  pattern?: RegExp;
  oneOf?: readonly string[];
  check?: (value: string) => string | undefined;
}

function str(value: unknown, path: Path, issues: Issues, rule: StringRule): value is string {
  if (typeof value !== 'string') return issue(issues, path, 'invalid_type', 'expected string');
  if (rule.oneOf) {
    return rule.oneOf.includes(value) || issue(issues, path, 'invalid_value', 'invalid option');
  }
  let ok = true;
  if (rule.min !== undefined && value.length < rule.min)
    ok = issue(issues, path, 'too_small', `must have at least ${rule.min} characters`);
  if (rule.max !== undefined && value.length > rule.max)
    ok = issue(issues, path, 'too_big', `must have at most ${rule.max} characters`);
  if (rule.pattern && !rule.pattern.test(value))
    ok = issue(issues, path, 'invalid_format', 'invalid string format');
  if (ok && rule.check) {
    const message = rule.check(value);
    if (message) ok = issue(issues, path, 'custom', message);
  }
  return ok;
}

function num(
  value: unknown,
  path: Path,
  issues: Issues,
  min: number,
  max: number,
  int: boolean
): boolean {
  if (typeof value !== 'number' || !Number.isFinite(value))
    return issue(issues, path, 'invalid_type', 'expected number');
  if (int && !Number.isInteger(value)) return issue(issues, path, 'invalid_type', 'expected int');
  if (value < min) return issue(issues, path, 'too_small', `must be >= ${min}`);
  if (value > max) return issue(issues, path, 'too_big', `must be <= ${max}`);
  return true;
}

/** Strict object: rejects non-objects and unknown keys. */
function strict(value: unknown, path: Path, issues: Issues, keys: readonly string[]): value is Obj {
  if (!isObject(value)) return issue(issues, path, 'invalid_type', 'expected object');
  const extra = Object.keys(value).filter((key) => !keys.includes(key));
  return (
    extra.length === 0 ||
    issue(issues, path, 'unrecognized_keys', `unrecognized keys: ${extra.join(', ')}`)
  );
}

/** Copies the present keys in schema order (absent and `undefined` keys are left out). */
function pick(value: Obj, keys: readonly string[]): Obj {
  const out: Obj = {};
  for (const key of keys) if (value[key] !== undefined) out[key] = value[key];
  return out;
}

const iso = (value: unknown, path: Path, issues: Issues) =>
  str(value, path, issues, {
    max: 40,
    pattern: ISO,
    check: (v) => (Number.isNaN(Date.parse(v)) ? 'timestamp must be a valid date' : undefined),
  });

const AUTHOR_KEYS = ['name', 'clientId'];
function author(value: unknown, path: Path, issues: Issues): boolean {
  if (!strict(value, path, issues, AUTHOR_KEYS)) return false;
  const a = str(value.name, [...path, 'name'], issues, {
    max: SERVER_REVIEW_LIMITS.nameMaxChars,
    check: (v) =>
      v.trim().length === 0
        ? 'name must not be blank'
        : unsafe(v, true)
          ? 'name has control characters'
          : undefined,
  });
  const b = str(value.clientId, [...path, 'clientId'], issues, { pattern: CLIENT_ID });
  return a && b;
}

const ROUTE_RULE: StringRule = { max: SERVER_REVIEW_LIMITS.routeMaxChars, pattern: /^\// };
const ANCHOR_KEYS = ['route', 'locators', 'fingerprint', 'offset'];
function anchor(value: unknown, path: Path, issues: Issues): boolean {
  if (!strict(value, path, issues, ANCHOR_KEYS)) return false;
  let ok = true;
  const route = value.route;
  if (strict(route, [...path, 'route'], issues, ['pattern', 'path'])) {
    ok = str(route.pattern, [...path, 'route', 'pattern'], issues, ROUTE_RULE) && ok;
    ok = str(route.path, [...path, 'route', 'path'], issues, ROUTE_RULE) && ok;
  } else ok = false;

  const locators = value.locators;
  const at = [...path, 'locators'];
  if (!Array.isArray(locators)) ok = issue(issues, at, 'invalid_type', 'expected array');
  else {
    if (locators.length < 1) ok = issue(issues, at, 'too_small', 'needs a locator');
    if (locators.length > SERVER_REVIEW_LIMITS.locators)
      ok = issue(issues, at, 'too_big', 'too many locators');
    locators.forEach((locator: unknown, index) => {
      const lp = [...at, String(index)];
      if (!strict(locator, lp, issues, ['kind', 'value'])) {
        ok = false;
        return;
      }
      ok = str(locator.kind, [...lp, 'kind'], issues, { oneOf: LOCATOR_KINDS }) && ok;
      ok =
        str(locator.value, [...lp, 'value'], issues, {
          min: 1,
          max: SERVER_REVIEW_LIMITS.locatorMaxChars,
        }) && ok;
    });
  }
  if (value.fingerprint !== undefined)
    ok =
      str(value.fingerprint, [...path, 'fingerprint'], issues, {
        max: SERVER_REVIEW_LIMITS.fingerprintMaxChars,
      }) && ok;
  const offset = value.offset;
  if (strict(offset, [...path, 'offset'], issues, ['x', 'y'])) {
    ok = num(offset.x, [...path, 'offset', 'x'], issues, 0, 1, false) && ok;
    ok = num(offset.y, [...path, 'offset', 'y'], issues, 0, 1, false) && ok;
  } else ok = false;
  return ok;
}

const CONTEXT_KEYS = [
  'scenario',
  'persona',
  'shell',
  'orientation',
  'theme',
  'mode',
  'layout',
  'viewport',
  'buildId',
];
const CONTEXT_RULES: Record<string, StringRule> = {
  scenario: { max: 64, pattern: KEBAB },
  persona: { pattern: PERSONA },
  shell: { oneOf: SHELLS },
  orientation: { oneOf: ORIENTATIONS },
  theme: { max: 64, pattern: KEBAB },
  mode: { oneOf: COLOR_MODES },
  layout: { max: 64, pattern: KEBAB },
  buildId: { min: 1, max: 80 },
};
function context(value: unknown, path: Path, issues: Issues): boolean {
  if (!strict(value, path, issues, CONTEXT_KEYS)) return false;
  let ok = true;
  for (const [key, rule] of Object.entries(CONTEXT_RULES)) {
    if (value[key] !== undefined) ok = str(value[key], [...path, key], issues, rule) && ok;
  }
  const viewport = value.viewport;
  const vp = [...path, 'viewport'];
  if (strict(viewport, vp, issues, ['width', 'height'])) {
    ok = num(viewport.width, [...vp, 'width'], issues, 1, 20000, true) && ok;
    ok = num(viewport.height, [...vp, 'height'], issues, 1, 20000, true) && ok;
  } else ok = false;
  return ok;
}

/** Returns a copy (own data properties only), or undefined when invalid. */
function reactions(value: unknown, path: Path, issues: Issues): Obj | undefined {
  if (!isObject(value)) {
    issue(issues, path, 'invalid_type', 'expected record');
    return undefined;
  }
  let ok = true;
  const out: Obj = {};
  const keys = Object.keys(value);
  for (const key of keys) {
    const kp = [...path, key];
    if (key.length < 1 || key.length > 16) ok = issue(issues, kp, 'invalid_key', 'invalid key');
    const ids = value[key];
    if (!Array.isArray(ids)) {
      ok = issue(issues, kp, 'invalid_type', 'expected array');
      continue;
    }
    if (ids.length > SERVER_REVIEW_LIMITS.reactionsPerKind)
      ok = issue(issues, kp, 'too_big', 'too many reactions');
    ids.forEach((id: unknown, index) => {
      ok = str(id, [...kp, String(index)], issues, { pattern: CLIENT_ID }) && ok;
    });
    Object.defineProperty(out, key, {
      value: [...ids],
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  if (ok && keys.length > SERVER_REVIEW_LIMITS.reactionKinds)
    ok = issue(
      issues,
      path,
      'custom',
      `at most ${SERVER_REVIEW_LIMITS.reactionKinds} reaction kinds`
    );
  return ok ? out : undefined;
}

const COMMENT_KEYS = [
  'formatVersion',
  'id',
  'threadId',
  'slug',
  'body',
  'author',
  'createdAt',
  'updatedAt',
  'editedAt',
  'resolvedAt',
  'resolvedBy',
  'anchor',
  'context',
  'reactions',
];

/** Validates an untrusted comment document without throwing (the `ReviewCommentSchema` contract). */
export function validateReviewComment(input: unknown): ServerValidationResult {
  const issues: Issues = [];
  if (!strict(input, [], issues, COMMENT_KEYS)) return { success: false, issues };
  const c = input;
  let ok = true;
  if (c.formatVersion !== undefined && c.formatVersion !== FORMAT_VERSION)
    ok = issue(issues, ['formatVersion'], 'invalid_value', `expected ${FORMAT_VERSION}`);
  ok = str(c.id, ['id'], issues, { pattern: ID }) && ok;
  ok = str(c.threadId, ['threadId'], issues, { pattern: ID }) && ok;
  ok = str(c.slug, ['slug'], issues, { min: 2, max: 48, pattern: SLUG }) && ok;
  ok =
    str(c.body, ['body'], issues, {
      max: SERVER_REVIEW_LIMITS.bodyMaxChars,
      check: (v) =>
        v.trim().length === 0
          ? 'comment must not be blank'
          : unsafe(v, false)
            ? 'comment has control characters'
            : undefined,
    }) && ok;
  ok = author(c.author, ['author'], issues) && ok;
  ok = iso(c.createdAt, ['createdAt'], issues) && ok;
  for (const key of ['updatedAt', 'editedAt', 'resolvedAt']) {
    if (c[key] !== undefined) ok = iso(c[key], [key], issues) && ok;
  }
  if (c.resolvedBy !== undefined) ok = author(c.resolvedBy, ['resolvedBy'], issues) && ok;
  if (c.anchor !== undefined) ok = anchor(c.anchor, ['anchor'], issues) && ok;
  if (c.context !== undefined) ok = context(c.context, ['context'], issues) && ok;
  let copiedReactions: Obj | undefined;
  if (c.reactions !== undefined) {
    copiedReactions = reactions(c.reactions, ['reactions'], issues);
    ok = copiedReactions !== undefined && ok;
  }
  if (!ok) return { success: false, issues };
  if (c.id === c.threadId) {
    if (c.anchor === undefined)
      issue(issues, ['anchor'], 'custom', 'a thread root needs an anchor');
    if (c.context === undefined)
      issue(issues, ['context'], 'custom', 'a thread root needs a context');
    if (issues.length > 0) return { success: false, issues };
  }
  const data = pick({ ...c, formatVersion: FORMAT_VERSION }, COMMENT_KEYS);
  data.author = { ...(c.author as Obj) };
  if (c.resolvedBy !== undefined) data.resolvedBy = { ...(c.resolvedBy as Obj) };
  if (c.anchor !== undefined) data.anchor = copyAnchor(c.anchor as Obj);
  if (c.context !== undefined) data.context = copyContext(c.context as Obj);
  if (copiedReactions) data.reactions = copiedReactions;
  return { success: true, data: data as unknown as ReviewComment };
}

function copyAnchor(a: Obj): Obj {
  const route = a.route as Obj;
  const offset = a.offset as Obj;
  return pick(
    {
      route: { pattern: route.pattern, path: route.path },
      locators: (a.locators as Obj[]).map((l) => ({ kind: l.kind, value: l.value })),
      fingerprint: a.fingerprint,
      offset: { x: offset.x, y: offset.y },
    },
    ANCHOR_KEYS
  );
}

function copyContext(c: Obj): Obj {
  const viewport = c.viewport as Obj;
  return pick({ ...c, viewport: { width: viewport.width, height: viewport.height } }, CONTEXT_KEYS);
}
