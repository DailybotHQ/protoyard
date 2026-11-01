<script lang="ts">
import { navigate, nextPath, runService } from '@protoyard/renderer-svelte';
import { createPhoneServices, PHONE_CODE_TOAST_ID } from '@protoyard/saas';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  toast,
} from '@protoyard/ui';
import { SchemaForm, type SchemaFormSubmission } from '@texuli/forms';
import { compileKitForm, kitSubmitResult, text } from '../lib/schema-form.ts';
import TelInput from '../lib/TelInput.svelte';
import { authServices, routeHref } from './auth/helpers.ts';

const { runtime, config } = authServices();
const phone = createPhoneServices(runtime);

// Painted by @texuli/forms; the phone service validates the number (one rule, one place).
const form = compileKitForm({
  title: 'Continue with your phone',
  submitLabel: 'Send simulated code',
  fields: [
    { name: 'name', type: 'text', label: 'Name', required: true, autocomplete: 'name' },
    {
      name: 'phone',
      type: 'custom',
      kind: 'tel',
      label: 'Phone number',
      required: true,
      description: 'Use an international number, for example +1 202 555 0100.',
    },
  ],
});

async function submit({ values }: SchemaFormSubmission) {
  const result = await runService(() =>
    phone.sendCode({ phone: text(values, 'phone'), name: text(values, 'name') })
  );
  if (!result.ok) return kitSubmitResult(result, form, 'The simulated request failed. Try again.');
  toast.info('Simulated SMS code', {
    id: PHONE_CODE_TOAST_ID,
    duration: 0,
    description: `Your code is ${result.value.code}. No SMS was sent.`,
  });
  const next = nextPath(new URLSearchParams(location.hash.split('?')[1] ?? ''), config.homePath);
  navigate(
    `/auth/phone/code?challenge=${encodeURIComponent(result.value.challengeId)}&next=${encodeURIComponent(next)}`
  );
}
</script>

<main class="mx-auto grid min-h-app w-full max-w-md content-center p-4 sm:p-8" data-testid="auth-phone-sign-in">
  <Card>
    <CardHeader>
      <CardTitle>Continue with your phone</CardTitle>
      <CardDescription>Enter a name and phone number to start or return to a simulated phone account.</CardDescription>
    </CardHeader>
    <CardContent>
      <SchemaForm
        {form}
        onSubmit={submit}
        customFields={{ tel: { component: TelInput } }}
        labels={{ submitting: 'Sending code', submitted: 'Code sent.' }}
        class="py-saas-form"
        data-py-saas-form="phone-sign-in"
        hideTitle
      />
    </CardContent>
    <CardFooter class="justify-between gap-2">
      <Button href={routeHref(config.signInPath)} variant="ghost">Back to sign in</Button>
    </CardFooter>
  </Card>
  <p class="mt-4 text-center text-xs text-muted-foreground">Simulation only — no SMS is sent and this is not account security.</p>
</main>
