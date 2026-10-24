/**
 * Zod adapters over `@texuli/blocks/formula` types and limits.
 * Calculator block schemas use these; parse/evaluate come from Texuli.
 */
import { type Condition, FORMULA_LIMITS, type NumberFormula } from '@texuli/blocks/formula';
import { z } from 'zod';

const RESERVED_VARIABLE_NAMES = new Set(['constructor', 'prototype']);

/** A formula variable: lowerCamelCase, like calculator input and form field names. */
export const FormulaVariableNameSchema = z
  .string()
  .regex(/^[a-z][a-zA-Z0-9]{0,31}$/, 'Use a lowerCamelCase name of at most 32 characters')
  .refine((name) => !RESERVED_VARIABLE_NAMES.has(name), {
    message: '"constructor" and "prototype" are reserved; choose another name',
  });

export const NumberFormulaSchema: z.ZodType<NumberFormula> = z.lazy(() =>
  z.discriminatedUnion('op', [
    z.strictObject({
      op: z.literal('num'),
      value: z.number().finite().min(-FORMULA_LIMITS.literal).max(FORMULA_LIMITS.literal),
    }),
    z.strictObject({ op: z.literal('var'), name: FormulaVariableNameSchema }),
    ...(['add', 'sub', 'mul', 'div'] as const).map((op) =>
      z.strictObject({ op: z.literal(op), left: NumberFormulaSchema, right: NumberFormulaSchema })
    ),
    z.strictObject({
      op: z.literal('pow'),
      base: NumberFormulaSchema,
      exponent: NumberFormulaSchema,
    }),
    ...(['min', 'max'] as const).map((op) =>
      z.strictObject({
        op: z.literal(op),
        args: z.array(NumberFormulaSchema).min(2).max(FORMULA_LIMITS.args),
      })
    ),
    z.strictObject({
      op: z.literal('round'),
      value: NumberFormulaSchema,
      digits: z
        .number()
        .int()
        .min(-FORMULA_LIMITS.roundDigits)
        .max(FORMULA_LIMITS.roundDigits)
        .optional(),
    }),
    z.strictObject({
      op: z.literal('clamp'),
      value: NumberFormulaSchema,
      min: NumberFormulaSchema,
      max: NumberFormulaSchema,
    }),
    z.strictObject({
      op: z.literal('if'),
      test: ConditionSchema,
      ifTrue: NumberFormulaSchema,
      ifFalse: NumberFormulaSchema,
    }),
  ])
);

export const ConditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.discriminatedUnion('op', [
    z.strictObject({ op: z.literal('not'), value: ConditionSchema }),
    ...(['lt', 'lte', 'gt', 'gte', 'eq', 'neq'] as const).map((op) =>
      z.strictObject({ op: z.literal(op), left: NumberFormulaSchema, right: NumberFormulaSchema })
    ),
    ...(['and', 'or'] as const).map((op) =>
      z.strictObject({
        op: z.literal(op),
        args: z.array(ConditionSchema).min(2).max(FORMULA_LIMITS.args),
      })
    ),
  ])
);
