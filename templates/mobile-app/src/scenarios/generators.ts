import type {
  GenerateContext,
  Membership,
  Organization,
  Persona,
  WorldSeed,
} from '@protoyard/core';
import { createAvatarPool } from '@protoyard/scenarios';
import { ITEM_STATUSES, type Item } from '../database/schema.ts';

/**
 * Deterministic world builder. Everything random comes from `ctx.rng` /
 * `ctx.faker` (seeded) and every date from `ctx.time` (anchored at the
 * scenario reference time), so the same scenario renders the same world on
 * every machine. Never use Math.random() or Date.now() here.
 */

const ITEM_IDEAS = [
  ['Sketch the onboarding screens', 'Three steps max, skip always visible.'],
  ['Pick an app icon', 'Try the rounded variant on both light and dark wallpapers.'],
  ['Write push notification copy', 'Short, useful, never more than one per day.'],
  ['Test on a small phone', '320px wide: nothing should overflow.'],
  ['Review accessibility labels', 'Every icon button needs a name.'],
  ['Plan the beta', 'Ten friendly users, one feedback form.'],
  ['Empty state illustrations', 'Friendly, not cute. One clear action.'],
  ['Offline behavior', 'Show what is cached and what is waiting to sync.'],
  ['Settings screen', 'Notifications, theme, sign out.'],
  ['App store screenshots', 'Five screens, real-looking data, captions under 30 characters.'],
  ['Haptics pass', 'Light tap on success, nothing on navigation.'],
  ['Release notes', 'What changed, in plain words.'],
] as const;

function identities(
  ctx: GenerateContext
): Pick<WorldSeed, 'organizations' | 'personas' | 'memberships'> {
  const { scenario, time } = ctx;
  const organization: Organization = {
    id: scenario.organization.id,
    name: scenario.organization.name ?? 'Pocket Studio',
    type: 'company',
    plan: 'free',
    billingStatus: 'active',
    createdAt: time.iso(time.daysAgo(scenario.organization.ageDays)),
    size: 2,
    featureFlags: {},
  };
  // Fixed people so links like `?actor=user_0002` keep meaning the same person.
  const people = [
    {
      id: 'user_0001',
      name: 'Maya Brooks',
      title: 'Owner',
      role: 'owner',
      color: '#047857',
      joined: scenario.organization.ageDays,
    },
    {
      id: 'user_0002',
      name: 'Leo Park',
      title: 'Viewer (read-only)',
      role: 'viewer',
      color: '#0369a1',
      joined: Math.min(7, scenario.organization.ageDays),
    },
  ];
  // Library faces (`av-NNN`) from their own fork: no other seeded value shifts.
  const faces = createAvatarPool(ctx.rng.fork('mobile-app:avatars:people'));
  const personas: Persona[] = people.map((p) => ({
    id: p.id,
    name: p.name,
    avatar: faces.next(),
    email: `${p.name.split(' ')[0]?.toLowerCase()}@example.com`,
    title: p.title,
    avatarColor: p.color,
    locale: 'en-US',
    timezone: 'UTC',
    joinedAt: time.iso(time.daysAgo(p.joined)),
    onboardingComplete: true,
    preferences: {},
    summary: `${p.title}, joined ${p.joined === 0 ? 'today' : `${p.joined} days ago`}`,
  }));
  const memberships: Membership[] = people.map((p, i) => ({
    id: `membership_${String(i + 1).padStart(4, '0')}`,
    personaId: p.id,
    organizationId: organization.id,
    role: p.role,
    joinedAt: time.iso(time.daysAgo(p.joined)),
    capabilities: [],
  }));
  return { organizations: [organization], personas, memberships };
}

export function generateMobileWorld(ctx: GenerateContext): WorldSeed {
  const world = identities(ctx);
  const requested = Number(ctx.scenario.generators.items ?? ctx.scale(12));
  const count = Math.max(
    0,
    Math.min(ITEM_IDEAS.length, Number.isFinite(requested) ? requested : 0)
  );
  const ageDays = Math.max(1, ctx.scenario.organization.ageDays);
  const items: Item[] = ctx.rng.sample(ITEM_IDEAS, count).map(([title, notes]) => {
    const created = ctx.time.daysAgo(ctx.rng.int(1, ageDays), ctx.rng.int(0, 8));
    const updated = new Date(
      Math.min(ctx.time.now.getTime(), created.getTime() + ctx.rng.int(0, 96) * 3_600_000)
    );
    return {
      id: ctx.ids.next('item'),
      title,
      notes,
      status: ctx.rng.pick(ITEM_STATUSES),
      ownerId: 'user_0001',
      createdAt: ctx.time.iso(created),
      updatedAt: ctx.time.iso(updated),
    };
  });
  return { ...world, tables: { items } };
}
