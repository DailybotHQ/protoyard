import { DECK_LIMITS, type Deck, safeParseDeck } from './schema/index.ts';

/**
 * Loading a deck from somewhere it could have been tampered with: a share
 * link, a pasted file, an embed message, an artifact. Cheap structural checks
 * run on the raw text or data **before** zod sees it, so a hostile input never
 * costs a deep recursive parse:
 *
 * 1. size (UTF-8 bytes of the JSON) and nesting depth, scanned on the text;
 * 2. a sanitizing copy: plain JSON data only (no accessors, holes, cycles,
 *    class instances), no `__proto__` / `constructor` / `prototype` keys, and
 *    strings stripped of control and bidirectional-override characters
 *    (newlines and tabs stay: notes and markdown use them);
 * 3. counts: slides, and block nodes across free slides;
 * 4. `safeParseDeck`, which enforces the layout catalog, every layout's props,
 *    step markers, and the media and link policies.
 *
 * Nothing here runs code, fetches, or renders: a deck is data, and every
 * string a layout shows is rendered as text (`decks-ui` never uses `{@html}`).
 */

export interface UntrustedDeckLimits {
  /** UTF-8 bytes of the JSON text. 200 slides of 2,000-character notes fit. */
  maxBytes: number;
  /** Object and array nesting. Free slides nest containers, so this is generous. */
  maxDepth: number;
  maxSlides: number;
  /** Objects inside free slides' `blocks`, all slides together. */
  maxBlockNodes: number;
}

export const DEFAULT_UNTRUSTED_DECK_LIMITS: Readonly<UntrustedDeckLimits> = Object.freeze({
  maxBytes: 1024 * 1024,
  maxDepth: 32,
  maxSlides: DECK_LIMITS.slides,
  maxBlockNodes: 20_000,
});

export type UntrustedDeckIssueCode =
  | 'invalid-input'
  | 'invalid-json'
  | 'too-large'
  | 'too-deep'
  | 'too-many'
  | 'unsafe-key'
  | 'invalid-deck';

export interface UntrustedDeckIssue {
  code: UntrustedDeckIssueCode;
  path: (string | number)[];
  jsonPath: string;
  message: string;
  fix: string;
}

export type UntrustedDeckResult =
  | { success: true; deck: Deck; issues: [] }
  | { success: false; deck: null; issues: UntrustedDeckIssue[] };

const UNSAFE_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

function toJsonPath(path: readonly (string | number)[]): string {
  return path.reduce<string>((out, part) => {
    if (typeof part === 'number') return `${out}[${part}]`;
    return /^[A-Za-z_$][\w$]*$/.test(part) ? `${out}.${part}` : `${out}[${JSON.stringify(part)}]`;
  }, '$');
}

function issue(
  code: UntrustedDeckIssueCode,
  message: string,
  fix: string,
  path: (string | number)[] = []
): UntrustedDeckIssue {
  return { code, path, jsonPath: toJsonPath(path), message, fix };
}

const fail = (...issues: UntrustedDeckIssue[]): UntrustedDeckResult => ({
  success: false,
  deck: null,
  issues,
});

/**
 * Removes characters that can hide or reorder text: C0 and C1 controls
 * (except tab, line feed and carriage return), the bidirectional marks and
 * overrides, and the byte-order mark. Checked by code point, so no literal
 * control character appears in this source.
 */
export function stripHiddenCharacters(value: string): string {
  let out = '';
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    const hidden =
      (code <= 0x1f && code !== 0x09 && code !== 0x0a && code !== 0x0d) ||
      (code >= 0x7f && code <= 0x9f) ||
      code === 0x061c ||
      code === 0x200e ||
      code === 0x200f ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069) ||
      code === 0xfeff;
    if (!hidden) out += char;
  }
  return out;
}

function utf8Length(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

/** Nesting depth of JSON text, without parsing it. Stops early past `limit`. */
function jsonTextDepth(text: string, limit: number): number {
  let depth = 0;
  let max = 0;
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
      if (depth > max) max = depth;
      if (max > limit) return max;
    } else if (char === '}' || char === ']') depth -= 1;
  }
  return max;
}

type Copy = { ok: true; value: unknown } | { ok: false; issue: UntrustedDeckIssue };

