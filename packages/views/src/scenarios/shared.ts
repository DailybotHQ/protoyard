import { createAvatarPool } from '@protoyard/avatars';
import { createRng, type GenerateContext, type Rng, type Scenario } from '@protoyard/core';

/**
 * Shared pieces of the views-kit generators. Every generator draws from its
 * own rng keyed by the scenario id, seed and generator name (the way
 * `dayRng` in `@protoyard/scenarios` keys days), so adding one generator
 * never changes another's output. Ids come from `ctx.ids` and time from
 * `ctx.time`; nothing reads an ambient random source or the system clock.
 */

export type ViewsCtx = Pick<GenerateContext, 'scenario' | 'ids' | 'time'>;

/** How much data a generator makes: none, a believable amount, a lot, or awkward cases. */
export type ViewsLevel = 'empty' | 'typical' | 'dense' | 'edge';

export const VIEWS_KITS = [
  'calendar',
  'plan',
  'geo',
  'outline',
  'comments',
  'activity',
  'notifications',
  'files',
] as const;
export type ViewsKit = (typeof VIEWS_KITS)[number];

/** Bump when the same scenario and options can produce different rows. */
export const VIEWS_GENERATOR_VERSION = 2;

export function viewsRng(ctx: Pick<GenerateContext, 'scenario'>, key: string): Rng {
  return createRng(`protoyard:views:${ctx.scenario.id}:${ctx.scenario.seed}:${key}`);
}

type Knobs = Partial<Record<ViewsKit, ViewsLevel>>;

function knobs(scenario: Pick<Scenario, 'generators'>): Knobs {
  const value = (scenario.generators as Record<string, unknown> | undefined)?.views;
  return typeof value === 'object' && value !== null ? (value as Knobs) : {};
}

/**
 * The level for a kit: the scenario's `generators.views.<kit>` knob (set by a
 * fragment), else its density (empty → empty, dense or massive → dense,
 * otherwise typical).
 */
export function viewsLevel(
  ctx: Pick<GenerateContext, 'scenario'>,
  kit: ViewsKit,
  override?: ViewsLevel
): ViewsLevel {
  if (override) return override;
  const knob = knobs(ctx.scenario)[kit];
  if (knob) return knob;
  const density = ctx.scenario.density;
  return density === 'empty'
    ? 'empty'
    : density === 'dense' || density === 'massive'
      ? 'dense'
      : 'typical';
}

/** A scenario fragment (deep-merged with `composeScenario`) that sets one kit's level. */
export interface ViewsFragment {
  generators: { views: Knobs };
  tags: string[];
}

const fragment =
  (kit: ViewsKit) =>
  (level: ViewsLevel): ViewsFragment => ({
    generators: { views: { [kit]: level } },
    tags: [`${kit}-${level}`],
  });

/**
 * Fragments per kit: `composeScenario(PRESETS['busy-week'], viewsFragments.calendar('dense'), { id: 'crunch' })`.
 */
export const viewsFragments = Object.fromEntries(
  VIEWS_KITS.map((kit) => [kit, fragment(kit)])
) as Record<ViewsKit, (level: ViewsLevel) => ViewsFragment>;

/** Rows per level for a kit: `[empty, typical, dense, edge]`. */
export function countFor(
  level: ViewsLevel,
  counts: readonly [number, number, number, number]
): number {
  return counts[{ empty: 0, typical: 1, dense: 2, edge: 3 }[level]] as number;
}

export interface ViewsPerson {
  id: string;
  name: string;
  /** Mention handle, without the `@`. */
  handle: string;
  email: string;
  /** Face: a library id (`av-NNN`), an https URL or a root-relative path, like `persona.avatar`. */
  avatar?: string;
}

const FIRST = [
  'Ada',
  'Bruno',
  'Chiara',
  'Dev',
  'Elif',
  'Femi',
  'Greta',
  'Hiro',
  'Ines',
  'Jonas',
  'Kaia',
  'Luca',
];
const LAST = [
  'Okafor',
  'Lindqvist',
  'Moreau',
  'Rao',
  'Tanaka',
  'Vidal',
  'Novak',
  'Sato',
  'Haddad',
  'Kowal',
];

/**
 * Fictional people (example.com emails) for kits that need authors or
 * assignees and were given none. Each one has a seeded library avatar from its
 * own stream (`avatars`), so faces never shift names, and none repeats.
 */
export function defaultPeople(ctx: Pick<GenerateContext, 'scenario'>, count = 6): ViewsPerson[] {
  const offset = viewsRng(ctx, 'people').int(0, LAST.length - 1);
  const avatars = createAvatarPool(viewsRng(ctx, 'avatars'));
  // First names by index keep handles unique for up to 12 people.
  return Array.from({ length: Math.min(count, FIRST.length) }, (_, i) => {
    const first = FIRST[i] as string;
    const last = LAST[(offset + i) % LAST.length] as string;
    const handle = `${first}.${last}`.toLowerCase();
    return {
      id: `person_${String(i + 1).padStart(2, '0')}`,
      name: `${first} ${last}`,
      handle,
      email: `${handle}@example.com`,
      avatar: avatars.next(),
    };
  });
}

/** `count` items from `words`, joined: deterministic fictional phrases. */
export function phrase(rng: Rng, words: readonly string[], count: number): string {
  return Array.from({ length: count }, () => rng.pick(words)).join(' ');
}

export const ISO_DAY = 86_400_000;
