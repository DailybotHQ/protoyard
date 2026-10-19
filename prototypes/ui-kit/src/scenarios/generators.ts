import type {
  GenerateContext,
  Membership,
  Organization,
  Persona,
  WorldSeed,
} from '@protoyard/core';
import { FAVORITE_CANDIDATE_IDS } from '../catalog/entries.ts';
import type { Favorite } from '../database/schema.ts';

const PEOPLE = [
  {
    id: 'user_0001',
    name: 'Dana Reyes',
    title: 'Product designer',
    role: 'designer',
    color: '#7c3aed',
  },
  {
    id: 'user_0002',
    name: 'Sam Ito',
    title: 'Stakeholder (read-only)',
    role: 'viewer',
    color: '#0369a1',
  },
] as const;

/** Deterministic: favorites come from the seeded rng over the static catalog ids. */
export function generateUiKitWorld(ctx: GenerateContext): WorldSeed {
  const { scenario, time } = ctx;
  const orgCreated = time.daysAgo(scenario.organization.ageDays);
  const organization: Organization = {
    id: scenario.organization.id,
    name: scenario.organization.name ?? 'Protoyard Design',
    type: 'company',
    plan: 'free',
    billingStatus: 'active',
    createdAt: time.iso(orgCreated),
    size: PEOPLE.length,
    featureFlags: {},
  };
  const joined = (i: number) =>
    time.daysAgo(
      i === 0 ? scenario.organization.ageDays : Math.min(10, scenario.organization.ageDays)
    );
  const personas: Persona[] = PEOPLE.map((p, i) => ({
    id: p.id,
    name: p.name,
    email: `${p.name.split(' ')[0]?.toLowerCase()}@example.com`,
    title: p.title,
    avatarColor: p.color,
    locale: 'en-US',
    timezone: 'UTC',
    joinedAt: time.iso(joined(i)),
    onboardingComplete: true,
    preferences: {},
    summary: p.title,
  }));
  const memberships: Membership[] = PEOPLE.map((p, i) => ({
    id: `membership_${String(i + 1).padStart(4, '0')}`,
    personaId: p.id,
    organizationId: organization.id,
    role: p.role,
    joinedAt: time.iso(joined(i)),
    capabilities: [],
  }));

  const count = Math.max(
    0,
    Math.min(FAVORITE_CANDIDATE_IDS.length, Number(scenario.generators.favorites ?? 0) || 0)
  );
  const span = Math.max(1, scenario.organization.ageDays);
  const favorites: Favorite[] = [];
  for (const [i, person] of PEOPLE.entries()) {
    const rng = ctx.rng.fork(`favorites:${person.id}`);
    const picks = rng.sample(FAVORITE_CANDIDATE_IDS, i === 0 ? count : Math.floor(count / 2));
    for (const entryId of picks) {
      favorites.push({
        id: ctx.ids.next('fav'),
        personaId: person.id,
        entryId,
        createdAt: time.iso(
          time.daysAgo(rng.int(0, i === 0 ? span : Math.min(10, span)), rng.int(0, 8))
        ),
      });
    }
  }
  return { organizations: [organization], personas, memberships, tables: { favorites } };
}
