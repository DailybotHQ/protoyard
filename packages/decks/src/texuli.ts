/**
 * The bridge to `@texuli/deck` (Texuli ADR-009). Protoyard stores decks in
 * its own shape (`{ style, slides, outline? }` inside a `kind: "deck"`
 * blueprint); Texuli owns the deck model, its validation, the layout
 * catalog, steps, navigation and lint. Every check that is not Protoyard's
 * own policy goes through here: the Protoyard deck is migrated with
 * `migrateDeck` (detected as `protoyard`) and validated with `parseDeck`.
 *
 * Pure and DOM-free; it never throws.
 */
import {
  detectDeckShape,
  migrateDeck,
  type ParseDeckOptions,
  parseDeck,
  type Deck as TexuliDeck,
  type DeckParseResult as TexuliParseResult,
} from '@texuli/deck/model';
import type { DeckDiagnostic } from '@texuli/deck/schema';

export type { DeckDiagnostic } from '@texuli/deck/schema';
export type { TexuliDeck };

export interface ProtoyardDeckCheck {
  /** The model v2 deck the Protoyard deck migrates to (only when it validates). */
  deck?: TexuliDeck;
  /** Errors from migration and `parseDeck`, with paths into the Protoyard deck. */
  errors: DeckDiagnostic[];
  /** Warnings (`migrated` notes are dropped: migrating a Protoyard deck is expected). */
  warnings: DeckDiagnostic[];
  /** The full `parseDeck` result (steps per slide included). */
  result: TexuliParseResult | null;
}

/**
 * Migrate a Protoyard deck to model v2 and validate it. Only a Protoyard
 * shape is accepted: a v2 deck or another earlier shape is not a Protoyard
 * blueprint body.
 */
export function checkProtoyardDeck(
  input: unknown,
  options: ParseDeckOptions = {}
): ProtoyardDeckCheck {
  const shape = detectDeckShape(input);
  if (shape !== 'protoyard') {
    return {
      errors: [
        {
          code: 'invalid-deck',
          severity: 'error',
          path: [],
          jsonPath: '$',
          pointer: '',
          message: 'Expected a Protoyard deck: { style, slides, outline? }.',
          fix: 'Start from {"style": {}, "slides": [{"id": "cover", "layout": "title-hero", "props": {"title": "…"}}]}.',
        },
      ],
      warnings: [],
      result: null,
    };
  }
  const migration = migrateDeck(input);
  const result = parseDeck(migration.deck, options);
  const errors = result.issues.filter((issue) => issue.severity === 'error');
  const warnings = result.issues.filter(
    (issue) => issue.severity !== 'error' && issue.code !== 'migrated'
  );
  return { ...(result.ok && result.deck ? { deck: result.deck } : {}), errors, warnings, result };
}

/**
 * The model v2 deck a validated Protoyard deck presents as. Unvalidated
 * input goes through {@link checkProtoyardDeck} instead.
 */
export function toTexuliDeck(deck: unknown): TexuliDeck {
  return migrateDeck(deck).deck as TexuliDeck;
}
