import {
  type GenerateContext,
  type Membership,
  MS_PER_HOUR,
  type Organization,
  type Persona,
  type WorldSeed,
} from '@protoyard/core';
import { type Document, type Folder, TAG_COLORS, type Tag } from '../database/schema.ts';
import type { DesktopGeneratorOptions } from './index.ts';

/**
 * Deterministic world builder. Everything random comes from `ctx.rng` /
 * `ctx.faker` (seeded) and every date from `ctx.time` (anchored at the
 * scenario reference time), so the same scenario renders the same world on
 * every machine. Order matters: people → folders → tags → documents.
 */

/** Bump when the same seed would produce a different world. */
export const DESKTOP_GENERATOR_VERSION = 1;

/** Fixed people, so links like `?actor=user_0003` always mean the same person. */
const PEOPLE = [
  { id: 'user_0001', name: 'Noa Brennan', title: 'Founder', role: 'owner', color: '#7c3aed' },
  { id: 'user_0002', name: 'Teo Salazar', title: 'Writer', role: 'editor', color: '#0891b2' },
  {
    id: 'user_0003',
    name: 'Ines Park',
    title: 'Reviewer (read-only)',
    role: 'viewer',
    color: '#d97706',
  },
] as const;

const FOLDER_NAMES = [
  'Inbox',
  'Projects',
  'Meeting notes',
  'Research',
  'Ideas',
  'Reading list',
  'Journal',
  'Recipes',
  'Travel',
  'Design',
  'Planning',
  'Archive',
  'Drafts',
  'Clients',
  'Hiring',
  'Retros',
  'Roadmap',
  'Specs',
  'Support',
  'Marketing',
  'Finance',
  'Legal',
  'Ops',
  'Personal',
] as const;

const TAG_NAMES = [
  'urgent',
  'idea',
  'draft',
  'review',
  'reference',
  'follow-up',
  'personal',
  'q4',
] as const;

const TITLE_STARTS = [
  'Notes on',
  'Plan for',
  'Ideas about',
  'Checklist:',
  'Summary of',
  'Questions on',
  'Draft:',
  'Review of',
] as const;

function options(ctx: GenerateContext): DesktopGeneratorOptions {
  const raw = (ctx.scenario.generators.desktop ?? {}) as Partial<DesktopGeneratorOptions>;
  return {
    folders: Math.max(0, Math.min(FOLDER_NAMES.length, Math.floor(raw.folders ?? 5))),
    documentsPerFolder: raw.documentsPerFolder ?? [3, 9],
    tags: Math.max(0, Math.min(TAG_NAMES.length, Math.floor(raw.tags ?? 6))),
  };
}

function identities(ctx: GenerateContext) {
  const { scenario, time } = ctx;
  const ageDays = scenario.organization.ageDays;
  const organization: Organization = {
    id: scenario.organization.id,
    name: scenario.organization.name ?? 'Fieldnote Studio',
    type: 'company',
    plan: 'pro',
    billingStatus: 'active',
    createdAt: time.iso(time.daysAgo(ageDays)),
    size: PEOPLE.length,
    featureFlags: { ...scenario.organization.featureFlags },
  };
  const personas: Persona[] = [];
  const memberships: Membership[] = [];
  PEOPLE.forEach((p, index) => {
    const days =
      p.id === scenario.actor.id
        ? Math.min(ageDays, scenario.actor.joinedDaysAgo)
        : Math.round(ageDays * (1 - index / (PEOPLE.length + 1)));
    const joinedAt = time.iso(time.daysAgo(days));
    // The scenario decides the actor's role; the others keep their fixed role.
    const role = p.id === scenario.actor.id ? scenario.actor.role : p.role;
    personas.push({
      id: p.id,
      name: p.name,
      email: `${p.name.split(' ')[0]?.toLowerCase()}@example.com`,
      title: p.title,
      avatarColor: p.color,
      locale: 'en-US',
      timezone: 'UTC',
      joinedAt,
      onboardingComplete: true,
      preferences: {},
      summary: `${p.title} · ${role}, joined ${days === 0 ? 'today' : `${days} days ago`}`,
    });
    memberships.push({
      id: `membership_${String(index + 1).padStart(4, '0')}`,
      personaId: p.id,
      organizationId: organization.id,
      role,
      joinedAt,
      capabilities: [],
    });
  });
  return { organization, personas, memberships };
}

export function generateDesktopWorld(ctx: GenerateContext): WorldSeed {
  const { rng, faker, time, ids } = ctx;
  const { organization, personas, memberships } = identities(ctx);
  const opts = options(ctx);
  const startMs = Date.parse(organization.createdAt);
  const nowMs = time.now.getTime();
  // Viewers never author anything.
  const authors = memberships.filter((m) => m.role !== 'viewer').map((m) => m.personaId);
  const author = () => rng.pick(authors) ?? 'user_0001';

  // An empty workspace still has an Inbox, so "New document" always has a home.
  const folderCount = Math.max(1, opts.folders);
  const folders: Folder[] = FOLDER_NAMES.slice(0, folderCount).map((name, i) => {
    const at = time.iso(new Date(startMs + i * MS_PER_HOUR));
    return { id: ids.next('folder'), name, createdAt: at, updatedAt: at };
  });

  const tags: Tag[] = TAG_NAMES.slice(0, opts.tags).map((name, i) => ({
    id: ids.next('tag'),
    name,
    color: TAG_COLORS[i % TAG_COLORS.length] ?? 'slate',
    createdAt: organization.createdAt,
  }));

  const drafts: Omit<Document, 'id'>[] = [];
  if (opts.folders > 0) {
    for (const folder of folders) {
      const count = rng.int(opts.documentsPerFolder[0], opts.documentsPerFolder[1]);
      for (let i = 0; i < count; i++) {
        const createdMs = time.between(new Date(startMs), time.now, rng.next).getTime();
        const updatedMs = Math.min(nowMs, createdMs + rng.int(0, 240) * MS_PER_HOUR);
        const by = author();
        drafts.push({
          folderId: folder.id,
          title: `${rng.pick(TITLE_STARTS)} ${faker.lorem.words(rng.int(1, 3))}`,
          body: faker.lorem.paragraphs(rng.int(1, 4), '\n\n'),
          tagIds: rng.sample(tags, rng.int(0, Math.min(3, tags.length))).map((t) => t.id),
          pinned: rng.chance(0.06),
          authorId: by,
          updatedBy: rng.chance(0.7) ? by : author(),
          createdAt: time.iso(new Date(createdMs)),
          updatedAt: time.iso(new Date(updatedMs)),
        });
      }
    }
  }

  // Ids follow creation time, like a real sequence.
  const documents: Document[] = drafts
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((draft) => ({ id: ids.next('doc'), ...draft }));

  return {
    organizations: [organization],
    personas,
    memberships,
    tables: { folders, tags, documents },
  };
}
