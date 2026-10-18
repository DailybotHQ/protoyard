import { expect, type Page, type TestInfo, test } from '@playwright/test';
import { expectAccessible } from './support/a11y.ts';
import { LATTICE_SAAS_DEMO, PROTOTYPE_TARGETS, prototypeUrl } from './targets.ts';

test.skip(
  !PROTOTYPE_TARGETS.includes(LATTICE_SAAS_DEMO),
  `set PROTOYARD_E2E_PROTOTYPES to include ${LATTICE_SAAS_DEMO}`
);

interface InboxMessage {
  kind: string;
  action: { href: string } | null;
}

interface SimulatedToken {
  id: string;
  kind: 'oauth-state';
  email: string;
  accountId: null;
  payload: {
    provider: 'google';
    intent: 'sign-up';
    identity: { subject: string; name: string; email: string; emailShared: true };
    outcome: 'success';
  };
  createdAt: string;
  expiresAt: string;
  consumedAt: null;
}

interface Table<T> {
  add(value: T): Promise<unknown>;
  where(index: string): { equals(value: string): { toArray(): Promise<T[]> } };
}

interface Runtime {
  db: { table<T>(name: string): Table<T> };
  clock: { now(): Date };
  session: { isSignedIn(): boolean };
}

declare global {
  interface Window {
    __protoyard?: Runtime;
  }
}

function prototypeRoot(scenario = 'signed-out'): string {
  return `${prototypeUrl(LATTICE_SAAS_DEMO)}?scenario=${scenario}`;
}

async function openPrototype(page: Page, scenario = 'signed-out', route = '/') {
  await page.goto(`${prototypeRoot(scenario)}#${route}`);
  await expect(page.locator('html')).toHaveAttribute('data-protoyard-ready', '1', {
    timeout: 15_000,
  });
}

async function inboxActionHref(page: Page, recipient: string, kind: string) {
  return page.evaluate(
    async ({ recipient, kind }) => {
      const messages = await window.__protoyard?.db
        .table<InboxMessage>('saas_inbox')
        .where('recipient')
        .equals(recipient)
        .toArray();
      return messages?.find((message) => message.kind === kind)?.action?.href ?? null;
    },
    { recipient, kind }
  );
}

