/**
 * `@protoyard/blocks/formula` — the safe formula engine behind calculator
 * blocks (ADR-037). A formula is a closed JSON AST with separate number and
 * condition nodes, bounded to 64 nodes and 12 levels. `parseFormula`
 * validates untrusted JSON with path-addressed diagnostics; `evaluateFormula`
 * is a pure interpreter that returns a finite number or `null`. There is no
 * string syntax and nothing is ever executed: formulas are data, never code.
 *
 * ```ts
 * const parsed = parseFormula(
 *   { op: 'mul', left: { op: 'var', name: 'seats' }, right: { op: 'num', value: 1200 } },
 *   { variables: ['seats'] }
 * );
 * if (parsed.success) formatFormulaValue(evaluateFormula(parsed.formula, { seats: 8 }), 'cents');
 * // → "$96.00"
 * ```
 */
export {
  evaluateCondition,
  evaluateFormula,
  type FormatFormulaOptions,
  formatFormulaValue,
  roundTo,
} from './evaluate.ts';
export {
  ConditionSchema,
  FORMULA_LIMITS,
  FormulaVariableNameSchema,
  formulaJsonPath,
  formulaVariables,
  NumberFormulaSchema,
  type ParseFormulaOptions,
  parseFormula,
} from './schema.ts';
export type {
  ArithmeticOp,
  ComparisonOp,
  Condition,
  FormulaDiagnostic,
  FormulaInputs,
  FormulaParseResult,
  FormulaUnit,
  NumberFormula,
} from './types.ts';
