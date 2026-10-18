<script lang="ts">
import { navigate, runService } from '@protoyard/renderer-svelte';
import { createMfaServices } from '@protoyard/saas';
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
import { applyServiceError, authServices } from './helpers.ts';

const { runtime, config } = authServices();
const mfa = createMfaServices(runtime);
let email = $state('');
let password = $state('');
let showPassword = $state(false);
let busy = $state(false);
let issues = $state<Record<string, string>>({});
let message = $state('');

async function submit() {
  busy = true;
  issues = {};
  message = '';
  const result = await runService(() => mfa.signInWithPassword({ email, password }));
  busy = false;
  if (!result.ok) {
    applyServiceError(
      result.error,
      (next) => (issues = next),
      (next) => (message = next)
    );
    return;
  }
  if (result.value.status === 'mfa-required') {
    navigate(`/auth/mfa?account=${encodeURIComponent(result.value.account.id)}`);
    return;
  }
  navigate(config.homePath);
}
</script>

<main class="mx-auto grid min-h-app w-full max-w-md content-center p-4 sm:p-8" data-testid="auth-sign-in">
  <Card>
    <CardHeader>
      <CardTitle>Sign in</CardTitle>
      <CardDescription>Email and password for this simulated prototype account.</CardDescription>
    </CardHeader>
    <CardContent>
      <form class="grid gap-4" onsubmit={(event) => { event.preventDefault(); void submit(); }}>
        <FormField label="Email" required error={issues.email}>
          {#snippet children(control)}
            <Input {...control.props} type="email" autocomplete="email" bind:value={email} required />
          {/snippet}
        </FormField>
        <FormField label="Password" required error={issues.password}>
          {#snippet children(control)}
            <Input {...control.props} type={showPassword ? 'text' : 'password'} autocomplete="current-password" bind:value={password} required />
          {/snippet}
        </FormField>
        <Button variant="ghost" size="sm" onclick={() => (showPassword = !showPassword)} aria-pressed={showPassword}>
          {showPassword ? 'Hide password' : 'Show password'}
        </Button>
        {#if message}<p role="alert" class="text-sm text-destructive">{message}</p>{/if}
        <Button type="submit" loading={busy} loadingLabel="Signing in" disabled={busy}>Sign in</Button>
      </form>
    </CardContent>
    <CardFooter class="flex flex-wrap justify-between gap-2">
      <Button href={config.signUpPath} variant="ghost">Create account</Button>
      <Button href="/auth/magic" variant="outline">Use a magic link</Button>
    </CardFooter>
    <CardFooter>
      <Button href="/auth/reset" variant="link">Forgot password?</Button>
    </CardFooter>
  </Card>
  <p class="mt-4 text-center text-xs text-muted-foreground">Simulation only — never enter a real password.</p>
</main>
