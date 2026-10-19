<script lang="ts">
import { navigate, runService } from '@protoyard/renderer-svelte';
import { createAuthServices } from '@protoyard/saas';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  FormField,
  Input,
} from '@protoyard/ui';
import SsoButtons from '../../components/SsoButtons.svelte';
import { applyServiceError, authServices, routeHref } from './helpers.ts';

const { runtime, config } = authServices();
const auth = createAuthServices(runtime);
let name = $state('');
let email = $state('');
let password = $state('');
let showPassword = $state(false);
let busy = $state(false);
let complete = $state(false);
let created = $state<{ id: string; email: string } | null>(null);
let issues = $state<Record<string, string>>({});
let message = $state('');

async function submit() {
  busy = true;
  issues = {};
  message = '';
  const result = await runService(() => auth.signUp({ name, email, password }));
  busy = false;
  if (!result.ok) {
    applyServiceError(
      result.error,
      (next) => (issues = next),
      (next) => (message = next)
    );
    return;
  }
  created = { id: result.value.account.id, email: result.value.account.email };
  complete = true;
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
        <form class="grid gap-4" onsubmit={(event) => { event.preventDefault(); void submit(); }}>
          <FormField label="Name" required error={issues.name}>
            {#snippet children(control)}
              <Input {...control.props} autocomplete="name" bind:value={name} required />
            {/snippet}
          </FormField>
          <FormField label="Email" required error={issues.email} description="Use an address at example.com.">
            {#snippet children(control)}
              <Input {...control.props} type="email" autocomplete="email" bind:value={email} required />
            {/snippet}
          </FormField>
          <FormField label="Password" required error={issues.password}>
            {#snippet children(control)}
              <Input {...control.props} type={showPassword ? 'text' : 'password'} autocomplete="off" bind:value={password} required />
            {/snippet}
          </FormField>
          <Button variant="ghost" size="sm" onclick={() => (showPassword = !showPassword)} aria-pressed={showPassword}>
            {showPassword ? 'Hide password' : 'Show password'}
          </Button>
          {#if message}<p role="alert" class="text-sm text-destructive">{message}</p>{/if}
          <Button type="submit" loading={busy} loadingLabel="Creating account" disabled={busy}>Create account</Button>
        </form>
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
