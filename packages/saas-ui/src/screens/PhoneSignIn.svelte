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
  FormField,
  Input,
  toast,
} from '@protoyard/ui';
import { applyServiceError, authServices, routeHref } from './auth/helpers.ts';

const { runtime, config } = authServices();
const phone = createPhoneServices(runtime);
let name = $state('');
let phoneNumber = $state('');
let busy = $state(false);
let issues = $state<Record<string, string>>({});
let message = $state('');

async function submit() {
  busy = true;
  issues = {};
  message = '';
  const result = await runService(() => phone.sendCode({ phone: phoneNumber, name }));
  busy = false;
  if (!result.ok) {
    applyServiceError(
      result.error,
      (next) => (issues = next),
      (next) => (message = next)
    );
    return;
  }
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
      <form class="grid gap-4" onsubmit={async (event) => { event.preventDefault(); await submit(); }}>
        <FormField label="Name" required error={issues.name}>
          {#snippet children(control)}
            <Input {...control.props} autocomplete="name" bind:value={name} required />
          {/snippet}
        </FormField>
        <FormField label="Phone number" required error={issues.phone} description="Use an international number, for example +1 202 555 0100.">
          {#snippet children(control)}
            <Input {...control.props} type="tel" inputmode="tel" autocomplete="tel" bind:value={phoneNumber} required />
          {/snippet}
        </FormField>
        {#if message}<p role="alert" class="text-sm text-destructive">{message}</p>{/if}
        <Button type="submit" loading={busy} loadingLabel="Sending code" disabled={busy}>Send simulated code</Button>
      </form>
    </CardContent>
    <CardFooter class="justify-between gap-2">
      <Button href={routeHref(config.signInPath)} variant="ghost">Back to sign in</Button>
    </CardFooter>
  </Card>
  <p class="mt-4 text-center text-xs text-muted-foreground">Simulation only — no SMS is sent and this is not account security.</p>
</main>