/** A plain-data copy with hidden characters stripped; refuses anything that is not JSON data. */
function sanitize(input: unknown, maxDepth: number): Copy {
  const ancestors = new Set<object>();
  const visit = (value: unknown, path: (string | number)[], depth: number): Copy => {
    if (depth > maxDepth) {
      return {
        ok: false,
        issue: issue(
          'too-deep',
          `The deck nests deeper than ${maxDepth} levels.`,
          'Flatten nested blocks or props.',
          path
        ),
      };
    }
    if (typeof value === 'string') return { ok: true, value: stripHiddenCharacters(value) };
    if (value === null || typeof value === 'boolean') return { ok: true, value };
    if (typeof value === 'number') {
      return Number.isFinite(value)
        ? { ok: true, value }
        : {
            ok: false,
            issue: issue(
              'invalid-input',
              'Numbers must be finite.',
              'Replace NaN or Infinity.',
              path
            ),
          };
    }
    if (typeof value !== 'object') {
      return {
        ok: false,
        issue: issue(
          'invalid-input',
          `A ${typeof value} is not JSON data.`,
          'Pass JSON text or plain JSON data.',
          path
        ),
      };
    }
    if (ancestors.has(value)) {
      return {
        ok: false,
        issue: issue('invalid-input', 'The deck data is cyclic.', 'Pass acyclic JSON data.', path),
      };
    }
    ancestors.add(value);
    try {
      if (Array.isArray(value)) {
        const out: unknown[] = [];
        for (let i = 0; i < value.length; i++) {
          const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
          if (!descriptor || !('value' in descriptor)) {
            return {
              ok: false,
              issue: issue(
                'invalid-input',
                'Arrays must hold plain values (no holes or accessors).',
                'Pass JSON data.',
                [...path, i]
              ),
            };
          }
          const item = visit(descriptor.value, [...path, i], depth + 1);
          if (!item.ok) return item;
          out.push(item.value);
        }
        return { ok: true, value: out };
      }
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) {
        return {
          ok: false,
          issue: issue(
            'invalid-input',
            'Objects must be plain JSON objects.',
            'Pass JSON text or plain objects.',
            path
          ),
        };
      }
      if (Object.getOwnPropertySymbols(value).length > 0) {
        return {
          ok: false,
          issue: issue('invalid-input', 'Symbol keys are not JSON data.', 'Pass JSON data.', path),
        };
      }
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(value)) {
        if (UNSAFE_KEYS.has(key)) {
          return {
            ok: false,
            issue: issue(
              'unsafe-key',
              `The key "${key}" is not allowed.`,
              'Remove prototype-related keys.',
              [...path, key]
            ),
          };
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !('value' in descriptor)) {
          return {
            ok: false,
            issue: issue(
              'invalid-input',
              'Objects must hold plain values (no accessors).',
              'Pass JSON data.',
              [...path, key]
            ),
          };
        }
        const item = visit(descriptor.value, [...path, key], depth + 1);
        if (!item.ok) return item;
        out[key] = item.value;
      }
      return { ok: true, value: out };
    } finally {
      ancestors.delete(value);
    }
  };
  return visit(input, [], 1);
}

/** Objects under every free slide's `blocks`, counted iteratively. */
function countBlockNodes(slides: readonly unknown[], stopAt: number): number {
  let count = 0;
  const stack: unknown[] = [];
  for (const slide of slides) {
    if (slide && typeof slide === 'object' && 'blocks' in slide)
      stack.push((slide as { blocks: unknown }).blocks);
  }
  while (stack.length > 0 && count <= stopAt) {
    const node = stack.pop();
    if (Array.isArray(node)) stack.push(...node);
    else if (node && typeof node === 'object') {
      count += 1;
      stack.push(...Object.values(node));
    }
  }
  return count;
}

/**
 * Loads a deck from JSON text or parsed data that may be hostile. Never
 * throws; on success the deck is a fresh plain copy that passed `DeckSchema`.
 */
export function loadUntrustedDeck(
  input: unknown,
  limits: Partial<UntrustedDeckLimits> = {}
): UntrustedDeckResult {
  const cap = { ...DEFAULT_UNTRUSTED_DECK_LIMITS, ...limits };
  let data: unknown = input;

  if (typeof input === 'string') {
    const bytes = utf8Length(input);
    if (bytes > cap.maxBytes) {
      return fail(
        issue(
          'too-large',
          `The deck is ${bytes} bytes; the limit is ${cap.maxBytes}.`,
          'Shorten notes or split the deck.'
        )
      );
    }
    if (jsonTextDepth(input, cap.maxDepth) > cap.maxDepth) {
      return fail(
        issue(
          'too-deep',
          `The deck nests deeper than ${cap.maxDepth} levels.`,
          'Flatten nested blocks or props.'
        )
      );
    }
    try {
      data = JSON.parse(input);
    } catch (error) {
      return fail(
        issue(
          'invalid-json',
          `The deck is not valid JSON (${(error as Error).message}).`,
          'Fix the JSON syntax.'
        )
      );
    }
  }

  const copy = sanitize(data, cap.maxDepth);
  if (!copy.ok) return fail(copy.issue);

  if (typeof input !== 'string') {
    const bytes = utf8Length(JSON.stringify(copy.value));
    if (bytes > cap.maxBytes) {
      return fail(
        issue(
          'too-large',
          `The deck is ${bytes} bytes; the limit is ${cap.maxBytes}.`,
          'Shorten notes or split the deck.'
        )
      );
    }
  }

  const root = copy.value;
  if (root === null || typeof root !== 'object' || Array.isArray(root)) {
    return fail(
      issue('invalid-input', 'A deck is a JSON object.', 'Pass { "style": {…}, "slides": […] }.')
    );
  }
  const slides = (root as { slides?: unknown }).slides;
  if (Array.isArray(slides)) {
    if (slides.length > cap.maxSlides) {
      return fail(
        issue(
          'too-many',
          `The deck has ${slides.length} slides; the limit is ${cap.maxSlides}.`,
          'Split it into several decks.',
          ['slides']
        )
      );
    }
    const blocks = countBlockNodes(slides, cap.maxBlockNodes);
    if (blocks > cap.maxBlockNodes) {
      return fail(
        issue(
          'too-many',
          `Free slides hold more than ${cap.maxBlockNodes} block nodes.`,
          'Use fewer or simpler blocks.',
          ['slides']
        )
      );
    }
  }

  const parsed = safeParseDeck(root);
  if (parsed.success) return { success: true, deck: parsed.deck, issues: [] };
  return fail(
    ...parsed.issues.map((item) =>
      issue(
        item.code === 'unsafe-key' ? 'unsafe-key' : 'invalid-deck',
        item.message,
        'Fix the value at this path.',
        item.path
      )
    )
  );
}
