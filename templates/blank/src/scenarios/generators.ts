import type {
  GenerateContext,
  Membership,
  Organization,
  Persona,
  WorldSeed,
} from '@protoyard/core';
import { createAvatarPool } from '@protoyard/scenarios';
import type { Note } from '../database/schema.ts';

/**
 * Deterministic world builder. Everything random comes from `ctx.rng` /
 * `ctx.faker` (seeded) and every date from `ctx.time` (anchored at the
 * scenario reference time), so the same scenario renders the same world on
 * every machine.
 */

const NOTE_TOPICS = [
  ['Kickoff agenda', 'Goals for the quarter, owners and the first milestone.'],
  ['Customer interview: Ada', 'Wants faster exports; currently copies data by hand every Friday.'],
  ['Design review notes', 'Tighten the empty states and make the primary action obvious.'],
  ['Launch checklist', 'Docs, changelog, status page, support macros, announcement draft.'],
  ['Retro — sprint 4', 'Went well: pairing. To improve: smaller pull requests.'],
  ['Pricing ideas', 'Free tier with 3 projects; Pro unlocks history and sharing.'],
  ['Onboarding copy', 'Shorter welcome, one clear first step, skip button always visible.'],
  ['Bug bash results', '14 issues found, 9 fixed, 3 need design input.'],
  ['Hiring plan', 'One designer in Q1, one engineer in Q2.'],
  ['Weekly sync', 'Demo the new editor, decide on the beta date.'],
  ['Reading list', 'Accessibility basics, writing for interfaces, calm technology.'],
  ['Support themes', 'Password resets and CSV imports dominate this month.'],
] as const;

function identities(
  ctx: GenerateContext
): Pick<WorldSeed, 'organizations' | 'personas' | 'memberships'> {
  const { scenario, time } = ctx;
  const orgCreated = time.daysAgo(scenario.organization.ageDays);
  const organization: Organization = {
    id: scenario.organization.id,
    name: scenario.organization.name ?? 'Northwind Studio',
    type: 'company',
    plan: 'free',
    billingStatus: 'active',
    createdAt: time.iso(orgCreated),
    size: 2,
    featureFlags: {},
  };
  // Fixed people so links like `?actor=user_0002` keep meaning the same person.
  const people = [
    {
      id: 'user_0001',
      name: 'Olivia Hart',
      title: 'Workspace owner',
      role: 'owner',
      joined: scenario.organization.ageDays,
    },
    {
      id: 'user_0002',
      name: 'Victor Lane',
      title: 'Stakeholder (read-only)',
      role: 'viewer',
      joined: Math.min(14, scenario.organization.ageDays),
    },
  ];
  // Library faces (`av-NNN`) from their own fork: no other seeded value shifts.
  const faces = createAvatarPool(ctx.rng.fork('blank:avatars:people'));
  const personas: Persona[] = people.map((p, i) => ({
    id: p.id,
    name: p.name,
    avatar: faces.next(),
    email: `${p.name.split(' ')[0]?.toLowerCase()}@example.com`,
    title: p.title,
    avatarColor: i === 0 ? '#7c3aed' : '#0369a1',
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

export function generateBlankWorld(ctx: GenerateContext): WorldSeed {
  const world = identities(ctx);
  const requested = Number(ctx.scenario.generators.notes ?? ctx.scale(12));
  const count = Math.max(
    0,
    Math.min(NOTE_TOPICS.length, Number.isFinite(requested) ? requested : 0)
  );
  const ageDays = Math.max(1, ctx.scenario.organization.ageDays);
  const viewer = world.personas[1];
  const notes: Note[] = ctx.rng.sample(NOTE_TOPICS, count).map(([title, body], i) => {
    const created = ctx.time.daysAgo(ctx.rng.int(1, ageDays), ctx.rng.int(0, 8));
    const updated = new Date(
      Math.min(ctx.time.now.getTime(), created.getTime() + ctx.rng.int(0, 72) * 3_600_000)
    );
    return {
      id: ctx.ids.next('note'),
      title,
      body,
      // The viewer can only have authored notes after joining (as an editor, before a role change).
      authorId:
        viewer && i % 4 === 3 && created.toISOString() >= viewer.joinedAt ? viewer.id : 'user_0001',
      pinned: ctx.rng.chance(0.25),
      createdAt: ctx.time.iso(created),
      updatedAt: ctx.time.iso(updated),
    };
  });
  return { ...world, tables: { notes } };
}
