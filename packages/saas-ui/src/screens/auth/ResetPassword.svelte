<script lang="ts">
import { runService } from '@protoyard/renderer-svelte';
import { createPasswordResetServices } from '@protoyard/saas';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@protoyard/ui';
import { SchemaForm, type SchemaFormSubmission } from '@texuli/forms';
import { onMount } from 'svelte';
import SimulatedPassword from '../../lib/SimulatedPassword.svelte';
import {
  compileKitForm,
  kitSubmitResult,
  passwordField,
  SIMULATED_PASSWORD_KIND,
  text,
} from '../../lib/schema-form.ts';
import { authServices, hashParam, routeHref } from './helpers.ts';

const { runtime, config } = authServices();
const reset = createPasswordResetServices(runtime);
let tokenId = $state('');
let complete = $state(false);
let message = $state('');
const customFields = { [SIMULATED_PASSWORD_KIND]: { component: SimulatedPassword } };

// Painted by @texuli/forms; the password reset service validates both steps.
const requestForm = compileKitForm({
  title: 'Request a reset link',
  submitLabel: 'Send reset link',
  fields: [
    {
      name: 'email',
      type: 'email',
      label: 'Email',
      required: true,
      autocomplete: 'email',
      description: 'Use an address at example.com.',
    },
  ],
});
const consumeForm = compileKitForm({
  title: 'Finish the reset',
  submitLabel: 'Save new password',
  fields: [
    passwordField('password', 'New password'),
    passwordField('confirmPassword', 'Confirm password'),
  ],
  rules: [
    {
      id: 'passwords-match',
      field: 'confirmPassword',
      message: 'Passwords do not match.',
      test: {
        op: 'eq',
        left: { op: 'field', name: 'confirmPassword' },
        right: { op: 'field', name: 'password' },
      },
    },
  ],
});

async function request({ values }: SchemaFormSubmission) {
  const result = await runService(() => reset.request({ email: text(values, 'email') }));
  if (!result.ok) {
    return kitSubmitResult(result, requestForm, 'The simulated request failed. Try again.');
  }
  complete = true;
  return { ok: true } as const;
}

async function consume({ values }: SchemaFormSubmission) {
  const result = await runService(() =>
    reset.consume({ tokenId, password: text(values, 'password') })
  );
  if (!result.ok) {
    return kitSubmitResult(result, consumeForm, 'The simulated request failed. Try again.');
  }
  message = 'Your simulated password was updated. You can sign in now.';
  complete = true;
  return { ok: true } as const;
}

onMount(() => {
  tokenId = hashParam('token');
});
</script>

<main class="mx-auto grid min-h-app w-full max-w-md content-center p-4 sm:p-8" data-testid="auth-reset-password">
  <Card>
    <CardHeader>
      <CardTitle>{tokenId ? 'Choose a new password' : 'Reset your password'}</CardTitle>
      <CardDescription>Simulated account recovery for this prototype.</CardDescription>
    </CardHeader>
    <CardContent>
      {#if complete}
        <div class="grid gap-3" role="status" data-testid="auth-handoff">
          <p>{message || 'Check your simulated inbox for a password reset link. Nothing was emailed.'}</p>
          {#if tokenId}<Button href={routeHref(config.signInPath)}>Go to sign in</Button>{/if}
        </div>
      {:else if tokenId}
        <SchemaForm
          form={consumeForm}
          onSubmit={consume}
          {customFields}
          labels={{ submitting: 'Updating password', submitted: 'Password updated.' }}
          class="py-saas-form"
          data-py-saas-form="reset-password"
          hideTitle
        />
      {:else}
        <SchemaForm
          form={requestForm}
          onSubmit={request}
          labels={{ submitting: 'Sending request', submitted: 'Reset link sent.' }}
          class="py-saas-form"
          data-py-saas-form="reset-request"
          hideTitle
        />
      {/if}
    </CardContent>
    <CardFooter><Button href={routeHref(config.signInPath)} variant="ghost">Back to sign in</Button></CardFooter>
  </Card>
  <p class="mt-4 text-center text-xs text-muted-foreground" data-testid="simulated-password-notice">Simulation only — do not use a real password. What you type is kept as plain text in this browser and in exported snapshots.</p>
</main>
