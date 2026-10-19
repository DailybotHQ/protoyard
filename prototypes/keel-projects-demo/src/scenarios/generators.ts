import {
  type DomainEvent,
  type EventApplyContext,
  type GenerateContext,
  type Membership,
  MS_PER_DAY,
  type Organization,
  type Persona,
  type Row,
  type TimelineContext,
  type WorldSeed,
} from '@protoyard/core';
import { createAvatarPool, dailyEvents, schedule } from '@protoyard/scenarios';
import {
  type Activity,
  type Comment,
  type Dependency,
  type Project,
  type ProjectColor,
  type Ritual,
  type SavedView,
  type Sprint,
  TASK_STATUSES,
  type Task,
  type TaskLabel,
  type TaskPriority,
  type TaskStatus,
} from '../database/schema.ts';
import { STATUS_LABELS } from '../domain/tasks.ts';
import type { TaskGeneratorOptions } from './index.ts';

/**
 * Deterministic world builder. Order matters for determinism and referential
 * integrity: organization → people → projects → tasks → comments → activity.
 * Randomness comes only from `ctx.rng` and dates only from `ctx.time`, so the
 * same scenario renders the same world on every machine.
 */

/**
 * Bump when the same seed can produce a different world.
 * v2: personas carry library avatars (`av-NNN`), shown as photos.
 */
export const TASKS_GENERATOR_VERSION = 4;

/**
 * Fixed cast, so `?actor=user_0003` always means Priya. Join offsets are
 * days after the organization was created (no randomness), which keeps the
 * world identical when only the scenario's actor changes.
 */
const CAST = [
  {
    id: 'user_0001',
    name: 'Maya Chen',
    title: 'Head of Product',
    role: 'owner',
    after: 0,
    color: '#7c3aed',
  },
  {
    id: 'user_0002',
    name: 'Jordan Blake',
    title: 'Engineering Manager',
    role: 'admin',
    after: 0,
    color: '#2563eb',
  },
  {
    id: 'user_0003',
    name: 'Priya Nair',
    title: 'Frontend Engineer',
    role: 'member',
    after: 1,
    color: '#db2777',
  },
  {
    id: 'user_0004',
    name: 'Sam Ortiz',
    title: 'Product Designer',
    role: 'member',
    after: 2,
    color: '#d97706',
  },
  {
    id: 'user_0005',
    name: 'Lena Fischer',
    title: 'Backend Engineer',
    role: 'member',
    after: 3,
    color: '#059669',
  },
  {
    id: 'user_0006',
    name: 'Theo Grant',
    title: 'Client Stakeholder',
    role: 'viewer',
    after: 7,
    color: '#0891b2',
  },
] as const;

interface ProjectBlueprint {
  name: string;
  key: string;
  color: ProjectColor;
  description: string;
  tasks: readonly (readonly [string, TaskLabel])[];
}

