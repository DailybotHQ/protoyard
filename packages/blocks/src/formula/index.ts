/**
 * `@protoyard/blocks/formula` — thin re-export of `@texuli/blocks/formula`
 * (closed AST engine) plus Zod schema adapters for calculator block schemas.
 *
 * ```ts
 * const parsed = parseFormula(
 *   { op: 'mul', left: { op: 'var', name: 'seats' }, right: { op: 'num', value: 1200 } },
 *   { variables: ['seats'] }
 * );
 * if (parsed.success) formatFormulaValue(evaluateFormula(parsed.formula, { seats: 8 }), 'cents');
 * ```
 */

export {
  type ArithmeticOp,
  type ComparisonOp,
  type Condition,
  evaluateCondition,
  evaluateFormula,
  FORMULA_LIMITS,
  type FormatFormulaOptions,
  type FormulaDiagnostic,
  type FormulaInputs,
  type FormulaParseResult,
  type FormulaUnit,
  formatFormulaValue,
  formulaJsonPath,
  formulaVariables,
  type NumberFormula,
  type ParseFormulaOptions,
  parseFormula,
  roundTo,
} from '@texuli/blocks/formula';

export {
  ConditionSchema,
  FormulaVariableNameSchema,
  NumberFormulaSchema,
} from './zod.ts';
