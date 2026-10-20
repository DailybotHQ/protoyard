import {
  type GenerateContext,
  type Membership,
  MS_PER_DAY,
  type Organization,
  type Persona,
  type WorldSeed,
} from '@protoyard/core';
import { rankSequence } from '@protoyard/views/board';
import type { Page, PageVersion, Space } from '../database/schema.ts';
import type { WikiGeneratorOptions } from './index.ts';

/**
 * Deterministic world builder: `ctx.rng` forks, `ctx.faker`, `ctx.ids` and
 * the scenario reference time only. Order: people → spaces → curated page
 * trees → extra generated pages → versions (each page's history ends at its
 * current body, so restoring any version is meaningful).
 */

/** Bump when the same seed would produce a different world. */
export const WIKI_GENERATOR_VERSION = 1;

const PEOPLE = [
  {
    id: 'user_0001',
    name: 'Mara Quinn',
    title: 'Head of operations',
    role: 'owner',
    color: '#4338ca',
  },
  {
    id: 'user_0002',
    name: 'Theo Grant',
    title: 'Staff engineer',
    role: 'editor',
    color: '#0f766e',
  },
  {
    id: 'user_0003',
    name: 'Ines Duarte',
    title: 'Product manager',
    role: 'editor',
    color: '#b45309',
  },
  {
    id: 'user_0004',
    name: 'Ravi Patel',
    title: 'Support lead (read-only)',
    role: 'viewer',
    color: '#be185d',
  },
] as const;

type Outline = { title: string; children?: Outline[] };

const SPACES: (Omit<Space, 'id' | 'createdAt'> & { pages: Outline[] })[] = [
  {
    key: 'ENG',
    name: 'Engineering',
    icon: '🛠️',
    description: 'How we build, ship and run the product.',
    pages: [
      {
        title: 'Engineering handbook',
        children: [
          { title: 'Code review' },
          { title: 'Branching and releases' },
          { title: 'Testing strategy' },
        ],
      },
      {
        title: 'Architecture',
        children: [
          {
            title: 'Service map',
            children: [{ title: 'Billing service' }, { title: 'Search service' }],
          },
          {
            title: 'Decision records',
            children: [{ title: 'ADR-001 Event bus' }, { title: 'ADR-002 Feature flags' }],
          },
        ],
      },
      {
        title: 'Runbooks',
        children: [
          { title: 'On-call basics' },
          { title: 'Restore a backup' },
          { title: 'Rotate credentials' },
        ],
      },
      {
        title: 'Onboarding for engineers',
        children: [{ title: 'First week' }, { title: 'Local setup' }],
      },
      { title: 'Markdown safety check' },
    ],
  },
  {
    key: 'PRD',
    name: 'Product',
    icon: '🧭',
    description: 'Strategy, roadmaps and research notes.',
    pages: [
      {
        title: 'Product strategy',
        children: [{ title: 'North-star metric' }, { title: 'Pricing principles' }],
      },
      { title: 'Roadmap', children: [{ title: 'Now' }, { title: 'Next' }, { title: 'Later' }] },
      {
        title: 'Research',
        children: [
          { title: 'Interview guide' },
          { title: 'Customer interviews: Q3' },
          { title: 'Survey results' },
        ],
      },
      {
        title: 'Release notes',
        children: [{ title: 'October release' }, { title: 'September release' }],
      },
    ],
  },
  {
    key: 'OPS',
    name: 'People & Ops',
    icon: '🌱',
    description: 'Policies, benefits and the way we work together.',
    pages: [
      {
        title: 'Team handbook',
        children: [{ title: 'Working hours' }, { title: 'Time off' }, { title: 'Travel policy' }],
      },
      { title: 'Benefits', children: [{ title: 'Learning budget' }, { title: 'Home office' }] },
      {
        title: 'Rituals',
        children: [
          { title: 'Weekly sync' },
          { title: 'Quarterly planning' },
          { title: 'Retrospectives' },
        ],
      },
      { title: 'Office guide' },
    ],
  },
];

