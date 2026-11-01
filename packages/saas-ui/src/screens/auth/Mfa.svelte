<script lang="ts">
import { navigate, nextPath, runService } from '@protoyard/renderer-svelte';
import { createMfaServices, MfaCodeSchema, RecoveryCodeInputSchema } from '@protoyard/saas';
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
import { compileKitForm, kitSubmitResult, text } from '../../lib/schema-form.ts';
import { authServices, hashParam, routeHref } from './helpers.ts';

const { runtime, config } = authServices();
const mfa = createMfaServices(runtime);
let challengeId = $state('');
let challengeEmail = $state('');
let recovery = $state(false);
let simulatedCode = $state('');
let message = $state('');

// Painted by @texuli/forms (a one-time code, or a recovery code); the MFA service decides.
const codeForm = compileKitForm({
  title: 'Verify with the simulated authenticator',
  submitLabel: 'Verify and sign in',
  fields: [
    {
      name: 'code',
      type: 'otp',
      label: 'Authenticator code',
      required: true,
      length: 6,
      messages: { format: 'Enter the 6-digit simulated code' },
    },
  ],
});
const recoveryForm = compileKitForm({
  title: 'Verify with a recovery code',
  submitLabel: 'Verify and sign in',
  fields: [
    {
      name: 'recoveryCode',
      type: 'text',
      label: 'Recovery code',
      required: true,
      autocomplete: 'off',
      minLength: 6,
      maxLength: 32,
      messages: { required: 'Enter a recovery code', minLength: 'Enter a recovery code' },
    },
  ],
});
const form = $derived(recovery ? recoveryForm : codeForm);

async function complete({ values }: SchemaFormSubmission) {
  const field = recovery ? 'recoveryCode' : 'code';
  // The kit's own schemas stay the rule; Texuli's checks only catch it earlier.
  const parsed = (recovery ? RecoveryCodeInputSchema : MfaCodeSchema).safeParse(
    text(values, field)
  );
  if (!parsed.success) {
    return {
      ok: false,
      errors: { [field]: parsed.error.issues[0]?.message ?? 'Enter a valid code.' },
    } as const;
  }
  if (!challengeId) {
    return {
      ok: false,
      message: 'Open this challenge from a password, magic-link or SSO sign-in.',
    } as const;
  }
  const result = await runService(() =>
    mfa.completeChallenge(
      challengeId,
      recovery ? { recoveryCode: parsed.data } : { code: parsed.data }
    )
  );
  if (!result.ok) return kitSubmitResult(result, form, 'The simulated request failed. Try again.');
  navigate(nextPath(new URLSearchParams(location.hash.split('?')[1] ?? ''), config.homePath));
}

onMount(() => {
  // Only a single-use challenge from a successful first factor opens this
  // step; an account id in the URL is never accepted (simulation, not security).
  challengeId = hashParam('challenge');
  if (!challengeId) {
    message = 'Open this challenge from a password, magic-link or SSO sign-in.';
    return;
  }
  void mfa
    .describeChallenge(challengeId)
    .then((view) => {
      if (view) {
        simulatedCode = view.code;
        challengeEmail = view.email;
      } else {
        message =
          'This verification step is not valid, was already used or has expired. Sign in again.';
      }
    })
    .catch((error: unknown) => {
      message = error instanceof Error ? error.message : 'The simulated challenge could not load.';
    });
});
</script>

<main class="mx-auto grid min-h-app w-full max-w-md content-center p-4 sm:p-8" data-testid="auth-mfa">
  <Card>
    <CardHeader>
      <CardTitle>Verify it is you</CardTitle>
      <CardDescription>
        Enter a code from the simulated authenticator to finish signing in{challengeEmail ? ` as ${challengeEmail}` : ''}.
      </CardDescription>
    </CardHeader>
    <CardContent class="grid gap-4">
      {#if simulatedCode && !recovery}
        <div class="rounded-lg border bg-muted/40 p-3" role="note" data-testid="auth-simulated-code">
          <p class="text-xs text-muted-foreground">Simulated authenticator code</p>
          <p class="font-mono text-lg tracking-widest">{simulatedCode}</p>
          <p class="text-xs text-muted-foreground">Simulation only — this is not a real TOTP code.</p>
        </div>
      {/if}
      {#key recovery}
        <SchemaForm
          {form}
          onSubmit={complete}
          labels={{ submitting: 'Verifying code', submitted: 'Verified. Signing you in…' }}
          class="py-saas-form"
          data-py-saas-form="mfa"
          disabled={!challengeId}
          hideTitle
        />
      {/key}
      <Button variant="ghost" onclick={() => (recovery = !recovery)}>
        {recovery ? 'Use an authenticator code' : 'Use a recovery code'}
      </Button>
      {#if message}<p role="alert" class="text-sm text-destructive">{message}</p>{/if}
    </CardContent>
    <CardFooter><Button href={routeHref(config.signInPath)} variant="ghost">Return to sign in</Button></CardFooter>
  </Card>
</main>
