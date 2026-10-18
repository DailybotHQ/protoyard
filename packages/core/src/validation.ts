import type { z } from 'zod';

/**
 * Input validation for domain services. `ValidationError.issues` maps a field
 * path (`email`, `invites.1.email`, or `form` for root-level problems) to its
 * first message, so forms can render errors inline. `runService` from
 * `@protoyard/renderer-svelte` recognizes it through `isValidationError`
 * (any `Error` with an `issues` object) and leaves it to the form instead of
 * toasting it.
 */
export class ValidationError extends Error {
  readonly issues: Record<string, string>;
  constructor(issues: Record<string, string>) {
    super(Object.values(issues)[0] ?? 'Invalid input');
    this.name = 'ValidationError';
    this.issues = issues;
  }
}

/** Joins a zod issue path into a field key: `['invites', 1, 'email']` → `invites.1.email`. */
function issueKey(path: readonly PropertyKey[]): string {
  return path.map((segment) => String(segment)).join('.') || 'form';
}

/**
 * Parses `input` with `schema` and returns the (transformed) output, or throws
 * a `ValidationError` whose `issues` keep the first message per field path.
 */
export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issues: Record<string, string> = {};
  for (const issue of result.error.issues) {
    issues[issueKey(issue.path)] ??= issue.message;
  }
  throw new ValidationError(issues);
}
