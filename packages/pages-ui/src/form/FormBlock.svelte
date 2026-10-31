<script lang="ts">
import type { FormBlock as FormBlockData } from '@protoyard/blocks';
import type { FormServices } from '@protoyard/pages';
import { type FormSubmitResult, SchemaForm, type SchemaFormSubmission } from '@texuli/forms';
import { validateFormSchema } from '@texuli/forms/model';
import { formBlockResponse, formBlockSchema, responseIssues } from './schema.ts';

/**
 * A form block painted by `@texuli/forms` (`SchemaForm`): required, length,
 * range and option checks, the focused error summary and the confirmation
 * come from Texuli. Every response is sent through the canonical
 * `@protoyard/pages` response service, which validates it again and stores
 * it; its per-field issues land inline.
 */
let {
  form,
  services,
  class: className = '',
}: {
  form: FormBlockData;
  /** The canonical @protoyard/pages response service; the UI never writes storage. */
  services: Pick<FormServices, 'submit'>;
  class?: string;
} = $props();

const compiled = $derived.by(() => {
  const result = validateFormSchema(formBlockSchema(form), { tier: 'developer' });
  return result.ok ? result.form : null;
});

async function submit({ values }: SchemaFormSubmission): Promise<FormSubmitResult> {
  try {
    await services.submit(form.id, formBlockResponse(form, values));
    return { ok: true };
  } catch (error) {
    const issues = responseIssues(error);
    if (issues) {
      const { form: formMessage, ...fields } = issues;
      return {
        ok: false,
        errors: fields,
        ...(formMessage ? { message: formMessage } : {}),
      };
    }
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Your response could not be submitted.',
    };
  }
}
</script>

{#if compiled}
  <SchemaForm
    form={compiled}
    onSubmit={submit}
    labels={{ submitted: form.successMessage }}
    headingLevel={2}
    aria-label={form.title ? undefined : compiled.schema.title}
    class={['py-form-block', className]}
    data-py-form={form.id}
    data-py-form-untitled={form.title ? undefined : ''}
  />
{:else}
  <p class="text-sm text-destructive" role="alert" data-py-form-error>
    This form could not be shown.
  </p>
{/if}

<style>
  /* An untitled block keeps its submit label as the form's accessible name only. */
  :global(.py-form-block[data-py-form-untitled] .tx-forms__title) {
    display: none;
  }
  :global(.py-form-block) {
    --tx-forms-max-inline-size: none;
  }
</style>