/** Content that must never run: the preview shows every line of it as text. */
export const HOSTILE_BODY = [
  '# Markdown safety check',
  '',
  'This page keeps examples of content that must never run. The preview renders Markdown as elements and shows anything else as plain text.',
  '',
  '<script>alert("not today")</script>',
  '',
  '<img src="x" onerror="alert(1)">',
  '',
  '- [A javascript: link](javascript:alert(1)) shows as text, not a link.',
  '- [A data: link](data:text/html,<b>x</b>) too.',
  '- [A normal link](https://example.com/handbook) works.',
  '',
  '```html',
  '<iframe src="https://example.com"></iframe>',
  '```',
].join('\n');

const UPDATES = [
  'Clarified who owns this page.',
  'Added the steps we missed last time.',
  'Linked the related runbook.',
  'Removed an outdated section.',
  'Fixed typos and headings.',
];

function options(ctx: GenerateContext): WikiGeneratorOptions {
  const raw = (ctx.scenario.generators.wiki ?? {}) as Partial<WikiGeneratorOptions>;
  return {
    seed: raw.seed !== false,
    extraPages: Math.max(0, Math.min(5000, Math.round(raw.extraPages ?? 0))),
  };
}

function identities(ctx: GenerateContext) {
  const { scenario, time } = ctx;
  const ageDays = scenario.organization.ageDays;
  const subscription = scenario.organization.subscription;
  const organization: Organization = {
    id: scenario.organization.id,
    name: scenario.organization.name ?? 'Northwind Labs (fictional)',
    type: 'company',
    plan: subscription === 'trial' || subscription === 'expired' ? 'pro' : subscription,
    billingStatus:
      subscription === 'expired' ? 'expired' : subscription === 'trial' ? 'trialing' : 'active',
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
        : index === 0
          ? ageDays
          : Math.round(ageDays * (1 - index / (PEOPLE.length + 1)));
    const joinedAt = time.iso(time.daysAgo(days));
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

/** A plausible Markdown body for a page title (fictional, deterministic). */
function bodyFor(
  ctx: GenerateContext,
  rng: GenerateContext['rng'],
  title: string,
  space: string
): string {
  const f = ctx.faker;
  const steps = Array.from(
    { length: rng.int(2, 4) },
    (_, i) => `${i + 1}. ${f.hacker.verb()} the ${f.hacker.noun()} and note the result.`
  );
  const bullets = Array.from(
    { length: rng.int(2, 4) },
    () => `- **${f.word.adjective()}**: ${f.lorem.sentence()}`
  );
  return [
    `# ${title}`,
    '',
    `${f.lorem.sentences(2)} This page belongs to the ${space} space.`,
    '',
    '## Key points',
    '',
    ...bullets,
    '',
    '## Steps',
    '',
    ...steps,
    '',
    rng.chance(0.4) ? '```bash\npnpm protoyard dev my-idea\n```\n' : `> ${f.lorem.sentence()}\n`,
    `See also [the handbook](https://example.com/${f.lorem.slug(2)}).`,
  ].join('\n');
}

export function generateWikiWorld(ctx: GenerateContext): WorldSeed {
  const { organization, personas, memberships } = identities(ctx);
  const opts = options(ctx);
  const ref = Date.parse(ctx.scenario.referenceTime);
  const orgCreated = Date.parse(organization.createdAt);
  const spaces: Space[] = [];
  const pages: Page[] = [];
  const versions: PageVersion[] = [];
  if (!opts.seed) {
    return {
      organizations: [organization],
      personas,
      memberships,
      tables: { spaces, pages, versions },
    };
  }

  const rng = ctx.rng.fork('pages');
  const writers = ['user_0001', 'user_0002', 'user_0003'];
  /** A page and its history: 1–5 versions, the last one equal to the page. */
  const addPage = (
    spaceId: string,
    parentId: string | null,
    rank: string,
    title: string,
    body: string,
    maxVersions: number
  ) => {
    const id = ctx.ids.next('page');
    const count = rng.int(1, maxVersions);
    const createdMs = orgCreated + Math.floor(rng.next() * (ref - orgCreated) * 0.7);
    let at = createdMs;
    let text = body;
    const history: { body: string; at: number; author: string }[] = [];
    // Build older states by taking update lines away from the final body.
    const lines = Array.from({ length: count - 1 }, () => rng.pick(UPDATES) ?? UPDATES[0]);
    for (let v = 1; v <= count; v++) {
      const extra = lines
        .slice(0, v - 1)
        .map((l) => `\n_Update: ${l}_`)
        .join('');
      text = `${body}${extra}`;
      history.push({ body: text, at, author: rng.pick(writers) ?? 'user_0001' });
      at = Math.min(ref - 3_600_000, at + rng.int(1, 12) * MS_PER_DAY);
    }
    history.forEach((h, i) => {
      versions.push({
        id: ctx.ids.next('version'),
        pageId: id,
        version: i + 1,
        title,
        body: h.body,
        authorId: h.author,
        note: i === 0 ? 'Created' : 'Edited',
        at: new Date(h.at).toISOString(),
      });
    });
    const last = history.at(-1) as (typeof history)[number];
    pages.push({
      id,
      spaceId,
      parentId,
      rank,
      title,
      body: last.body,
      version: count,
      createdBy: history[0]?.author ?? 'user_0001',
      createdAt: new Date(createdMs).toISOString(),
      updatedBy: last.author,
      updatedAt: new Date(last.at).toISOString(),
    });
    return id;
  };

  const containers: { spaceId: string; id: string; title: string }[] = [];
  for (const s of SPACES) {
    const space: Space = {
      id: ctx.ids.next('space'),
      key: s.key,
      name: s.name,
      icon: s.icon,
      description: s.description,
      createdAt: organization.createdAt,
    };
    spaces.push(space);
    const walk = (outline: Outline[], parentId: string | null) => {
      const ranks = rankSequence(outline.length);
      outline.forEach((o, i) => {
        const body =
          o.title === 'Markdown safety check' ? HOSTILE_BODY : bodyFor(ctx, rng, o.title, s.name);
        const id = addPage(space.id, parentId, ranks[i] as string, o.title, body, 5);
        if (o.title === 'Runbooks' || o.title === 'Rituals' || o.title === 'Research') {
          containers.push({ spaceId: space.id, id, title: o.title });
        }
        if (o.children) walk(o.children, id);
      });
    };
    walk(s.pages, null);
  }

  // Extra pages (the `large` scenario): dated notes under a few container pages.
  if (opts.extraPages > 0 && containers.length > 0) {
    const perContainer = Math.ceil(opts.extraPages / containers.length);
    let made = 0;
    for (const c of containers) {
      const existing = pages
        .filter((p) => p.parentId === c.id)
        .map((p) => p.rank)
        .sort();
      const ranks = rankSequence(perContainer, existing.at(-1) ?? null);
      for (let i = 0; i < perContainer && made < opts.extraPages; i++, made++) {
        const day = new Date(ref - (i + 1) * MS_PER_DAY).toISOString().slice(0, 10);
        const title = `${c.title === 'Runbooks' ? `Incident review ${ctx.faker.hacker.noun()}` : c.title === 'Rituals' ? 'Weekly sync' : 'Interview notes'} ${day} #${i + 1}`;
        const body = `# ${title}\n\n${ctx.faker.lorem.sentences(3)}\n\n- ${ctx.faker.lorem.sentence()}\n- ${ctx.faker.lorem.sentence()}`;
        addPage(c.spaceId, c.id, ranks[i] as string, title, body, 2);
      }
    }
  }

  return {
    organizations: [organization],
    personas,
    memberships,
    tables: { spaces, pages, versions },
  };
}
