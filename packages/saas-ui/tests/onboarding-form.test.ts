import { validateFormSchema } from '@texuli/forms/model';
import { describe, expect, it } from 'vitest';
import {
  defaultOnboardingSteps,
  onboardingFormSchema,
  REVIEW_FIELD,
  stepFormValues,
  stepValuesFromForm,
} from '../src/screens/onboarding/steps.ts';

const steps = defaultOnboardingSteps();
const options = (readOnly: (id: string) => boolean = () => false, custom = new Set<string>()) => ({
  title: 'Set up your account',
  doneLabel: 'Done',
  custom,
  readOnly: (step: { id: string }) => readOnly(step.id),
});

describe('onboarding wizard as a @texuli/forms schema', () => {
  it('compiles every default step plus the review, with positional field names', () => {
    const result = validateFormSchema(onboardingFormSchema(steps, options()), {
      tier: 'developer',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.form.schema.steps?.map((step) => step.title)).toEqual([
      'Profile',
      'Workspace',
      'Invite teammates',
      'Preferences',
      'Done',
    ]);
    expect(result.form.byName.get('s0_f0')?.field).toMatchObject({
      type: 'text',
      label: 'Full name',
      required: true,
      // The step's zod message, so Texuli's required check says the same thing.
      messages: { required: 'Enter your full name' },
    });
    expect(result.form.byName.get('s2_f0')?.field).toMatchObject({ type: 'textarea', rows: 3 });
    expect(result.form.byName.get('s3_f0')?.field.options?.map((o) => o.value)).toEqual([
      'system',
      'light',
      'dark',
    ]);
    expect(result.form.byName.get('review')?.field).toMatchObject({ kind: REVIEW_FIELD });
  });

  it('locks a read-only step and adds its note to the step description', () => {
    const schema = onboardingFormSchema(
      steps,
      options((id) => id === 'workspace')
    );
    const workspace = schema.steps?.[1];
    expect(workspace?.description).toMatch(/Only people who manage the workspace/);
    expect(workspace?.fields?.[0]?.when).toEqual({ enable: { op: 'bool', value: false } });
    expect(schema.steps?.[0]?.fields?.[0]?.when).toBeUndefined();
  });

  it('paints a snippet step as one custom field and round-trips its values', () => {
    const custom = new Set(['workspace']);
    const schema = onboardingFormSchema(steps, options(undefined, custom));
    expect(schema.steps?.[1]?.fields).toEqual([
      expect.objectContaining({ name: 's1_custom', type: 'custom', config: { step: 'workspace' } }),
    ]);
    const values = stepFormValues(
      steps,
      { profile: { fullName: 'Olivia Hart', jobTitle: '' }, workspace: { name: 'Hart Studio' } },
      custom
    );
    expect(values).toEqual({ s0_f0: 'Olivia Hart', s1_custom: { name: 'Hart Studio' } });
    const [profile, workspace] = steps;
    if (!profile || !workspace) throw new Error('The default steps changed');
    expect(stepValuesFromForm(profile, 0, values, custom)).toEqual({
      fullName: 'Olivia Hart',
      jobTitle: '',
    });
    expect(stepValuesFromForm(workspace, 1, values, custom)).toEqual({ name: 'Hart Studio' });
  });
});
