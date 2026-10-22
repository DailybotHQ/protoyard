import type {
  GenerateContext,
  Membership,
  Organization,
  Persona,
  WorldSeed,
} from '@protoyard/core';
import { createAvatarPool } from '@protoyard/scenarios';

export function generateDesignKitWorld(ctx: GenerateContext): WorldSeed {
  const { scenario, time } = ctx;
  const organization: Organization = {
    id: scenario.organization.id,
    name: scenario.organization.name ?? 'Studio North',
    type: 'company',
    plan: 'free',
    billingStatus: 'active',
    createdAt: time.iso(time.daysAgo(scenario.organization.ageDays)),
    size: 2,
    featureFlags: {},
  };
  const people = [
    {
      id: 'user_0001',
      name: 'Avery Chen',
      role: 'designer',
      joined: scenario.organization.ageDays,
    },
    { id: 'user_0002', name: 'Jordan Lee', role: 'viewer', joined: 12 },
  ];
  const faces = createAvatarPool(ctx.rng.fork('design-kit:avatars'));
  const personas: Persona[] = people.map((person, index) => ({
    id: person.id,
    name: person.name,
    avatar: faces.next(),
    email: `${person.name.split(' ')[0]?.toLowerCase()}@example.com`,
    title: person.role === 'designer' ? 'Design system owner' : 'Read-only stakeholder',
    role: person.role,
    avatarColor: index === 0 ? '#6d4aff' : '#087f8c',
    locale: 'en-US',
    timezone: 'UTC',
    joinedAt: time.iso(time.daysAgo(person.joined)),
    onboardingComplete: true,
    preferences: {},
    summary: person.role,
  }));
  const memberships: Membership[] = people.map((person, index) => ({
    id: `membership_${String(index + 1).padStart(4, '0')}`,
    personaId: person.id,
    organizationId: organization.id,
    role: person.role,
    joinedAt: personas[index]?.joinedAt ?? time.iso(time.now),
    capabilities: [],
  }));
  return { organizations: [organization], personas, memberships, tables: { reviews: [] } };
}
