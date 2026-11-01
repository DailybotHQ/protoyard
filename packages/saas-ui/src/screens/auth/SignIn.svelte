<script lang="ts">
import { navigate, nextPath, runService } from '@protoyard/renderer-svelte';
import { createMfaServices } from '@protoyard/saas';
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
import SsoButtons from '../../components/SsoButtons.svelte';
import SimulatedPassword from '../../lib/SimulatedPassword.svelte';
import {
  compileKitForm,
  kitSubmitResult,
  passwordField,
  SIMULATED_PASSWORD_KIND,
  text,
} from '../../lib/schema-form.ts';
import { authServices, routeHref } from './helpers.ts';

const { runtime, config } = authServices();
const mfa = createMfaServices(runtime);

// Painted by @texuli/forms; the MFA service checks the simulated credentials.
const form = compileKitForm({
  title: 'Account sign-in',
  submitLabel: 'Sign in',
  fields: [
    { name: 'email', type: 'email', label: 'Email', required: true, autocomplete: 'email' },
    passwordField('password', 'Password'),
  ],
});

async function submit({ values }: SchemaFormSubmission) {
  const result = await runService(() =>
    mfa.signInWithPassword({ email: text(values, 'email'), password: text(values, 'password') })
  );
  if (!result.ok) return kitSubmitResult(result, form, 'The simulated request failed. Try again.');
  const next = nextPath(new URLSearchParams(location.hash.split('?')[1] ?? ''), config.homePath);
  if (result.value.status === 'mfa-required') {
    navigate(
      `/auth/mfa?challenge=${encodeURIComponent(result.value.challenge.id)}&next=${encodeURIComponent(next)}`
    );
    return;
  }
  navigate(next);
}
</script>

<main class="mx-auto grid min-h-app w-full max-w-md content-center p-4 sm:p-8" data-testid="auth-sign-in">
  <Card>
    <CardHeader>
      <CardTitle>Sign in</CardTitle>
      <CardDescription>Email and password for this simulated prototype account.</CardDescription>
    </CardHeader>
    <CardContent>
      <SchemaForm
        {form}
        onSubmit={submit}
        customFields={{ [SIMULATED_PASSWORD_KIND]: { component: SimulatedPassword } }}
        labels={{ submitting: 'Signing in', submitted: 'Signed in. Opening your app…' }}
        class="py-saas-form"
        data-py-saas-form="sign-in"
        hideTitle
      />
      {#if config.ssoProviders.length > 0}
        <div class="mt-6 grid gap-3" data-testid="auth-sso">
          <p class="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true"><span class="h-px flex-1 bg-border"></span>or<span class="h-px flex-1 bg-border"></span></p>
          <SsoButtons providers={config.ssoProviders} intent="sign-in" />
        </div>
      {/if}
    </CardContent>
    <CardFooter class="flex flex-wrap justify-between gap-2">
      <Button href={routeHref(config.signUpPath)} variant="ghost">Create account</Button>
      <Button href="#/auth/magic" variant="outline">Use a magic link</Button>
      <Button href="#/auth/phone" variant="outline">Continue with a phone number</Button>
    </CardFooter>
    <CardFooter>
      <Button href="#/auth/reset" variant="link">Forgot password?</Button>
    </CardFooter>
  </Card>
  <p class="mt-4 text-center text-xs text-muted-foreground" data-testid="simulated-password-notice">Simulation only — do not use a real password. What you type is kept as plain text in this browser and in exported snapshots.</p>
</main>
