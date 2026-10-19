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
  FormField,
  Input,
} from '@protoyard/ui';
import { onMount } from 'svelte';
import { applyServiceError, authServices, hashParam, routeHref } from './helpers.ts';

const { runtime, config } = authServices();
const mfa = createMfaServices(runtime);
let challengeId = $state('');
let challengeEmail = $state('');
let code = $state('');
let recovery = $state(false);
let simulatedCode = $state('');
let busy = $state(false);
let issues = $state<Record<string, string>>({});
let message = $state('');

async function complete() {
  issues = {};
  message = '';
  const schema = recovery ? RecoveryCodeInputSchema : MfaCodeSchema;
  const parsed = schema.safeParse(code);
  if (!parsed.success) {
    issues[recovery ? 'recoveryCode' : 'code'] =
      parsed.error.issues[0]?.message ?? 'Enter a valid code.';
    return;
  }
  if (!challengeId) {
    message = 'Open this challenge from a password, magic-link or SSO sign-in.';
    return;
  }
  busy = true;
  const result = await runService(() =>
    mfa.completeChallenge(
      challengeId,
      recovery ? { recoveryCode: parsed.data } : { code: parsed.data }
    )
  );
  busy = false;
  if (!result.ok) {
    applyServiceError(
      result.error,
      (next) => (issues = next),
      (next) => (message = next)
    );
    return;
  }
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
      <form class="grid gap-4" onsubmit={(event) => { event.preventDefault(); void complete(); }}>
        <FormField label={recovery ? 'Recovery code' : 'Authenticator code'} required error={issues[recovery ? 'recoveryCode' : 'code']}>
          {#snippet children(control)}
            <Input {...control.props} inputmode={recovery ? 'text' : 'numeric'} autocomplete="one-time-code" bind:value={code} required />
          {/snippet}
        </FormField>
        <Button type="submit" loading={busy} loadingLabel="Verifying code" disabled={busy || !challengeId}>Verify and sign in</Button>
      </form>
      <Button variant="ghost" onclick={() => { recovery = !recovery; code = ''; issues = {}; }}>
        {recovery ? 'Use an authenticator code' : 'Use a recovery code'}
      </Button>
      {#if message}<p role="alert" class="text-sm text-destructive">{message}</p>{/if}
    </CardContent>
    <CardFooter><Button href={routeHref(config.signInPath)} variant="ghost">Return to sign in</Button></CardFooter>
  </Card>
</main>
