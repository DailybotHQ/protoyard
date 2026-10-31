import type {
  GenerateContext,
  Membership,
  Organization,
  Persona,
  WorldSeed,
} from '@protoyard/core';
import { createAvatarPool } from '@protoyard/scenarios';
import { type CanvasBoardOptions, generateCanvasBoard } from '@protoyard/views/scenarios';
import type { CanvasDocument } from '@texuli/canvas/model';
import type { Board } from '../database/schema.ts';

/**
 * Deterministic world builder. Everything random comes from `ctx.rng` /
 * `ctx.faker` (seeded) and every date from `ctx.time` (anchored at the
 * scenario reference time), so the same scenario renders the same world on
 * every machine.
 */

const BOARD_TITLES = [
  'Launch plan',
  'Q3 roadmap',
  'Onboarding journey',
  'Sprint retro',
  'Support handoff',
  'Pricing workshop',
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
  const faces = createAvatarPool(ctx.rng.fork('canvas-board:avatars:people'));
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

/**
 * Boards per scenario (`generators.boards`), each a seeded planning board from
 * `@protoyard/views/scenarios` (`generateCanvasBoard`). The first board's
 * content level is the scenario's `generators.boardLevel` (`typical`,
 * `dense` for 1,500 notes, or `edge` for awkward shapes); the rest are
 * typical. Each board draws from its own stream (the scenario id plus its
 * index), so boards differ and adding one never changes another.
 */
export function generateCanvasBoardWorld(ctx: GenerateContext): WorldSeed {
  const world = identities(ctx);
  const requested = Number(ctx.scenario.generators.boards ?? 3);
  const count = Math.max(
    0,
    Math.min(BOARD_TITLES.length, Number.isFinite(requested) ? requested : 0)
  );
  const firstLevel = (ctx.scenario.generators.boardLevel ?? 'typical') as NonNullable<
    CanvasBoardOptions['level']
  >;
  const ageDays = Math.max(1, ctx.scenario.organization.ageDays);
  const boards: Board[] = BOARD_TITLES.slice(0, count).map((title, i) => {
    const created = ctx.time.daysAgo(ctx.rng.int(1, ageDays), ctx.rng.int(0, 8));
    const updated = new Date(
      Math.min(ctx.time.now.getTime(), created.getTime() + ctx.rng.int(0, 72) * 3_600_000)
    );
    const canvas = generateCanvasBoard(
      { ...ctx, scenario: { ...ctx.scenario, id: `${ctx.scenario.id}:board-${i + 1}` } },
      { title, level: i === 0 ? firstLevel : 'typical' }
    ) as unknown as CanvasDocument;
    return {
      id: ctx.ids.next('board'),
      title,
      canvas,
      ownerId: 'user_0001',
      createdAt: ctx.time.iso(created),
      updatedAt: ctx.time.iso(updated),
    };
  });
  return { ...world, tables: { boards } };
}
