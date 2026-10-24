# Formula from `@texuli/blocks/formula`

`@protoyard/blocks/formula` re-exports the closed formula engine from
`@texuli/blocks/formula` (parse, evaluate, limits, types).

Zod schemas (`NumberFormulaSchema`, `ConditionSchema`,
`FormulaVariableNameSchema`) stay here as thin adapters for calculator block
schemas that need `.safeParse`.
