<script lang="ts">
import { runService } from '@protoyard/renderer-svelte';
import { createAuthServices } from '@protoyard/saas';
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
const auth = createAuthServices(runtime);
let email = $state('');
let complete = $state(false);
let created = $state<{ id: string; email: string } | null>(null);

// Painted by @texuli/forms; the auth service validates and creates the account.
const form = compileKitForm({
  title: 'Account details',
  submitLabel: 'Create account',
  fields: [
    { name: 'name', type: 'text', label: 'Name', required: true, autocomplete: 'name' },
    {
      name: 'email',
      type: 'email',
      label: 'Email',
      required: true,
      autocomplete: 'email',
      description: 'Use an address at example.com.',
    },
    passwordField('password', 'Password'),
  ],
});

async function submit({ values }: SchemaFormSubmission) {
  email = text(values, 'email');
  const result = await runService(() =>
    auth.signUp({ name: text(values, 'name'), email, password: text(values, 'password') })
  );
  if (!result.ok) return kitSubmitResult(result, form, 'The simulated request failed. Try again.');
  created = { id: result.value.account.id, email: result.value.account.email };
  complete = true;
  return { ok: true } as const;
}
</script>

<main class="mx-auto grid min-h-app w-full max-w-md content-center p-4 sm:p-8" data-testid="auth-sign-up">
  <Card>
    <CardHeader>
      <CardTitle>Create your account</CardTitle>
      <CardDescription>Use fictional details for this simulated prototype.</CardDescription>
    </CardHeader>
    <CardContent>
      {#if complete}
        <div class="grid gap-3" role="status" data-testid="auth-handoff">
          <p class="font-medium">Check your simulated inbox</p>
          <p class="text-sm text-muted-foreground">A confirmation message for {email.trim().toLowerCase()} is available in this prototype. Nothing was emailed.</p>
          {#if config.signUpInboxHref && created}
            <Button href={config.signUpInboxHref(created)}>Open simulated inbox</Button>
            <Button href={routeHref(config.signInPath)} variant="outline">Return to sign in</Button>
          {:else}
            <Button href={routeHref(config.signInPath)}>Return to sign in</Button>
          {/if}
        </div>
      {:else}
        <SchemaForm
          {form}
          onSubmit={submit}
          customFields={{ [SIMULATED_PASSWORD_KIND]: { component: SimulatedPassword } }}
          labels={{ submitting: 'Creating account', submitted: 'Account created.' }}
          class="py-saas-form"
          data-py-saas-form="sign-up"
          hideTitle
        />
        {#if config.ssoProviders.length > 0}
          <div class="mt-6 grid gap-3" data-testid="auth-sso">
            <p class="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true"><span class="h-px flex-1 bg-border"></span>or<span class="h-px flex-1 bg-border"></span></p>
            <SsoButtons providers={config.ssoProviders} intent="sign-up" />
          </div>
        {/if}
      {/if}
    </CardContent>
    {#if !complete}
      <CardFooter><Button href={routeHref(config.signInPath)} variant="ghost">I already have an account</Button></CardFooter>
    {/if}
  </Card>
  <p class="mt-4 text-center text-xs text-muted-foreground" data-testid="simulated-password-notice">Simulation only — do not use a real password. What you type is kept as plain text in this browser and in exported snapshots.</p>
</main>
