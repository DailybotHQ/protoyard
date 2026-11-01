import type { Rng } from '@protoyard/core';
import type { Blueprint } from './schema.ts';

/**
 * Seeded canvases for the `json` fields a `canvas` screen stores its boards
 * in. Without this, the generator's generic `json` value (`{ note }`) is not
 * a Texuli canvas, so every seeded record would open as a canvas that cannot
 * be read. Each record gets a small planning board instead: a frame titled
 * after the record with three sticky notes joined by connectors.
 *
 * Plain data in the Texuli canvas format (`texuli-canvas`, formatVersion 1):
 * this module imports nothing from `@texuli/canvas`, and the canvas screen
 * still validates every stored value as untrusted before it paints.
 *
 * Determinism: only the `rng` passed in, no Faker and no clock.
 */

/** Sticky prompts a seeded board picks three of, in this order. */
export const CANVAS_SEED_PROMPTS = [
  'Goals for this round',
  'Open questions',
  'Risks to watch',
  'Next steps',
  'Ideas to try',
  'Decisions so far',
  'Who to involve',
  'Dependencies',
] as const;

const STICKY_COLORS = ['yellow', 'green', 'blue', 'pink', 'orange', 'purple'] as const;

/** Canvas titles are capped at 200 characters, like the screen's blank canvas. */
const MAX_TITLE = 200;

/** `json` field names that back a canvas screen, by entity name. */
export function canvasFieldsByEntity(
  blueprint: Pick<Blueprint, 'screens'>
): Map<string, Set<string>> {
  const byEntity = new Map<string, Set<string>>();
  for (const screen of blueprint.screens) {
    if (screen.type !== 'canvas') continue;
    let fields = byEntity.get(screen.entity);
    if (!fields) {
      fields = new Set();
      byEntity.set(screen.entity, fields);
    }
    fields.add(screen.field);
  }
  return byEntity;
}

/** A small planning board for one record: a titled frame, three stickies, two connectors. */
export function seedCanvas(rng: Rng, title: string) {
  const name = title.trim().slice(0, MAX_TITLE) || 'Planning board';
  const order = rng.sample(
    CANVAS_SEED_PROMPTS.map((_, index) => index),
    3
  );
  const prompts = order.sort((a, b) => a - b).map((index) => CANVAS_SEED_PROMPTS[index] as string);
  const colors = rng.sample(STICKY_COLORS, 3);
  const stickies = prompts.map((text, index) => ({
    id: `seed-sticky-${index + 1}`,
    type: 'sticky' as const,
    x: 40 + index * 220,
    y: 96 + (index % 2) * 24,
    width: 180,
    height: 140,
    text,
    color: colors[index] ?? 'yellow',
  }));
  return {
    format: 'texuli-canvas' as const,
    formatVersion: 1 as const,
    meta: { title: name },
    shapes: [
      {
        id: 'seed-frame',
        type: 'frame' as const,
        x: 0,
        y: 0,
        width: 720,
        height: 320,
        title: name,
        children: stickies,
      },
    ],
    connectors: stickies.slice(1).map((sticky, index) => ({
      id: `seed-link-${index + 1}`,
      from: { shape: stickies[index]?.id as string, anchor: 'auto' as const },
      to: { shape: sticky.id, anchor: 'auto' as const },
      routing: 'curved' as const,
    })),
  };
}