async function signIn(
  page: Page,
  email: string,
  next = '/app',
  scenario = 'signed-out',
  testInfo?: TestInfo
) {
  await openPrototype(page, scenario, `/sign-in?next=${encodeURIComponent(next)}`);
  if (testInfo) {
    await checkAuthA11y(page, testInfo, '[data-testid="auth-sign-in"]', 'lattice-sign-in');
  }
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('demo-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
}

async function checkAuthA11y(page: Page, testInfo: TestInfo, selector: string, label: string) {
  await expectAccessible(page, testInfo, { include: selector, label });
}

async function addOAuthState(page: Page, id: string, email: string): Promise<string> {
  return page.evaluate(
    async ({ id, email }) => {
      const runtime = window.__protoyard;
      if (!runtime) throw new Error('Prototype runtime is not ready.');
      const created = runtime.clock.now();
      const token: SimulatedToken = {
        id,
        kind: 'oauth-state',
        email,
        accountId: null,
        payload: {
          provider: 'google',
          intent: 'sign-up',
          identity: {
            subject: `google_${id}`,
            name: 'Taylor Example',
            email,
            emailShared: true,
          },
          outcome: 'success',
        },
        createdAt: created.toISOString(),
        expiresAt: new Date(created.getTime() + 600_000).toISOString(),
        consumedAt: null,
      };
      await runtime.db.table<SimulatedToken>('saas_tokens').add(token);
      return `#/oauth/google/consent?state=${encodeURIComponent(id)}`;
    },
    { id, email }
  );
}

test.describe('Lattice flagship SaaS journeys', () => {
  test('first sign-in view does not request a Faker chunk', async ({ page }, testInfo) => {
    const scriptRequests: string[] = [];
    page.on('request', (request) => {
      if (request.resourceType() === 'script') scriptRequests.push(request.url());
    });
    await openPrototype(page, 'signed-out', '/sign-in');
    await expect(page.getByTestId('auth-sign-in')).toBeVisible();
    await expect.poll(() => scriptRequests.length).toBeGreaterThan(0);
    expect(scriptRequests.filter((url) => /faker/i.test(url))).toEqual([]);
    await checkAuthA11y(page, testInfo, '[data-testid="auth-sign-in"]', 'lattice-first-sign-in');
  });

  test('sign-up, verify from the simulated inbox, and resume persisted onboarding', async ({
    page,
  }, testInfo) => {
    const email = 'e2e.signup@example.com';
    await openPrototype(page, 'signed-out', '/sign-up');
    await checkAuthA11y(page, testInfo, '[data-testid="auth-sign-up"]', 'lattice-sign-up');
    await page.getByLabel('Name').fill('Jordan Example');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('demo-password');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByTestId('auth-handoff')).toContainText('Check your simulated inbox');

    await expect.poll(() => inboxActionHref(page, email, 'verify-email')).not.toBeNull();
    const verificationHref = await inboxActionHref(page, email, 'verify-email');
    if (!verificationHref) throw new Error('The simulated inbox has no verification action.');
    await page.goto(`${prototypeUrl(LATTICE_SAAS_DEMO)}?scenario=signed-out${verificationHref}`);
    await expect(page.getByTestId('auth-verify-email')).toBeVisible();
    await checkAuthA11y(
      page,
      testInfo,
      '[data-testid="auth-verify-email"]',
      'lattice-verify-email'
    );
    await page.getByRole('button', { name: 'Confirm email' }).click();
    await expect(page.getByTestId('auth-handoff')).toContainText('Your account is ready');

    await signIn(page, email, '/app', 'signed-out', testInfo);
    await expect(page).toHaveURL(/#\/onboarding$/);
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByRole('heading', { name: 'Workspace' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Workspace' })).toBeVisible();
    await expect(page.getByLabel('Workspace name')).toHaveValue("Jordan Example's workspace");
  });

  test('SSO consent approval creates a session and opens onboarding', async ({
    page,
  }, testInfo) => {
    await openPrototype(page);
    const href = await addOAuthState(page, 'e2e-oauth-approve', 'approve@example.com');
    await page.goto(`${prototypeUrl(LATTICE_SAAS_DEMO)}?scenario=signed-out${href}`);
    await expect(page.getByTestId('oauth-consent')).toBeVisible();
    await checkAuthA11y(page, testInfo, '[data-testid="oauth-consent"]', 'lattice-sso-consent');
    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page).toHaveURL(/#\/onboarding$/, { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: 'Set up your account' })).toBeVisible();
  });

  test('SSO consent denial returns to sign-in without opening a session', async ({
    page,
  }, testInfo) => {
    await openPrototype(page);
    const href = await addOAuthState(page, 'e2e-oauth-deny', 'deny@example.com');
    await page.goto(`${prototypeUrl(LATTICE_SAAS_DEMO)}?scenario=signed-out${href}`);
    await checkAuthA11y(page, testInfo, '[data-testid="oauth-consent"]', 'lattice-sso-deny');
    await page.getByRole('button', { name: 'Deny' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Access was denied' })).toBeVisible();
    await expect(page).toHaveURL(/#\/sign-in$/, { timeout: 10_000 });
    await expect(page.getByTestId('auth-sign-in')).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.__protoyard?.session.isSignedIn() ?? true))
      .toBe(false);
  });

  test('magic-link inbox action signs in to the existing account', async ({ page }, testInfo) => {
    const email = 'owner@example.com';
    await openPrototype(page, 'trial-ending', '/sign-in');
    await page.getByRole('link', { name: 'Use a magic link' }).click();
    await expect(page.getByTestId('auth-magic-link')).toBeVisible();
    await checkAuthA11y(page, testInfo, '[data-testid="auth-magic-link"]', 'lattice-magic-link');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Send sign-in link' }).click();
    await expect(page.getByRole('status')).toContainText('Check your simulated inbox');
    await expect.poll(() => inboxActionHref(page, email, 'magic-link')).not.toBeNull();
    const href = await inboxActionHref(page, email, 'magic-link');
    if (!href) throw new Error('The simulated inbox has no magic-link action.');
    await page.goto(`${prototypeUrl(LATTICE_SAAS_DEMO)}?scenario=trial-ending${href}`);
    await expect(page).toHaveURL(/#\/app$/, { timeout: 10_000 });
    await expect(page.getByRole('link', { name: 'Projects', exact: true })).toBeVisible();
  });

  test('MFA challenge completes password sign-in with the simulated authenticator code', async ({
    page,
  }, testInfo) => {
    await signIn(page, 'owner@example.com', '/projects', 'mfa-enrolled', testInfo);
    await expect(page.getByTestId('auth-mfa')).toBeVisible();
    await checkAuthA11y(page, testInfo, '[data-testid="auth-mfa"]', 'lattice-mfa');
    const code = await page.getByTestId('auth-simulated-code').locator('p').nth(1).innerText();
    await page.getByLabel('Authenticator code').fill(code.trim());
    await page.getByRole('button', { name: 'Verify and sign in' }).click();
    await expect(page).toHaveURL(/#\/projects$/, { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
  });

  test('trial converts to a paid plan through simulated checkout', async ({ page }, testInfo) => {
    await signIn(page, 'owner@example.com', '/app', 'trial-ending', testInfo);
    await expect(page.getByTestId('trial-banner')).toBeVisible();
    await page.goto(`${prototypeUrl(LATTICE_SAAS_DEMO)}?scenario=trial-ending#/billing/plans`);
    const planLink = page.getByRole('link', { name: /^Choose / }).first();
    await expect(planLink).toBeVisible();
    await planLink.click();
    await expect(page.getByTestId('billing-checkout')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm simulated payment' }).click();
    await expect(page.getByTestId('checkout-result')).toHaveAttribute('data-outcome', 'success');
    await expect(page.getByTestId('checkout-result')).toContainText('Subscription plan:');
    await expect(page.getByTestId('checkout-result')).toContainText('(active)');
  });
});
