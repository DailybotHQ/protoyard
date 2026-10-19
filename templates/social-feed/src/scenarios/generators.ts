import {
  type DomainEvent,
  type GenerateContext,
  type Membership,
  MS_PER_DAY,
  MS_PER_MINUTE,
  type Organization,
  type Persona,
  type Rng,
  type TimelineContext,
  type WorldSeed,
} from '@protoyard/core';
import { eventStream } from '@protoyard/scenarios';
import type {
  Comment,
  Follow,
  Notification,
  Person,
  Post,
  Reaction,
  ReactionKind,
} from '../database/schema.ts';
import { EMPTY_COUNTS } from '../domain/feed.ts';
import type { SocialGeneratorOptions } from './index.ts';

/**
 * Deterministic world builder. Post history and notification activity come
 * from `eventStream()` in @protoyard/scenarios (Poisson days, weekly rhythm,
 * ids that do not depend on the window); everything else uses `ctx.rng`
 * forks and `ctx.ids`. Text is composed from fixed phrases (plain text,
 * fictional), media are generated placeholders.
 */

/** Bump when the same seed would produce a different world. */
export const SOCIAL_GENERATOR_VERSION = 1;

const PEOPLE = [
  {
    id: 'user_0001',
    name: 'Mila Torres',
    title: 'Community member',
    role: 'member',
    color: '#e11d48',
  },
  {
    id: 'user_0002',
    name: 'Kofi Mensah',
    title: 'Community moderator',
    role: 'moderator',
    color: '#7c3aed',
  },
  {
    id: 'user_0003',
    name: 'Hana Ito',
    title: 'Reader (read-only)',
    role: 'viewer',
    color: '#0891b2',
  },
] as const;

const NETWORK = [
  'Ava Brooks',
  'Noah Kim',
  'Zara Ali',
  'Leo Novak',
  'Ines Costa',
  'Omar Haddad',
  'Freya Lund',
  'Diego Ramos',
  'Mei Chen',
  'Tariq Aziz',
  'Elena Petrova',
  'Jonah Reyes',
  'Saoirse Byrne',
  'Ravi Iyer',
  'Lucia Moretti',
  'Kwame Asante',
  'Yuki Sato',
  'Amara Nwosu',
  'Felix Wagner',
  'Priya Raman',
  'Mateo Silva',
  'Nadia Karim',
  'Oskar Berg',
  'Talia Cohen',
];
const COLORS = [
  '#e11d48',
  '#7c3aed',
  '#0891b2',
  '#059669',
  '#d97706',
  '#2563eb',
  '#db2777',
  '#4d7c0f',
];
const BIOS = [
  'Field notes from the trail.',
  'Bread, books and bad puns.',
  'Building small tools for big teams.',
  'Birdwatcher. Sometimes a designer.',
  'Learning in public.',
  'Coffee, code, climbing.',
];
const OPENERS = [
  'Finally tried',
  'Hot take on',
  'Small win today with',
  'Week three of',
  'Anyone else into',
  'Notes from',
  'Quick tip about',
  'Still thinking about',
];
const TOPICS = [
  'sourdough starters',
  'trail running',
  'the new library wing',
  'pairing on hard bugs',
  'urban gardening',
  'film photography',
  'the farmers market',
  'learning Portuguese',
  'standing desks',
  'night hikes',
  'zine making',
  'open-source maintainers',
];
const CLOSERS = [
  'Would recommend.',
  'More soon.',
  'Thoughts?',
  'Not what I expected!',
  'Thread below.',
  'Ten out of ten.',
  'Send help.',
  'Tiny joys.',
];
const COMMENTS = [
  'Love this!',
  'Same here, honestly.',
  'Saving this for later.',
  'Where was this taken?',
  'Great tip, thanks!',
  'Ha, relatable.',
  'Tell me more.',
  'This made my day.',
];
const MS = MS_PER_MINUTE;

const handleOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z]+/g, '_')
    .replace(/^_|_$/g, '');
const personIdOf = (personaId: string) => `person_${personaId}`;

export function generatorOptions(ctx: Pick<GenerateContext, 'scenario'>): SocialGeneratorOptions {
  const raw = (ctx.scenario.generators.social ?? {}) as Partial<SocialGeneratorOptions>;
  return { postsPerDay: raw.postsPerDay ?? 8, days: raw.days ?? 30, seed: raw.seed !== false };
}

const postText = (rng: Rng) => `${rng.pick(OPENERS)} ${rng.pick(TOPICS)}. ${rng.pick(CLOSERS)}`;

