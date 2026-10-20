/** The closed JSON AST used for deterministic, read-time computed values. */
export type ComputedExpression =
  | { op: 'literal'; value: string | number | boolean | null }
  | { op: 'field'; field: string }
  | {
      op: 'add' | 'subtract' | 'multiply' | 'divide';
      left: ComputedExpression;
      right: ComputedExpression;
    }
  | { op: 'concat'; values: ComputedExpression[] }
  | {
      op: 'dateDiff';
      start: ComputedExpression;
      end: ComputedExpression;
      unit: 'milliseconds' | 'seconds' | 'minutes' | 'hours' | 'days';
    }
  | {
      op: 'aggregate';
      relation: string;
      aggregate: 'count' | 'sum' | 'avg' | 'min' | 'max';
      field?: string;
    };

/** Static types supported by computed expressions. */
export type ComputedValueType = 'number' | 'string' | 'boolean' | 'date' | 'null';

/** JSON-compatible computed result; missing input values propagate as null. */
export type ComputedValue = string | number | boolean | null;

export type ComputedDiagnostic = {
  code: string;
  path: (string | number)[];
  jsonPath: string;
  message: string;
  hint: string;
};

export type ComputedExpressionContext = {
  /** Entity whose row is passed to field expressions. */
  sourceEntity: {
    name: string;
    fields: readonly { name: string; kind: string; required?: boolean; to?: string }[];
  };
  /** All blueprint entities, used to resolve relation targets. */
  entities: readonly {
    name: string;
    fields: readonly { name: string; kind: string; required?: boolean; to?: string }[];
  }[];
};

export type ComputedValidationResult = {
  valid: boolean;
  diagnostics: ComputedDiagnostic[];
  resultType: ComputedValueType | null;
  nullable: boolean;
};

export type ComputedEvaluationContext = ComputedExpressionContext & {
  /** Current entity row. Values are read only and never mutated. */
  row: Readonly<Record<string, unknown>>;
  /** Related records grouped by relation field name; many relations use arrays. */
  relations?: Readonly<Record<string, unknown>>;
};