const PROJECTS: readonly ProjectBlueprint[] = [
  {
    name: 'Fernway site relaunch',
    key: 'WEB',
    color: 'violet',
    description:
      'Client: Fernway Outfitters (fictional). Ship their new marketing site on a faster CMS with the refreshed brand.',
    tasks: [
      ['Audit current page speed scores', 'research'],
      ['Design new homepage hero', 'design'],
      ['Build responsive navigation', 'frontend'],
      ['Migrate blog posts to the new CMS', 'backend'],
      ['Set up redirects for retired URLs', 'backend'],
      ['Fix layout shift on pricing page', 'bug'],
      ['Write copy for the features page', 'docs'],
      ['Add cookie consent banner', 'feature'],
      ['Create Open Graph images', 'design'],
      ['Wire up the contact form to the CRM', 'backend'],
      ['Accessibility pass on templates', 'frontend'],
      ['Footer links broken on mobile Safari', 'bug'],
      ['Set up preview deployments', 'feature'],
      ['Document the component library', 'docs'],
      ['Customer logos section', 'design'],
      ['Load-test the new search endpoint', 'backend'],
    ],
  },
  {
    name: 'Tidepool app 2.0',
    key: 'APP',
    color: 'blue',
    description:
      'Client: Tidepool Field Services (fictional). Offline mode, a new onboarding flow and push notifications for their field app.',
    tasks: [
      ['Offline queue for form submissions', 'feature'],
      ['Push notification permission prompt', 'frontend'],
      ['Crash when rotating on the camera screen', 'bug'],
      ['Design the new onboarding flow', 'design'],
      ['Sync conflict resolution strategy', 'research'],
      ['Background refresh API', 'backend'],
      ['Dark mode color audit', 'design'],
      ['Biometric sign-in', 'feature'],
      ['Reduce cold-start time below 2s', 'frontend'],
      ['Release notes for 2.0', 'docs'],
      ['Login loop after token expiry', 'bug'],
      ['Beta tester feedback survey', 'research'],
      ['Paginate the activity endpoint', 'backend'],
      ['App store screenshots', 'design'],
      ['Haptics on key actions', 'frontend'],
      ['Rate-limit password reset emails', 'backend'],
    ],
  },
  {
    name: 'Keel onboarding kit',
    key: 'ONB',
    color: 'teal',
    description:
      "Internal: the studio's reusable onboarding kit: checklist, sample data and better emails.",
    tasks: [
      ['Interview five recently onboarded customers', 'research'],
      ['Onboarding checklist component', 'frontend'],
      ['Seed new workspaces with sample data', 'backend'],
      ['Welcome email sequence', 'docs'],
      ['Empty-state illustrations', 'design'],
      ['Track activation events', 'backend'],
      ['Invite teammates step', 'feature'],
      ['Checklist progress resets on reload', 'bug'],
      ['Help center articles for setup', 'docs'],
      ['In-app product tour', 'feature'],
      ['Activation dashboard for the success team', 'frontend'],
      ['Import contacts from CSV', 'feature'],
      ['Timezone picker defaults wrong', 'bug'],
      ['Benchmark against two competitors', 'research'],
    ],
  },
  {
    name: 'Lumen Q4 launch',
    key: 'MKT',
    color: 'amber',
    description:
      'Client: Lumen Coffee Co. (fictional). Announce their fall release: launch page, webinar, partner emails and press kit.',
    tasks: [
      ['Launch page wireframes', 'design'],
      ['Webinar run-of-show', 'docs'],
      ['Partner email announcement', 'docs'],
      ['Press kit with screenshots', 'design'],
      ['UTM tracking plan', 'research'],
      ['Launch video storyboard', 'design'],
      ['Social posts calendar', 'docs'],
      ['Landing page A/B test setup', 'frontend'],
      ['Waitlist export to email tool', 'backend'],
      ['Broken link in launch email draft', 'bug'],
      ['Customer quote approvals', 'research'],
      ['Pricing page update for new tier', 'feature'],
      ['Launch day status page', 'feature'],
      ['Sales enablement one-pager', 'docs'],
    ],
  },
];

/** Generated titles for an imported backlog (massive): verb + object, never a real product. */
const BACKLOG_VERBS = [
  'Review',
  'Refine',
  'Fix',
  'Document',
  'Prototype',
  'Test',
  'Polish',
  'Measure',
  'Plan',
  'Ship',
] as const;
const BACKLOG_OBJECTS = [
  'search filters',
  'empty states',
  'settings page',
  'export flow',
  'billing emails',
  'sign-in screen',
  'dashboard cards',
  'notification copy',
  'image uploads',
  'table sorting',
  'mobile header',
  'onboarding step',
  'error messages',
  'audit log',
  'invite flow',
  'pricing table',
] as const;
const BACKLOG_LABELS: readonly TaskLabel[] = [
  'feature',
  'bug',
  'design',
  'frontend',
  'backend',
  'docs',
];

const EXTRA_LABELS: readonly TaskLabel[] = ['frontend', 'backend', 'design', 'research', 'blocked'];

const COMMENTS = [
  'I can pick this up after the standup.',
  'Pushed a first pass — feedback welcome.',
  'Blocked on the API contract, pinging Lena.',
  'Looks good to me. Moving to review.',
  'Can we split this into two smaller tasks?',
  'Added screenshots to the description.',
  'This is trickier than expected; needs another day.',
  'Paired on this with Sam, almost there.',
  'Reminder: the client demo is on Thursday.',
  'Tested on iOS and Android — all green.',
  'Left a few notes in the doc, mostly wording.',
  'Do we still need this for the launch?',
] as const;

const ACTIVITY_MULTIPLIER = {
  none: 0,
  low: 0.5,
  normal: 1,
  intense: 1.6,
  dormant: 0.4,
  reactivated: 1,
} as const;

