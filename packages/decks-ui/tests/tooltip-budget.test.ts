// @vitest-environment node
import { expect, it } from 'vitest';
import {
  buildDeckEntry,
  cleanupDeckBuild,
  DECK_ENTRY_MAIN,
  initialChunks,
  sumGzip,
} from './bundle-support.ts';

/**
 * The deck chrome tooltip costs at most 1.5 KB gzip on the deck entry
 * (PLAN_006 decision 2). The real DeckApp entry is built with and without the
 * tooltip mounted beside it, and the initial JavaScript is compared.
 * `@protoyard/ui`'s previous Tooltip measured 36,552 B on the same entry, which
 * is why the deck has its own.
 */
const TOOLTIP_BUDGET_BYTES = 1536;

const WITH_TOOLTIP = `${DECK_ENTRY_MAIN}import ChromeTooltip from '@protoyard/decks-ui/chrome/ChromeTooltip.svelte';
import { controlTooltip, createDeckTooltip } from '@protoyard/decks-ui/chrome/tooltip.ts';
mount(ChromeTooltip, { target: document.body, props: { tooltip: createDeckTooltip() } });
(window as unknown as { tooltipContent: unknown }).tooltipContent = controlTooltip;
`;

async function initialBytes(main?: string): Promise<number> {
  const { dir, output } = await buildDeckEntry(main);
  try {
    return sumGzip(initialChunks(output));
  } finally {
    await cleanupDeckBuild(dir);
  }
}

it('adds at most 1.5 KB gzip to the deck entry', async () => {
  const base = await initialBytes();
  const withTooltip = await initialBytes(WITH_TOOLTIP);
  const delta = withTooltip - base;
  console.info(`[tooltip-budget] ${JSON.stringify({ base, withTooltip, delta })}`);
  expect(delta, `the tooltip adds ${delta} B gzip`).toBeLessThanOrEqual(TOOLTIP_BUDGET_BYTES);
}, 600_000);
