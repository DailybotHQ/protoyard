/**
 * The closed formula grammar for calculator blocks. A formula is plain JSON:
 * every node names its operation in `op`, and there is no string syntax, no
 * function call by name and no way to reach host objects. Numbers and
 * conditions are separate node kinds, so a condition can never be added and a
 * number can never be an `if` test.
 */

export type ArithmeticOp = 'add' | 'sub' | 'mul' | 'div';
export type ComparisonOp = 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'neq';

/** An expression that evaluates to a number, or `null` when undefined. */
export type NumberFormula =
  | { op: 'num'; value: number }
  | { op: 'var'; name: string }
  | { op: ArithmeticOp; left: NumberFormula; right: NumberFormula }
  | { op: 'pow'; base: NumberFormula; exponent: NumberFormula }
  | { op: 'min' | 'max'; args: NumberFormula[] }
  | { op: 'round'; value: NumberFormula; digits?: number | undefined }
  | { op: 'clamp'; value: NumberFormula; min: NumberFormula; max: NumberFormula }
  | { op: 'if'; test: Condition; ifTrue: NumberFormula; ifFalse: NumberFormula };

/** An expression that evaluates to true, false, or `null` when an operand is undefined. */
export type Condition =
  | { op: ComparisonOp; left: NumberFormula; right: NumberFormula }
  | { op: 'and' | 'or'; args: Condition[] }
  | { op: 'not'; value: Condition };

/** Input values by variable name. Missing, `null` and non-finite inputs are undefined. */
export type FormulaInputs = Readonly<Record<string, number | null | undefined>>;

/** One problem with a formula, addressed like blueprint authoring diagnostics. */
export interface FormulaDiagnostic {
  /** Stable category: `formula-too-large`, `formula-too-deep`, `type-mismatch`, `unknown-variable`… */
  code: string;
  path: (string | number)[];
  /** `$["left"]["right"]`, with keys quoted. */
  jsonPath: string;
  message: string;
  /** A next step the author can take. */
  hint: string;
}

export type FormulaParseResult =
  | { success: true; formula: NumberFormula; variables: string[]; diagnostics: [] }
  | { success: false; formula: null; variables: []; diagnostics: FormulaDiagnostic[] };

/** How a calculator output is shown; the same unit set as chart specs. */
export type FormulaUnit = 'number' | 'compact' | 'cents' | 'percent';