function options(ctx: GenerateContext): TaskGeneratorOptions {
  const raw = (ctx.scenario.generators.tasks ?? {}) as Partial<TaskGeneratorOptions>;
  return {
    projects: Math.max(0, Math.min(PROJECTS.length, raw.projects ?? ctx.scale(3))),
    tasksPerProject: raw.tasksPerProject ?? [8, 12],
    overdueShare: Math.max(0, Math.min(1, raw.overdueShare ?? 0.15)),
    ...(raw.focusAssignee ? { focusAssignee: raw.focusAssignee } : {}),
    ...(raw.synthetic ? { synthetic: raw.synthetic } : {}),
  };
}

function identities(ctx: GenerateContext) {
  const { scenario, time } = ctx;
  const orgAge = scenario.organization.ageDays;
  const orgCreated = time.daysAgo(orgAge);
  const organization: Organization = {
    id: scenario.organization.id,
    name: scenario.organization.name ?? 'Keel Studio',
    type: 'company',
    plan: scenario.organization.subscription === 'free' ? 'free' : 'pro',
    billingStatus: scenario.organization.subscription === 'expired' ? 'expired' : 'active',
    createdAt: time.iso(orgCreated),
    size: scenario.organization.size,
    featureFlags: { ...scenario.organization.featureFlags },
  };
  // Library faces (`av-NNN`) from their own fork: no other seeded value shifts.
  const faces = createAvatarPool(ctx.rng.fork('project-management:avatars:people'));
  const personas: Persona[] = [];
  const memberships: Membership[] = [];
  const size = Math.max(1, scenario.organization.size);
  CAST.forEach((member, index) => {
    const isActor = member.id === scenario.actor.id;
    if (index >= size && !isActor) return;
    const joinedDaysAgo = isActor
      ? Math.min(scenario.actor.joinedDaysAgo, orgAge)
      : Math.max(0, orgAge - member.after);
    const joinedAt = time.iso(time.daysAgo(joinedDaysAgo));
    const role = isActor ? scenario.actor.role : member.role;
    personas.push({
      id: member.id,
      name: member.name,
      avatar: faces.next(),
      email: `${member.name.split(' ')[0]?.toLowerCase()}@example.com`,
      avatarColor: member.color,
      title: member.title,
      locale: 'en-US',
      timezone: 'UTC',
      joinedAt,
      onboardingComplete: isActor ? scenario.actor.onboardingComplete : true,
      preferences: {},
      summary: `${member.title} · ${role}, joined ${joinedDaysAgo === 0 ? 'today' : `${joinedDaysAgo} days ago`}`,
    });
    memberships.push({
      id: `member_${member.id}`,
      personaId: member.id,
      organizationId: organization.id,
      role,
      joinedAt,
      capabilities: [],
    });
  });
  return { organization, personas, memberships, orgCreated };
}

