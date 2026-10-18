<script lang="ts">
import type { PrototypeRuntime } from '@protoyard/core';
import { untrack } from 'svelte';
import { provideSaas } from '../../src/context.ts';
import MagicLink from '../../src/screens/auth/MagicLink.svelte';
import Mfa from '../../src/screens/auth/Mfa.svelte';
import ResetPassword from '../../src/screens/auth/ResetPassword.svelte';
import SignIn from '../../src/screens/auth/SignIn.svelte';
import SignUp from '../../src/screens/auth/SignUp.svelte';
import VerifyEmail from '../../src/screens/auth/VerifyEmail.svelte';

type AuthScreen = 'magic' | 'mfa' | 'reset' | 'sign-in' | 'sign-up' | 'verify';
let { runtime, screen }: { runtime: PrototypeRuntime; screen: AuthScreen } = $props();
provideSaas(untrack(() => runtime));
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
{:else}
  <VerifyEmail />
{/if}
