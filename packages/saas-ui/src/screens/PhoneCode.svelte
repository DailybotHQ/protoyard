<script lang="ts">
import { navigate, nextPath, runService } from '@protoyard/renderer-svelte';
import {
  createPhoneServices,
  PHONE_CODE_TOAST_ID,
  type PhoneChallengeView,
  phoneResendSecondsRemaining,
} from '@protoyard/saas';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  OtpInput,
  toast,
} from '@protoyard/ui';
import { onMount } from 'svelte';
import { applyServiceError, authServices, hashParam, routeHref } from './auth/helpers.ts';

const { runtime, config } = authServices();
const phone = createPhoneServices(runtime);
let challenge = $state<PhoneChallengeView | null>(null);
let simulatedNow = $state(runtime.clock.now());
let loading = $state(true);
let busy = $state(false);
let code = $state('');
let issues = $state<Record<string, string>>({});
let message = $state('');
let challengeId = $state('');

const remaining = $derived(
  challenge ? phoneResendSecondsRemaining(simulatedNow.getTime(), challenge.sentAt) : 0
);
const next = () =>
  nextPath(new URLSearchParams(location.hash.split('?')[1] ?? ''), config.homePath);

function showSimulatedCode(value: PhoneChallengeView) {
  toast.info('Simulated SMS code', {
    id: PHONE_CODE_TOAST_ID,
    duration: 0,
    description: `Your code is ${value.code}. No SMS was sent.`,
  });
}

async function loadChallenge() {
  loading = true;
  challengeId = hashParam('challenge');
  try {
    challenge = challengeId ? await phone.describeChallenge(challengeId) : null;
    if (challenge) showSimulatedCode(challenge);
    else {
      toast.dismiss(PHONE_CODE_TOAST_ID);
      message = 'This code request is no longer active. Start again.';
    }
  } catch (error) {
    message = error instanceof Error ? error.message : 'The simulated code request could not load.';
  } finally {
    loading = false;
  }
}

async function verify() {
  if (busy || !challenge || code.length !== 6) return;
  busy = true;
  issues = {};
  message = '';
  const result = await runService(() => phone.verifyCode({ challengeId, code }));
  busy = false;
  if (!result.ok) {
    applyServiceError(
      result.error,
      (nextIssues) => (issues = nextIssues),
      (nextMessage) => (message = nextMessage)
    );
    return;
  }
  toast.dismiss(PHONE_CODE_TOAST_ID);
  navigate(next());
}

async function resend() {
  if (busy || !challenge || remaining > 0) return;
  busy = true;
  issues = {};
  message = '';
  const result = await runService(() => phone.resendCode(challengeId));
  busy = false;
  if (!result.ok) {
    applyServiceError(
      result.error,
      (nextIssues) => (issues = nextIssues),
      (nextMessage) => (message = nextMessage)
    );
    return;
  }
  challengeId = result.value.challengeId;
  navigate(
    `/auth/phone/code?challenge=${encodeURIComponent(challengeId)}&next=${encodeURIComponent(next())}`
  );
  challenge = await phone.describeChallenge(challengeId);
  code = '';
  if (challenge) showSimulatedCode(challenge);
}

onMount(() => {
  void loadChallenge();
});

$effect(() => runtime.clock.subscribe(() => (simulatedNow = runtime.clock.now())));
</script>

<main class="mx-auto grid min-h-app w-full max-w-md content-center p-4 sm:p-8" data-testid="auth-phone-code">
  <Card>
    <CardHeader>
      <CardTitle>Enter your code</CardTitle>
      <CardDescription>
        {#if challenge}Enter the simulated six-digit code for {challenge.phone}.{:else}Verify your simulated phone sign-in.{/if}
      </CardDescription>
    </CardHeader>
    <CardContent class="grid gap-4">
      {#if loading}
        <p role="status" class="text-sm text-muted-foreground">Loading the simulated code request…</p>
      {:else if challenge}
        <div class="rounded-md border border-border bg-muted/40 p-3" role="note" data-testid="auth-simulated-phone-code">
          <p class="text-xs text-muted-foreground">Simulated SMS code</p>
          <p class="font-mono text-lg tracking-widest">{challenge.code}</p>
          <p class="text-xs text-muted-foreground">Simulation only — this code is not sent by SMS.</p>
        </div>
        <OtpInput bind:value={code} label="Six-digit phone code" disabled={busy} autofocus={false} onComplete={() => verify()} />
        {#if issues.code || message}<p role="alert" class="text-sm text-destructive">{issues.code ?? message}</p>{/if}
        <p class="text-sm text-muted-foreground" aria-live="polite">
          {remaining > 0 ? `You can request another code in ${remaining} seconds.` : 'You can request another code now.'}
        </p>
      {:else}
        <p role="alert" class="text-sm text-destructive">{message}</p>
      {/if}
    </CardContent>
    <CardFooter class="flex flex-wrap justify-between gap-2">
      <Button href={routeHref('/auth/phone')} variant="ghost">Change phone number</Button>
      {#if challenge}
        <Button onclick={resend} loading={busy} loadingLabel="Sending code" disabled={busy || remaining > 0}>Resend code</Button>
        <Button onclick={verify} loading={busy} loadingLabel="Verifying" disabled={busy || code.length !== 6}>Verify</Button>
      {/if}
    </CardFooter>
  </Card>
</main>