export function generateTaskWorld(ctx: GenerateContext): WorldSeed {
  const { rng, ids, time } = ctx;
  const { organization, personas, memberships, orgCreated } = identities(ctx);
  const now = time.now;
  const opts = options(ctx);
  const rate = ACTIVITY_MULTIPLIER[ctx.scenario.activity.level];
  const iso = (d: Date) => time.iso(d);
  const day = (d: Date) => iso(d).slice(0, 10);
  /** Random instant in [from, now], never before the organization existed. */
  const after = (from: Date) => {
    const lo = Math.max(from.getTime(), orgCreated.getTime());
    const hi = now.getTime();
    return new Date(hi <= lo ? hi : lo + rng.next() * (hi - lo));
  };

  // People who work on tasks (viewers never own, report or comment).
  const workers = memberships.filter((m) => m.role !== 'viewer').map((m) => m.personaId);
  const managers = memberships
    .filter((m) => m.role === 'owner' || m.role === 'admin')
    .map((m) => m.personaId);
  const assigneeWeights = workers.map((id) => [id, id === opts.focusAssignee ? 3 : 1] as const);
  const joined = new Map(personas.map((p) => [p.id, new Date(p.joinedAt)]));

  const projects: Project[] = [];
  const sprints: Sprint[] = [];
  const tasks: Task[] = [];
  const comments: Comment[] = [];
  const activity: Activity[] = [];
  const dependencies: Dependency[] = [];
  const log = (row: Omit<Activity, 'id'>) => activity.push({ id: ids.next('activity'), ...row });

  for (const blueprint of PROJECTS.slice(0, workers.length > 0 ? opts.projects : 0)) {
    const ownerId = rng.pick(managers.length > 0 ? managers : workers);
    // Projects start in the first days of the workspace (never before their owner joined).
    const ownerJoined = joined.get(ownerId)?.getTime() ?? orgCreated.getTime();
    const created = new Date(
      Math.min(
        now.getTime(),
        Math.max(ownerJoined, orgCreated.getTime() + rng.int(0, 2) * MS_PER_DAY)
      )
    );
    const project: Project = {
      id: ids.next('project'),
      name: blueprint.name,
      key: blueprint.key,
      description: blueprint.description,
      color: blueprint.color,
      ownerId,
      createdAt: iso(created),
      updatedAt: iso(created),
    };
    projects.push(project);

    const sprint = {
      id: ids.next('sprint'),
      projectId: project.id,
      name: 'Sprint 12 · Ship the core',
      startDate: day(time.daysAgo(7)),
      endDate: day(time.daysFromNow(7)),
      goal: 'Finish the highest priority work and leave the release ready for review.',
    } satisfies Sprint;
    sprints.push(sprint);
    const scheduled = schedule({
      ctx,
      resources: [project.id],
      window: { daysBefore: 14, daysAfter: 28 },
      occupancy: 0.8,
      slotMinutes: 240,
      durations: [2, 4, 6],
    }).filter((slot) => slot.recurring === null);
    const overdueSlots = scheduled.filter((slot) => slot.status === 'past');
    const upcomingSlots = scheduled.filter((slot) => slot.status === 'upcoming');

    const [min, max] = opts.tasksPerProject;
    const history = opts.synthetic?.historyPerProject ?? Number.POSITIVE_INFINITY;
    const count = opts.synthetic
      ? rng.int(min, max)
      : Math.min(blueprint.tasks.length, rng.int(min, max));
    const handWritten = rng.sample(blueprint.tasks, Math.min(count, blueprint.tasks.length));
    const titles: (readonly [string, TaskLabel])[] = [...handWritten];
    for (let n = titles.length; n < count; n++) {
      titles.push([
        `${rng.pick(BACKLOG_VERBS)} ${rng.pick(BACKLOG_OBJECTS)} (#${n + 1})`,
        rng.pick(BACKLOG_LABELS),
      ]);
    }
    const projectTasks: Task[] = [];
    titles.forEach(([title, label], index) => {
      const withHistory = index < history;
      const reporterId = rng.pick(rng.chance(0.4) && managers.length > 0 ? managers : workers);
      const floor = Math.max(created.getTime(), joined.get(reporterId)?.getTime() ?? 0);
      const createdAt = after(new Date(floor));
      const ageDays = (now.getTime() - createdAt.getTime()) / MS_PER_DAY;
      const rolled: TaskStatus =
        ageDays > 6 && rng.chance(Math.min(0.55, ageDays / 40))
          ? 'done'
          : rng.weighted<TaskStatus>([
              ['todo', 4],
              ['in-progress', 3],
              ['review', 2],
            ]);
      // Every board starts with work waiting in "To do", whatever the dice say.
      const status: TaskStatus = index < 2 ? 'todo' : rolled;
      const priority = rng.weighted<TaskPriority>([
        ['low', 2],
        ['medium', 5],
        ['high', 3],
        ['urgent', 1],
      ]);
      const completedAt = status === 'done' ? after(createdAt) : null;
      const planned = scheduled[index % Math.max(1, scheduled.length)];
      const startDate = planned?.start.slice(0, 10) ?? day(time.daysAgo(1));
      const endDate = planned?.end.slice(0, 10) ?? day(time.daysFromNow(3));
      let dueDate: string | null = null;
      if (status === 'done') {
        dueDate = rng.chance(0.6) ? day(completedAt ?? now) : null;
      } else if (rng.chance(opts.overdueShare)) {
        const dueSlot = rng.pick(overdueSlots.length > 0 ? overdueSlots : scheduled);
        dueDate = day(new Date(dueSlot.end));
      } else if (rng.chance(0.8)) {
        const dueSlot = rng.pick(upcomingSlots.length > 0 ? upcomingSlots : scheduled);
        dueDate = day(new Date(dueSlot.end));
      }
      const taskStartDate = dueDate && dueDate < startDate ? dueDate : startDate;
      const taskEndDate = dueDate ?? endDate;
      const extra = rng.chance(0.35) ? [rng.pick(EXTRA_LABELS)] : [];
      const labels = [...new Set<TaskLabel>([label, ...extra])];
      const task: Task = {
        id: ids.next('task'),
        projectId: project.id,
        number: index + 1,
        title,
        description: `${title}. ${rng.pick([
          'Acceptance criteria are in the spec; ping the reporter with questions.',
          'Keep the scope small — we can iterate after launch.',
          'Coordinate with design before starting implementation.',
          'Link the pull request here when it is ready for review.',
        ])}`,
        status,
        priority,
        assigneeId: rng.chance(0.12) ? null : rng.weighted(assigneeWeights),
        reporterId,
        dueDate,
        startDate: taskStartDate,
        endDate: taskEndDate < taskStartDate ? taskStartDate : taskEndDate,
        estimateHours: rng.pick([2, 4, 6, 8, 12]),
        sprintId: sprint.id,
        milestone: false,
        labels,
        order: 0,
        completedAt: completedAt ? iso(completedAt) : null,
        createdAt: iso(createdAt),
        updatedAt: iso(completedAt ?? createdAt),
      };
      if (!withHistory) {
        projectTasks.push(task);
        return;
      }
      log({
        taskId: task.id,
        projectId: project.id,
        actorId: reporterId,
        type: 'created',
        body: 'Created in To do',
        at: task.createdAt,
      });
      if (status !== 'todo') {
        const movedAt = completedAt ?? after(createdAt);
        log({
          taskId: task.id,
          projectId: project.id,
          actorId: task.assigneeId ?? reporterId,
          type: 'moved',
          body: `Moved from To do to ${STATUS_LABELS[status]}`,
          at: iso(movedAt),
        });
        if (iso(movedAt) > task.updatedAt) task.updatedAt = iso(movedAt);
      }
      const commentCount = Math.round(rng.int(0, 3) * rate);
      for (let c = 0; c < commentCount; c++) {
        const authorId = rng.pick(workers);
        const at = iso(
          after(new Date(Math.max(createdAt.getTime(), joined.get(authorId)?.getTime() ?? 0)))
        );
        comments.push({
          id: ids.next('comment'),
          taskId: task.id,
          authorId,
          body: rng.pick(COMMENTS),
          createdAt: at,
        });
        log({
          taskId: task.id,
          projectId: project.id,
          actorId: authorId,
          type: 'commented',
          body: 'Left a comment',
          at,
        });
        if (at > task.updatedAt) task.updatedAt = at;
      }
      projectTasks.push(task);
    });
    if (projectTasks.length >= 5) {
      const chain = planMilestone({
        ctx,
        project,
        sprint,
        tasks: projectTasks,
        reporterId: ownerId,
      });
      projectTasks.push(chain.milestone);
      dependencies.push(...chain.dependencies);
    }
    // Column order: most important first, like a groomed board.
    for (const status of TASK_STATUSES) {
      const rank = { urgent: 0, high: 1, medium: 2, low: 3 } as const;
      projectTasks
        .filter((t) => t.status === status)
        .sort((a, b) => rank[a.priority] - rank[b.priority] || a.number - b.number)
        .forEach((t, order) => {
          t.order = order;
        });
    }
    tasks.push(...projectTasks);
  }

  return {
    organizations: [organization],
    personas,
    memberships,
    tables: {
      projects: projects as unknown as Row[],
      sprints: sprints as unknown as Row[],
      tasks: tasks as unknown as Row[],
      comments: comments as unknown as Row[],
      activity: activity as unknown as Row[],
      dependencies: dependencies as unknown as Row[],
      rituals: (projects.length > 0 ? rituals(ctx) : []) as unknown as Row[],
      savedViews: (projects.length > 0 ? savedViews(ctx, personas) : []) as unknown as Row[],
    },
  };
}

