import {
  copyPlainData,
  loadUntrustedDeck as loadModelDeck,
  stripHiddenCharacters,
} from '@texuli/deck/model';
import { DECK_LIMITS, type Deck, safeParseDeck } from './schema/index.ts';

export { stripHiddenCharacters };

/**
 * Loading a deck from somewhere it could have been tampered with: a share
 * link, a pasted file, an embed message, an artifact. The bounded part is
 * `@texuli/deck`'s untrusted loader, so a hostile input never costs a deep
 * recursive parse:
 *
 * 1. size (UTF-8 bytes of the JSON) and nesting depth, scanned on the text;
 * 2. a plain-data copy: no accessors, holes, cycles, class instances or
 *    prototype keys, and strings stripped of hidden characters (controls,
 *    zero-width and bidirectional overrides; newlines and tabs stay);
 * 3. counts: slides, and nodes under the slides;
 * 4. then Protoyard's `safeParseDeck` on the copy: its deck shape and offline
 *    media policy, and the deck model's validation of the migrated deck.
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

const BOUND_CODES: ReadonlySet<string> = new Set([
  'invalid-input',
  'invalid-json',
  'too-large',
  'too-deep',
  'too-many',
  'unsafe-key',
  'cycle',
  'not-finite',
]);

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

function protoyardCode(code: string): UntrustedDeckIssueCode {
  if (code === 'cycle' || code === 'not-finite') return 'invalid-input';
  return code as UntrustedDeckIssueCode;
}

export function loadUntrustedDeck(
  input: unknown,
  limits: Partial<UntrustedDeckLimits> = {}
): UntrustedDeckResult {
  const cap = { ...DEFAULT_UNTRUSTED_DECK_LIMITS, ...limits };
  // 1–3: the deck model's bounded loader (text scans, the plain copy, counts).
  const bounded = loadModelDeck(input, {
    maxBytes: cap.maxBytes,
    maxDepth: cap.maxDepth,
    maxSlides: cap.maxSlides,
    maxNodes: cap.maxBlockNodes,
  });
  const refused = bounded.issues.filter(
    (item) => item.severity === 'error' && BOUND_CODES.has(item.code) && !bounded.from
  );
  if (refused.length > 0) {
    return fail(
      ...refused.map((item) =>
        issue(protoyardCode(item.code), item.message, item.fix ?? 'Fix the value at this path.', [
          ...item.path,
        ])
      )
    );
  }

  // 4: the same plain copy, kept in Protoyard's shape, through Protoyard's schema.
  let data: unknown = input;
  if (typeof input === 'string') data = JSON.parse(input);
  const copy = copyPlainData(data, { maxDepth: cap.maxDepth, strip: true });
  const root = copy.value;
  if (copy.failed || root === null || typeof root !== 'object' || Array.isArray(root)) {
    return fail(
      issue('invalid-input', 'A deck is a JSON object.', 'Pass { "style": {…}, "slides": […] }.')
    );
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
