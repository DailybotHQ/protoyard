<script lang="ts">
import type { PrototypeRuntime } from '@protoyard/core';
import { untrack } from 'svelte';
import type { OAuthProviderScenarios, SaasProvider } from '../../../saas/src/index.ts';
import SsoButtons from '../../src/components/SsoButtons.svelte';
import type { SaasUiConfig } from '../../src/config.ts';
import { provideSaas } from '../../src/context.ts';
import MagicLink from '../../src/screens/auth/MagicLink.svelte';
import Mfa from '../../src/screens/auth/Mfa.svelte';
import ResetPassword from '../../src/screens/auth/ResetPassword.svelte';
import SignIn from '../../src/screens/auth/SignIn.svelte';
import SignUp from '../../src/screens/auth/SignUp.svelte';
import VerifyEmail from '../../src/screens/auth/VerifyEmail.svelte';
import OAuthConsent from '../../src/screens/oauth/Consent.svelte';
import OAuthLink from '../../src/screens/oauth/Link.svelte';
import Settings from '../../src/screens/settings/Settings.svelte';

type AuthScreen =
  | 'magic'
  | 'mfa'
  | 'reset'
  | 'sign-in'
  | 'sign-up'
  | 'verify'
  | 'sso'
  | 'oauth-consent'
  | 'oauth-link'
  | 'settings';
let {
  runtime,
  screen,
  scenarios,
  provider = 'google',
  tab = 'profile',
  config,
}: {
  runtime: PrototypeRuntime;
  screen: AuthScreen;
  scenarios?: OAuthProviderScenarios;
  provider?: SaasProvider;
  tab?: string;
  config?: SaasUiConfig;
} = $props();
provideSaas(
  untrack(() => runtime),
  untrack(() => config ?? {})
);
</script>

{#if screen === 'sign-in'}
  <SignIn />
{:else if screen === 'sign-up'}
  <SignUp />
{:else if screen === 'magic'}
  <MagicLink />
{:else if screen === 'mfa'}
  <Mfa />
{:else if screen === 'reset'}
  <ResetPassword />
{:else if screen === 'sso'}
  <SsoButtons providers={['google']} {scenarios} />
{:else if screen === 'oauth-consent'}
  <OAuthConsent params={{ provider }} {scenarios} />
{:else if screen === 'oauth-link'}
  <OAuthLink params={{ provider }} {scenarios} />
{:else if screen === 'settings'}
  <Settings params={{ tab }} />
{:else}
  <VerifyEmail />
{/if}