const MILESTONE_NAMES = [
  'Client review',
  'Design sign-off',
  'Beta gate',
  'Launch readiness',
] as const;

/** Monday 00:00 UTC on or before `date`. */
function mondayOnOrBefore(date: Date): Date {
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return monday;
}

/**
 * The studio's recurring rituals, anchored to the Monday of Sprint 12's
 * first week (UTC): a weekday standup (one cancelled for the offsite),
 * planning every other Monday, review and retro every other Friday (the
 * first one is today in the default scenario) and a weekly design critique.
 */
function rituals(ctx: GenerateContext): Ritual[] {
  const { ids, time } = ctx;
  const monday = mondayOnOrBefore(time.daysAgo(7));
  const at = (dayOffset: number, hours: number, minutes = 0) =>
    new Date(
      monday.getTime() + dayOffset * MS_PER_DAY + (hours * 60 + minutes) * 60_000
    ).toISOString();
  const createdAt = time.iso(time.daysAgo(Math.min(30, ctx.scenario.organization.ageDays)));
  const ritual = (
    row: Omit<Ritual, 'id' | 'projectId' | 'allDay' | 'timeZone' | 'createdAt'>
  ): Ritual => ({
    id: ids.next('ritual'),
    projectId: null,
    allDay: false,
    timeZone: 'UTC',
    createdAt,
    ...row,
  });
  return [
    ritual({
      kind: 'standup',
      title: 'Daily standup',
      start: at(0, 9, 30),
      end: at(0, 9, 45),
      rule: { freq: 'weekly', byDay: ['MO', 'TU', 'WE', 'TH', 'FR'] },
      // Cancelled for the studio offsite on the second Wednesday.
      exdates: [at(9, 9, 30)],
    }),
    ritual({
      kind: 'planning',
      title: 'Sprint planning',
      start: at(0, 10),
      end: at(0, 11),
      rule: { freq: 'weekly', interval: 2, byDay: ['MO'] },
    }),
    ritual({
      kind: 'review',
      title: 'Sprint review with clients',
      start: at(11, 15),
      end: at(11, 16),
      rule: { freq: 'weekly', interval: 2, byDay: ['FR'] },
    }),
    ritual({
      kind: 'retro',
      title: 'Sprint retro',
      start: at(11, 16, 15),
      end: at(11, 17),
      rule: { freq: 'weekly', interval: 2, byDay: ['FR'] },
    }),
    ritual({
      kind: 'critique',
      title: 'Design critique',
      start: at(2, 14),
      end: at(2, 15),
      rule: { freq: 'weekly', byDay: ['WE'] },
    }),
  ];
}