function identities(ctx: GenerateContext) {
  const { scenario, time } = ctx;
  const ageDays = scenario.organization.ageDays;
  const subscription = scenario.organization.subscription;
  const organization: Organization = {
    id: scenario.organization.id,
    name: scenario.organization.name ?? 'Fieldnotes',
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
        : Math.round(ageDays * (1 - index / 4));
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
      summary: `${p.title} · ${role}`,
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

/** The network: three persona profiles plus 24 simulated members. */
function people(): Person[] {
  const personas = PEOPLE.map((p, i) => ({
    id: personIdOf(p.id),
    name: p.name,
    handle: handleOf(p.name),
    bio: BIOS[i % BIOS.length] as string,
    avatarColor: p.color,
    personaId: p.id,
  }));
  const network = NETWORK.map((name, i) => ({
    id: `person_${String(i + 1).padStart(3, '0')}`,
    name,
    handle: handleOf(name),
    bio: BIOS[(i + 3) % BIOS.length] as string,
    avatarColor: COLORS[i % COLORS.length] as string,
    personaId: null,
  }));
  return [...personas, ...network];
}

/** Payload of an activity event: indexes resolved against the rows when it is applied. */
export interface ActivityPayload {
  actorPick: number;
  postPick: number;
  reaction: ReactionKind;
  comment: number;
}
const ACTIVITY_KINDS = {
  'social.reaction': 6,
  'social.comment': 3,
  'social.follow': 1,
  'social.mention': 1,
};
const REACTION_PICK: ReactionKind[] = ['like', 'like', 'like', 'celebrate', 'insightful'];

/** Activity aimed at the actor: who reacts, comments, follows or mentions, from `eventStream()`. */
export function activityStream(
  ctx: Pick<GenerateContext, 'scenario'>,
  options: { days: number; to?: Date; ratePerDay: number }
): DomainEvent<ActivityPayload>[] {
  return eventStream<ActivityPayload>({
    ctx,
    days: options.days,
    ...(options.to ? { to: options.to } : {}),
    ratePerDay: options.ratePerDay,
    kinds: ACTIVITY_KINDS,
    hours: [7, 23],
    payload: ({ rng }) => ({
      actorPick: rng.next(),
      postPick: rng.next(),
      reaction: rng.pick(REACTION_PICK),
      comment: rng.int(0, COMMENTS.length - 1),
    }),
  });
}

/** Turns an activity event into the notification it produces (null when it has nothing to point at). */
export function notificationFor(
  event: DomainEvent<ActivityPayload>,
  network: readonly Person[],
  me: string,
  myPosts: readonly Post[]
): Notification | null {
  const others = network.filter((p) => p.id !== me && p.personaId === null);
  const actor = others[Math.floor(event.payload.actorPick * others.length)];
  if (!actor) return null;
  const post = myPosts[Math.floor(event.payload.postPick * myPosts.length)] ?? null;
  const base = {
    id: `notification:${event.id}`,
    recipientId: me,
    actorId: actor.id,
    at: event.at,
    read: false,
  };
  switch (event.type) {
    case 'social.reaction':
      return post
        ? { ...base, kind: 'reaction', postId: post.id, text: `${actor.name} reacted to your post` }
        : null;
    case 'social.comment':
      return post
        ? {
            ...base,
            kind: 'comment',
            postId: post.id,
            text: `${actor.name} commented on your post`,
          }
        : null;
    case 'social.follow':
      return { ...base, kind: 'follow', postId: null, text: `${actor.name} followed you` };
    default:
      return {
        ...base,
        kind: 'mention',
        postId: post?.id ?? null,
        text: `${actor.name} mentioned you`,
      };
  }
}

export const commentText = (index: number) => COMMENTS[index % COMMENTS.length] as string;

export function generateSocialWorld(ctx: GenerateContext): WorldSeed {
  const { organization, personas, memberships } = identities(ctx);
  const opts = generatorOptions(ctx);
  const ref = Date.parse(ctx.scenario.referenceTime);
  const network = people();
  const me = personIdOf(ctx.scenario.actor.id);
  const posts: Post[] = [];
  const comments: Comment[] = [];
  const reactions: Reaction[] = [];
  const follows: Follow[] = [];
  let notifications: Notification[] = [];

  if (opts.seed) {
    const rng = ctx.rng.fork('social');
    const authors = network.filter((p) => p.personaId === null || p.id === me);
    // Post history: Poisson days with a weekly rhythm, scaled by the scenario density.
    const stream = eventStream({
      ctx,
      days: opts.days,
      ratePerDay: Math.max(1, Math.round(opts.postsPerDay * (ctx.scale(100) / 100))),
      kinds: { 'post.created': 1 },
      hours: [7, 23],
      payload: ({ rng: r }) => ({ author: r.next(), media: r.chance(0.18), hue: r.int(0, 359) }),
    });
    for (const event of stream) {
      const { author, media, hue } = event.payload as {
        author: number;
        media: boolean;
        hue: number;
      };
      // The actor writes about one post in twenty; the network writes the rest.
      const by = rng.chance(0.05)
        ? me
        : (authors[Math.floor(author * authors.length)] as Person).id;
      const at = Date.parse(event.at);
      const counts = { like: rng.int(0, 14), celebrate: rng.int(0, 4), insightful: rng.int(0, 3) };
      const post: Post = {
        id: ctx.ids.next('post'),
        authorId: by,
        text: postText(rng),
        media: media
          ? { kind: 'image', hue, alt: `Placeholder photo about ${TOPICS[hue % TOPICS.length]}` }
          : null,
        createdAt: event.at,
        reactionCounts: counts,
        commentCount: 0,
      };
      // About a quarter of posts have one or two comments, written after the post and before now.
      if (rng.chance(0.25)) {
        for (let k = rng.int(1, 2); k > 0; k--) {
          const commentAt = Math.min(ref, at + rng.int(5, 600) * MS);
          comments.push({
            id: ctx.ids.next('comment'),
            postId: post.id,
            authorId: (rng.pick(authors) as Person).id,
            text: rng.pick(COMMENTS),
            createdAt: new Date(commentAt).toISOString(),
          });
          post.commentCount++;
        }
      }
      // The actor already reacted to some posts by others (their own reaction, counted).
      if (by !== me && rng.chance(0.12)) {
        const kind = rng.pick(REACTION_PICK);
        reactions.push({
          id: ctx.ids.next('reaction'),
          postId: post.id,
          personId: me,
          kind,
          createdAt: new Date(Math.min(ref, at + 30 * MS)).toISOString(),
        });
        post.reactionCounts = { ...EMPTY_COUNTS, ...counts, [kind]: counts[kind] + 1 };
      }
      posts.push(post);
    }
    // The actor follows half the network; a third follows back.
    const others = network.filter((p) => p.id !== me && p.personaId === null);
    const created = new Date(
      Math.max(Date.parse(organization.createdAt), ref - opts.days * MS_PER_DAY)
    ).toISOString();
    others.forEach((p, i) => {
      if (i % 2 === 0)
        follows.push({
          id: ctx.ids.next('follow'),
          followerId: me,
          followeeId: p.id,
          createdAt: created,
        });
      if (i % 3 === 0)
        follows.push({
          id: ctx.ids.next('follow'),
          followerId: p.id,
          followeeId: me,
          createdAt: created,
        });
    });
    // The inbox: five days of activity aimed at the actor; older than a day is read.
    const myPosts = posts.filter((p) => p.authorId === me);
    notifications = activityStream(ctx, { days: 5, ratePerDay: 6 })
      .map((event) => notificationFor(event, network, me, myPosts))
      .filter((n): n is Notification => n !== null)
      .map((n) => ({ ...n, read: Date.parse(n.at) < ref - MS_PER_DAY }));
  }
  return {
    organizations: [organization],
    personas,
    memberships,
    tables: { people: network, posts, reactions, comments, follows, notifications },
  };
}

/**
 * Simulated time: activity aimed at the actor arrives as notifications, and
 * reactions and comments land on their posts. Built from the same
 * `eventStream()` as the seeded inbox, resolved against current rows.
 */
export async function socialTimeline(ctx: TimelineContext): Promise<DomainEvent[]> {
  if (!generatorOptions(ctx).seed) return [];
  const days = (ctx.to.getTime() - ctx.from.getTime()) / MS_PER_DAY;
  if (days <= 0) return [];
  const network = (await ctx.read('people')) as unknown as Person[];
  const me = personIdOf(ctx.scenario.actor.id);
  const myPosts = ((await ctx.read('posts')) as unknown as Post[])
    .filter((p) => p.authorId === me)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  // Someone who already follows the actor cannot follow again (follows are unique per pair).
  const followers = new Set(
    ((await ctx.read('follows')) as unknown as Follow[])
      .filter((f) => f.followeeId === me)
      .map((f) => f.followerId)
  );
  return activityStream(ctx, { days, to: ctx.to, ratePerDay: 6 }).flatMap((event) => {
    const notification = notificationFor(event, network, me, myPosts);
    if (!notification) return [];
    if (notification.kind === 'follow') {
      if (followers.has(notification.actorId)) return [];
      followers.add(notification.actorId);
    }
    return [
      {
        ...event,
        payload: {
          notification,
          comment: commentText(event.payload.comment),
          reaction: event.payload.reaction,
        },
      },
    ];
  });
}
