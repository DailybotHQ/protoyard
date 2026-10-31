import { isValidationError, type ServiceResult } from '@protoyard/renderer-svelte';
import {
  type CompiledForm,
  type FormSchema,
  type FormSubmitResult,
  validateFormSchema,
} from '@texuli/forms/model';

/**
 * Small helpers for the SaaS kit forms painted by `@texuli/forms`. The kit
 * services stay the source of truth: Texuli checks the closed rules first,
 * then the submission goes through `runService` and the service's zod issues
 * come back as Texuli field errors.
 */

/** Compile a kit-authored schema; a mistake in it is a bug, so it throws with the issues. */
export function compileKitForm(schema: FormSchema): CompiledForm {
  const result = validateFormSchema(schema, { tier: 'developer' });
  if (!result.ok) {
    throw new Error(
      `Invalid kit form "${schema.title}": ${result.issues.map((i) => `${i.path} ${i.message}`).join('; ')}`
    );
  }
  return result.form;
}

/**
 * A `runService` result → what `SchemaForm`'s `onSubmit` returns. Issues on a
 * field the form has land on that field; anything else is a form-level message.
 */
export function kitSubmitResult(
  result: ServiceResult<unknown>,
  form: CompiledForm,
  fallback: string
): FormSubmitResult {
  if (result.ok) return { ok: true };
  const error = result.error;
  if (isValidationError(error)) {
    const errors: Record<string, string> = {};
    const other: string[] = [];
    for (const [path, message] of Object.entries(error.issues)) {
      const name = path.split('.')[0] ?? path;
      if (form.byName.has(name)) errors[name] ??= message;
      else other.push(message);
    }
    return {
      ok: false,
      errors,
      ...(other.length > 0 ? { message: other.join(' ') } : {}),
    };
  }
  return { ok: false, message: error instanceof Error ? error.message : fallback };
}
