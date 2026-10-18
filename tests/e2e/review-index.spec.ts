import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { expectAccessible, WCAG_TAGS } from './support/a11y.ts';

/**
 * The team review index (`protoyard review-index`), rendered from the fixture
 * ledger tests/e2e/fixtures/publish-ledger.jsonl and served by
 * `review-index --serve` (see playwright.config.ts). Nothing is deployed and
 * no link is followed: the URLs are fictional `.example` hosts. The checks:
 * every link is exactly a URL the ledger recorded (plus a query parameter),
 * undeployed prototypes show the publish command, the page is keyboard
 * navigable, has no script and no axe violations, in light and dark.
 */
const PORT = Number(process.env.PROTOYARD_E2E_REVIEW_PORT ?? 4502);
const SITE = `http://127.0.0.1:${PORT}/`;

interface FixtureLine {
  slug: string;
  kind: string;
  url: string | null;
}

const fixture = readFileSync(join(process.cwd(), 'tests/e2e/fixtures/publish-ledger.jsonl'), 'utf8')
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line) as FixtureLine);
/** Latest real deploy per slug, the same rule the command applies. */
const deployed = new Map<string, string>();
for (const line of fixture)
  if (line.kind === 'published' && line.url) deployed.set(line.slug, line.url);
const recordedUrls = new Set(fixture.flatMap((l) => (l.url ? [l.url] : [])));

const manifestOf = (slug: string) =>
  JSON.parse(readFileSync(join(process.cwd(), 'prototypes', slug, 'protoyard.json'), 'utf8')) as {
    name: string;
    scenarios: string[];
  };

test.describe('review index', () => {
  test.skip(process.env.PROTOYARD_E2E_REVIEW !== '1', 'set PROTOYARD_E2E_REVIEW=1');

  test('links only the URLs the ledger recorded, with scenario and persona deep links', async ({
    page,
  }) => {
    await page.goto(SITE);
    await expect(page.getByRole('heading', { level: 1, name: 'Prototype review' })).toBeVisible();
    expect(deployed.size).toBeGreaterThan(0);

    for (const [slug, url] of deployed) {
      const card = page.locator(`article[aria-labelledby="p-${slug}"]`);
      await expect(card).toBeVisible();
      const { name, scenarios } = manifestOf(slug);
      await expect(card.getByRole('link', { name: `Open ${name}`, exact: true })).toHaveAttribute(
        'href',
        url
      );

      const scenarioHrefs = await card
        .locator('h3:text-is("Scenarios") + ul a')
        .evaluateAll((links) => links.map((a) => a.getAttribute('href')));
      expect(scenarioHrefs).toEqual(scenarios.map((id) => `${url}?scenario=${id}`));

      const personaHrefs = await card
        .locator('h3:text-is("Personas") + ul a')
        .evaluateAll((links) => links.map((a) => a.getAttribute('href') ?? ''));
      expect(personaHrefs.length).toBeGreaterThan(0);
      for (const href of personaHrefs)
        expect(href).toMatch(
          new RegExp(`^${url.replace(/[.?]/g, '\\$&')}\\?actor=[A-Za-z0-9_-]+$`)
        );
    }

    // No synthesized URL anywhere: each href is a recorded URL (optionally with
    // one query parameter) or the page's own manifest. Superseded deploys are gone.
    const hrefs = await page
      .locator('a')
      .evaluateAll((links) => links.map((a) => a.getAttribute('href') ?? ''));
    for (const href of hrefs) {
      if (href === './review-manifest.json') continue;
      const bare = href.replace(/\?(scenario|actor)=[^?#]*$/, '');
      expect(recordedUrls.has(bare), `unexpected link ${href}`).toBe(true);
      expect([...deployed.values()]).toContain(bare);
    }
  });

  test('shows "not deployed" with the publish command for prototypes without a real deploy', async ({
    page,
  }) => {
    await page.goto(SITE);
    const cards = page.locator('article');
    const slugs = await cards.evaluateAll((all) =>
      all.map((a) => (a.getAttribute('aria-labelledby') ?? '').replace(/^p-/, ''))
    );
    const undeployed = slugs.filter((s) => !deployed.has(s));
    // The fixture has a dry run for ai-chat-demo: dry runs never count as deployments.
    expect(undeployed).toContain('ai-chat-demo');
    for (const slug of undeployed) {
      const card = page.locator(`article[aria-labelledby="p-${slug}"]`);
      await expect(card.getByText('not deployed', { exact: true })).toBeVisible();
      await expect(card.locator('code')).toHaveText(
        `pnpm protoyard publish ${slug} --provider cloudflare`
      );
      await expect(card.locator('a')).toHaveCount(0);
    }
    await expect(
      page.getByText(`${deployed.size} of ${slugs.length} prototypes deployed`)
    ).toBeVisible();
  });

  test('loads no JavaScript and stays under 30 KB gzip', async ({ page, request }) => {
    const types: string[] = [];
    page.on('request', (r) => types.push(r.resourceType()));
    await page.goto(SITE);
    await expect(page.locator('script')).toHaveCount(0);
    expect(types.filter((t) => t === 'script')).toEqual([]);
    const body = await (await request.get(SITE)).body();
    expect(gzipSync(body, { level: 9 }).length).toBeLessThan(30 * 1024);
  });

  test('is keyboard navigable with a visible focus ring', async ({ page }) => {
    await page.goto(SITE);
    const links = page.locator('main a');
    const first = await links.first().getAttribute('href');
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.getAttribute('href'))).toBe(first);
    const outline = await page.evaluate(
      () => getComputedStyle(document.activeElement as Element).outlineStyle
    );
    expect(outline).not.toBe('none');
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.getAttribute('href'))).toBe(
      await links.nth(1).getAttribute('href')
    );
  });

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`has no axe violations (${colorScheme})`, async ({ page }, testInfo) => {
      await page.emulateMedia({ colorScheme });
      await page.goto(SITE);
      await expectAccessible(page, testInfo, { label: `review-index-${colorScheme}` });
      // Stricter than the shared helper: no violation of any impact on this page.
      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      expect(results.violations.map((v) => `${v.impact} ${v.id}`)).toEqual([]);
    });
  }
});