/**
 * Two ready-made task grid views for Maya, Jordan and Priya (a fixed set, so
 * the world is the same whichever persona a scenario acts as).
 */
function savedViews(ctx: GenerateContext, personas: readonly Persona[]): SavedView[] {
  const { ids, time } = ctx;
  const today = time.iso(time.now).slice(0, 10);
  const createdAt = time.iso(time.daysAgo(Math.min(10, ctx.scenario.organization.ageDays)));
  const views: SavedView[] = [];
  const owners = new Set(['user_0001', 'user_0002', 'user_0003']);
  for (const persona of personas.filter((p) => owners.has(p.id))) {
    views.push(
      {
        id: ids.next('view'),
        personaId: persona.id,
        name: 'Urgent and high',
        state: JSON.stringify({
          columns: [],
          sort: [{ key: 'due', direction: 'asc' }],
          groupBy: null,
          filter: {
            type: 'condition',
            field: 'priority',
            operator: 'in',
            value: ['urgent', 'high'],
          },
          density: 'comfortable',
        }),
        createdAt,
      },
      {
        id: ids.next('view'),
        personaId: persona.id,
        name: 'Overdue',
        state: JSON.stringify({
          columns: [],
          sort: [{ key: 'due', direction: 'asc' }],
          groupBy: null,
          filter: {
            type: 'group',
            op: 'and',
            children: [
              { type: 'condition', field: 'due', operator: 'before', value: today },
              { type: 'condition', field: 'status', operator: 'neq', value: 'done' },
            ],
          },
          density: 'compact',
        }),
        createdAt,
      }
    );
  }
  return views;
}

/**
 * A linked plan per project: two open tasks finish before a milestone, and
 * two follow-ups start after it (finish-to-start). Dates are set so every
 * link holds; moving the milestone later shifts its successors, the case the
 * timeline's cascade and critical path show.
 */
