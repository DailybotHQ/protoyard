import AxeBuilder from '@axe-core/playwright';
import { expect, type Frame, type Page, test } from '@playwright/test';
import {
  type ArtifactHarnessServer,
  FAKE_CLAUDE_INIT_SCRIPT,
  startArtifactHarnessServer,
} from './support/artifact-harness.ts';
import { ARTIFACT_PACK_TARGET } from './targets.ts';

let harness: ArtifactHarnessServer;

test.beforeAll(async () => {
  // The first run exports the pack (`protoyard export --target artifact`), which
  // can take minutes; the harness itself waits up to five for it.
  test.setTimeout(6 * 60_000);
  harness = await startArtifactHarnessServer();
});

test.afterAll(async () => {
  await harness?.close();
});

async function openPackedFrame(
  page: Page,
  options: { noClaude?: boolean; blockStorage?: boolean } = {}
): Promise<Frame> {
  await page.context().addInitScript(FAKE_CLAUDE_INIT_SCRIPT);
  const params = new URLSearchParams();
  if (options.noClaude) params.set('noClaude', '1');
  if (options.blockStorage) params.set('blockStorage', '1');
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  await page.goto(`${harness.url}${suffix}#/`);
  const frame = page
    .frames()
    .find((candidate) => candidate.url().includes('/__packed__/page.html'));
  if (!frame) throw new Error('The artifact harness did not load its packed iframe');
  await expect(frame.locator('html')).toHaveAttribute('data-py-ready', 'true', {
    timeout: 30_000,
  });
  return frame;
}

async function installArtifactAdapter(frame: Frame) {
  return frame.evaluate(async () => {
    const importFromVite = (url: string) => import(/* @vite-ignore */ url) as Promise<unknown>;
    const [artifactModuleValue, storeModuleValue] = await Promise.all([
      importFromVite('/packages/review/src/adapters/artifact.ts'),
      importFromVite('/packages/review/src/store/memory.ts'),
    ]);
    const artifactModule = artifactModuleValue as {
      createArtifactReviewAdapter(
        fallback: unknown,
        claude?: unknown
      ): Promise<{ info(): { kind: string; shared: boolean } }>;
    };
    const storeModule = storeModuleValue as {
      createMemoryReviewAdapter(): unknown;
    };
    const adapter = await artifactModule.createArtifactReviewAdapter(
      storeModule.createMemoryReviewAdapter(),
      (window as Window & { claude?: unknown }).claude
    );
    Object.defineProperty(window, '__artifactReviewAdapter', {
      configurable: true,
      value: adapter,
    });
    return adapter.info();
  });
}

async function artifactAdapterCall<T>(frame: Frame, action: string, value?: unknown): Promise<T> {
  return frame.evaluate(
    async ({ actionName, input }) => {
      const adapter = (
        window as Window & {
          __artifactReviewAdapter?: {
            put(comment: unknown): Promise<unknown>;
            list(slug: string): Promise<unknown>;
            info(): unknown;
          };
        }
      ).__artifactReviewAdapter;
      if (!adapter) throw new Error('Artifact review adapter was not installed');
      if (actionName === 'put') return adapter.put(input);
      if (actionName === 'list') return adapter.list(String(input));
      return adapter.info();
    },
    { actionName: action, input: value }
  ) as Promise<T>;
}

const sampleComment = {
  id: 'artifact-e2e-001',
  threadId: 'artifact-e2e-001',
  slug: ARTIFACT_PACK_TARGET,
  body: 'The channel title should be easier to scan.',
  author: { name: 'E2E Reviewer', clientId: 'artifact-e2e-client' },
  createdAt: '2026-10-19T10:00:00.000Z',
  anchor: {
    route: { pattern: '/channels/:channelId', path: '/channels/engineering' },
    locators: [{ kind: 'py-anchor', value: 'channel-heading' }],
    offset: { x: 0.5, y: 0.25 },
  },
  context: { scenario: 'busy-day', viewport: { width: 1280, height: 800 } },
};

test.describe('packed Claude artifact harness', () => {
  test('boots in the artifact frame, preserves the hash URL, fits, and has no serious axe findings', async ({
    page,
  }, testInfo) => {
    const frame = await openPackedFrame(page);
    expect(new URL(frame.url()).hash).toBe('#/');
    expect(
      await frame.locator('html').evaluate((html) => html.scrollWidth <= window.innerWidth)
    ).toBe(true);
    const iframe = page.locator('#artifact-frame');
    const box = await iframe.boundingBox();
    expect(box).not.toBeNull();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
      testInfo.project.use.viewport?.width ?? 1280
    );

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const blocking = results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? '')
    );
    await testInfo.attach('axe-artifact-pack.json', {
      body: JSON.stringify(results.violations, null, 2),
      contentType: 'application/json',
    });
    expect(blocking.map((violation) => violation.id)).toEqual([]);
  });

  test('shares comments across browser contexts when IndexedDB is blocked', async ({
    browser,
    page,
  }) => {
    const firstFrame = await openPackedFrame(page, { blockStorage: true });
    // The review toolbar adds its own live regions; pick the storage banner.
    await expect(
      firstFrame.getByRole('status').filter({ hasText: "Changes won't be saved." })
    ).toBeVisible();
    expect(await installArtifactAdapter(firstFrame)).toMatchObject({
      kind: 'artifact',
      shared: true,
    });
    await artifactAdapterCall(firstFrame, 'put', sampleComment);

    const secondContext = await browser.newContext();
    try {
      await secondContext.addInitScript(FAKE_CLAUDE_INIT_SCRIPT);
      const secondPage = await secondContext.newPage();
      const secondFrame = await openPackedFrame(secondPage);
      expect(await installArtifactAdapter(secondFrame)).toMatchObject({
        kind: 'artifact',
        shared: true,
      });
      const comments = await artifactAdapterCall<Array<{ body: string }>>(
        secondFrame,
        'list',
        ARTIFACT_PACK_TARGET
      );
      expect(comments.map((comment) => comment.body)).toContain(sampleComment.body);
    } finally {
      await secondContext.close();
    }
  });

  test('falls back to local comments when the artifact does not provide window.claude', async ({
    page,
  }) => {
    const frame = await openPackedFrame(page, { noClaude: true });
    expect(await installArtifactAdapter(frame)).toMatchObject({
      kind: 'local',
      shared: false,
    });
  });
});
