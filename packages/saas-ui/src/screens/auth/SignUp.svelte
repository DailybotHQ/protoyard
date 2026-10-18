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
import { applyServiceError, authServices } from './helpers.ts';

const { runtime, config } = authServices();
const auth = createAuthServices(runtime);
let name = $state('');
let email = $state('');
let password = $state('');
let showPassword = $state(false);
let busy = $state(false);
let complete = $state(false);
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
          <Button href={config.signInPath}>Return to sign in</Button>
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
              <Input {...control.props} type={showPassword ? 'text' : 'password'} autocomplete="new-password" bind:value={password} required />
            {/snippet}
          </FormField>
          <Button variant="ghost" size="sm" onclick={() => (showPassword = !showPassword)} aria-pressed={showPassword}>
            {showPassword ? 'Hide password' : 'Show password'}
          </Button>
          {#if message}<p role="alert" class="text-sm text-destructive">{message}</p>{/if}
          <Button type="submit" loading={busy} loadingLabel="Creating account" disabled={busy}>Create account</Button>
        </form>
      {/if}
    </CardContent>
    {#if !complete}
      <CardFooter><Button href={config.signInPath} variant="ghost">I already have an account</Button></CardFooter>
    {/if}
  </Card>
  <p class="mt-4 text-center text-xs text-muted-foreground">Simulation only — do not use real credentials.</p>
</main>
