import { FORMULA_LIMITS } from './schema.ts';
import type { Condition, FormulaInputs, FormulaUnit, NumberFormula } from './types.ts';

/*
 * A pure interpreter over the closed grammar. It reads only the node fields
 * and own input properties, never throws, and gives `null` for anything
 * undefined: a missing input, division by zero, NaN or ±Infinity, an
 * exponent beyond the cap, or `clamp` with min > max. `null` propagates
 * through every operation, so one empty input blanks an output instead of
 * showing a wrong number.
 */

/** Finite numbers stay; −0 becomes 0; everything else is null. */
function finite(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  return value === 0 ? 0 : value;
}

function readInput(inputs: FormulaInputs, name: string): number | null {
  if (!Object.hasOwn(inputs, name)) return null;
  const value = inputs[name];
  return typeof value === 'number' ? finite(value) : null;
}

/** Rounds half away from zero to `digits` decimals (negative: tens, hundreds…). */
export function roundTo(value: number, digits = 0): number | null {
  const factor = 10 ** Math.abs(digits);
  const scaled = digits >= 0 ? Math.abs(value) * factor : Math.abs(value) / factor;
  // The epsilon absorbs binary noise such as 1.005 * 100 = 100.49999999999999.
  const rounded = Math.round(scaled + scaled * Number.EPSILON);
  const result = Math.sign(value) * (digits >= 0 ? rounded / factor : rounded * factor);
  return finite(result);
}

function number(node: NumberFormula, inputs: FormulaInputs, depth: number): number | null {
  // Unvalidated input may leave a child missing; treat it as undefined.
  if (node === null || typeof node !== 'object' || depth > FORMULA_LIMITS.depth) return null;
  const next = depth + 1;
  switch (node.op) {
    case 'num':
      return typeof node.value === 'number' ? finite(node.value) : null;
    case 'var':
      return typeof node.name === 'string' ? readInput(inputs, node.name) : null;
    case 'add':
    case 'sub':
    case 'mul':
    case 'div': {
      const left = number(node.left, inputs, next);
      const right = number(node.right, inputs, next);
      if (left === null || right === null) return null;
      if (node.op === 'add') return finite(left + right);
      if (node.op === 'sub') return finite(left - right);
      if (node.op === 'mul') return finite(left * right);
      return right === 0 ? null : finite(left / right);
    }
    case 'pow': {
      const base = number(node.base, inputs, next);
      const exponent = number(node.exponent, inputs, next);
      if (base === null || exponent === null) return null;
      if (Math.abs(exponent) > FORMULA_LIMITS.exponent) return null;
      return finite(base ** exponent);
    }
    case 'min':
    case 'max': {
      if (!Array.isArray(node.args) || node.args.length === 0) return null;
      let result: number | null = null;
      for (const arg of node.args.slice(0, FORMULA_LIMITS.args)) {
        const value = number(arg, inputs, next);
        if (value === null) return null;
        if (result === null) result = value;
        else result = node.op === 'min' ? Math.min(result, value) : Math.max(result, value);
      }
      return result;
    }
    case 'round': {
      const value = number(node.value, inputs, next);
      const digits = node.digits ?? 0;
      if (value === null || !Number.isInteger(digits)) return null;
      if (Math.abs(digits) > FORMULA_LIMITS.roundDigits) return null;
      return roundTo(value, digits);
    }
    case 'clamp': {
      const value = number(node.value, inputs, next);
      const min = number(node.min, inputs, next);
      const max = number(node.max, inputs, next);
      if (value === null || min === null || max === null || min > max) return null;
      return Math.min(max, Math.max(min, value));
    }
    case 'if': {
      const test = condition(node.test, inputs, next);
      if (test === null) return null;
      return number(test ? node.ifTrue : node.ifFalse, inputs, next);
    }
    default:
      return null;
  }
}

function condition(node: Condition, inputs: FormulaInputs, depth: number): boolean | null {
  if (node === null || typeof node !== 'object' || depth > FORMULA_LIMITS.depth) return null;
  const next = depth + 1;
  switch (node.op) {
    case 'lt':
    case 'lte':
    case 'gt':
    case 'gte':
    case 'eq':
    case 'neq': {
      const left = number(node.left, inputs, next);
      const right = number(node.right, inputs, next);
      if (left === null || right === null) return null;
      if (node.op === 'lt') return left < right;
      if (node.op === 'lte') return left <= right;
      if (node.op === 'gt') return left > right;
      if (node.op === 'gte') return left >= right;
      if (node.op === 'eq') return left === right;
      return left !== right;
    }
    case 'and':
    case 'or': {
      if (!Array.isArray(node.args) || node.args.length === 0) return null;
      // Three-valued logic: a decided operand wins over an undefined one.
      let unknown = false;
      for (const arg of node.args.slice(0, FORMULA_LIMITS.args)) {
        const value = condition(arg, inputs, next);
        if (value === null) unknown = true;
        else if (node.op === 'and' && !value) return false;
        else if (node.op === 'or' && value) return true;
      }
      return unknown ? null : node.op === 'and';
    }
    case 'not': {
      const value = condition(node.value, inputs, next);
      return value === null ? null : !value;
    }
    default:
      return null;
  }
}

/**
 * Evaluates a formula (validate it first with `parseFormula`). Returns a
 * finite number, or `null` when the result is undefined. Never throws.
 */
export function evaluateFormula(formula: NumberFormula, inputs: FormulaInputs): number | null {
  return number(formula, inputs, 1);
}

/** Evaluates a condition on its own, with the same rules. */
export function evaluateCondition(test: Condition, inputs: FormulaInputs): boolean | null {
  return condition(test, inputs, 1);
}

export interface FormatFormulaOptions {
  /** Three-letter currency for `cents` (default USD). */
  currency?: string;
  /** BCP 47 locale (default en-US, so output is stable across machines). */
  locale?: string;
  /** Maximum fraction digits for `number` and `percent`. */
  maximumFractionDigits?: number;
  /** Shown for null results (default an em dash). */
  empty?: string;
}

/**
 * Formats a result with the chart-spec unit set: `cents` are integer minor
 * units (1250 → $12.50), `percent` is a ratio (0.25 → 25%), `compact` is
 * 1.2K/3.4M.
 */
export function formatFormulaValue(
  value: number | null,
  unit: FormulaUnit = 'number',
  options: FormatFormulaOptions = {}
): string {
  if (value === null || !Number.isFinite(value)) return options.empty ?? '—';
  const locale = options.locale ?? 'en-US';
  const digits = options.maximumFractionDigits;
  switch (unit) {
    case 'cents':
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: options.currency ?? 'USD',
      }).format(value / 100);
    case 'percent':
      return new Intl.NumberFormat(locale, {
        style: 'percent',
        maximumFractionDigits: digits ?? 1,
      }).format(value);
    case 'compact':
      return new Intl.NumberFormat(locale, { notation: 'compact' }).format(value);
    default:
      return new Intl.NumberFormat(locale, { maximumFractionDigits: digits ?? 2 }).format(value);
  }
}