function planMilestone(input: {
  ctx: GenerateContext;
  project: Project;
  sprint: Sprint;
  tasks: Task[];
  reporterId: string;
}): { milestone: Task; dependencies: Dependency[] } {
  const { ctx, project, sprint, tasks, reporterId } = input;
  const { ids, time } = ctx;
  const day = (offset: number) => time.iso(time.daysFromNow(offset)).slice(0, 10);
  const today = day(0);
  // Prefer open work that is not already overdue, so a crunch keeps its overdue share.
  const open = tasks
    .filter((task) => task.status !== 'done')
    .sort(
      (x, y) =>
        Number(x.dueDate !== null && x.dueDate < today) -
        Number(y.dueDate !== null && y.dueDate < today)
    )
    .slice(0, 4);
  const pick = open.length >= 4 ? open : tasks.slice(0, 4);
  const [a, b, c, d] = pick as [Task, Task, Task, Task];
  // a → b → milestone → c, d
  a.startDate = day(-3);
  a.endDate = day(-1);
  b.startDate = day(0);
  b.endDate = day(2);
  c.startDate = day(4);
  c.endDate = day(6);
  d.startDate = day(4);
  d.endDate = day(8);
  for (const task of [a, b, c, d]) {
    if (task.status !== 'done') task.dueDate = task.endDate;
  }
  const at =
    sprint.startDate < project.createdAt.slice(0, 10)
      ? project.createdAt
      : `${sprint.startDate}T09:00:00.000Z`;
  const name =
    MILESTONE_NAMES[(project.key.charCodeAt(0) + project.key.length) % MILESTONE_NAMES.length];
  const milestone: Task = {
    id: ids.next('task'),
    projectId: project.id,
    number: tasks.reduce((max, task) => Math.max(max, task.number), 0) + 1,
    title: `${name}: ${project.name}`,
    description: 'Milestone. Its predecessors must finish first; follow-up work starts after it.',
    status: 'todo',
    priority: 'high',
    assigneeId: reporterId,
    reporterId,
    dueDate: day(3),
    startDate: day(3),
    endDate: day(3),
    estimateHours: 0,
    sprintId: sprint.id,
    milestone: true,
    labels: ['feature'],
    order: 0,
    completedAt: null,
    createdAt: at,
    updatedAt: at,
  };
  const link = (from: Task, to: Task): Dependency => ({
    id: ids.next('dependency'),
    projectId: project.id,
    fromId: from.id,
    toId: to.id,
    type: 'FS',
  });
  return {
    milestone,
    dependencies: [link(a, b), link(b, milestone), link(milestone, c), link(milestone, d)],
  };
}

// ── Time advance ─────────────────────────────────────────────────────────

interface ProgressPayload {
  taskId: string;
  note: string;
}

const PROGRESS_NOTES = [
  'Picked this up',
  'Made progress during the afternoon',
  'Ready for another look',
  'Wrapped this up',
] as const;

/**
 * One to three "task progress" events per simulated day. Each day's events
 * are derived from scenario seed + day (`dailyEvents`) and the stable, sorted
 * ids of SEEDED tasks — never from current statuses — so advancing 7×1 day
 * or 1×7 days yields the same events with the same ids, and replaying a
 * window is a no-op (applied ids live in `py_events`). The status change is
 * resolved when the event is applied.
 */
export async function taskTimeline(ctx: TimelineContext): Promise<DomainEvent[]> {
  const seeded = ((await ctx.read('tasks')) as unknown as Task[])
    .map((t) => t.id)
    .filter((id) => !id.includes('_u'))
    .sort();
  if (seeded.length === 0) return [];
  return dailyEvents<ProgressPayload>(ctx, {
    perDay: ({ rng }) => rng.int(1, 3),
    hours: [9, 18],
    make: ({ rng }) => ({
      type: 'task.progress',
      payload: { taskId: rng.pick(seeded), note: rng.pick(PROGRESS_NOTES) },
    }),
  });
}

export async function applyTaskEvent(event: DomainEvent, ctx: EventApplyContext): Promise<void> {
  if (event.type !== 'task.progress') return;
  const payload = event.payload as ProgressPayload;
  const task = (await ctx.get('tasks', payload.taskId)) as unknown as Task | undefined;
  // Deleted or finished tasks get no progress — never resurrect data.
  if (!task || task.status === 'done') return;
  const next = TASK_STATUSES[TASK_STATUSES.indexOf(task.status) + 1] ?? 'done';
  const actorId = task.assigneeId ?? task.reporterId;
  await ctx.put('tasks', {
    ...(task as unknown as Row),
    status: next,
    order: 999 + task.number,
    completedAt: next === 'done' ? event.at : null,
    updatedAt: event.at,
  });
  await ctx.put('activity', {
    id: `activity_${event.id}`,
    taskId: task.id,
    projectId: task.projectId,
    actorId,
    type: 'moved',
    body: `${payload.note} — moved from ${STATUS_LABELS[task.status]} to ${STATUS_LABELS[next]}`,
    at: event.at,
  });
}
