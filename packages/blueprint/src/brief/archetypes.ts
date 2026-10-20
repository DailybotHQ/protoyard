import type { BlueprintArchetypeInput } from '../archetypes/schema.ts';
import type { BlueprintInput } from '../schema.ts';

/**
 * Product archetypes the brief synthesizer starts from. Each one carries the
 * keywords that select it and a small entity graph whose fields drive the
 * screens (enums → boards, dates → calendars and timelines, geo → maps,
 * money → dashboards and analytics). The first entity is the focus: brief-wide
 * cues (a location, a price, a deadline) land on it. All names are fictional.
 */

export type EntityInput = BlueprintInput['entities'][number];
export type FieldInput = EntityInput['fields'][number];

export interface Archetype {
  id: string;
  /** Product noun used in generated names ("Help Desk"). */
  label: string;
  /** Single words or phrases, matched as whole words in the brief. */
  keywords: readonly string[];
  /** High-signal cues can select a kit archetype with one unambiguous phrase. */
  strongCues?: readonly string[];
  /** Portable runtime binding emitted when this brief seed is selected. */
  kitArchetype?: BlueprintArchetypeInput;
  entities: readonly EntityInput[];
}

const text = (name: string, extra: Partial<FieldInput> = {}): FieldInput =>
  ({ name, kind: 'text', ...extra }) as FieldInput;
const enumOf = (name: string, values: string[], extra: Partial<FieldInput> = {}): FieldInput =>
  ({ name, kind: 'enum', values, default: values[0], required: true, ...extra }) as FieldInput;
const of = (name: string, kind: string, extra: Record<string, unknown> = {}): FieldInput =>
  ({ name, kind, ...extra }) as FieldInput;

/** Ordered: on equal keyword scores the earlier archetype wins. */
export const ARCHETYPES: readonly Archetype[] = [
  {
    id: 'helpdesk',
    label: 'Help Desk',
    keywords: [
      'help desk',
      'helpdesk',
      'support',
      'ticket',
      'tickets',
      'sla',
      'issue',
      'issues',
      'inbox',
      'complaint',
      'complaints',
    ],
    entities: [
      {
        name: 'ticket',
        plural: 'tickets',
        fields: [
          text('subject', { required: true, fake: 'lorem.sentence', maxLength: 120 }),
          enumOf('status', ['open', 'pending', 'solved'], { weights: [5, 3, 4] }),
          enumOf('priority', ['low', 'normal', 'high', 'urgent'], { weights: [2, 5, 2, 1] }),
          of('dueAt', 'datetime', { window: 'around' }),
          of('customer', 'relation', { to: 'customer' }),
          of('assignee', 'persona'),
        ],
        titleField: 'subject',
        ownerField: 'assignee',
      },
      {
        name: 'customer',
        plural: 'customers',
        fields: [text('name', { required: true, fake: 'company.name' }), of('email', 'email')],
        titleField: 'name',
      },
    ],
  },
  {
    id: 'crm',
    label: 'CRM',
    keywords: [
      'crm',
      'sales',
      'deal',
      'deals',
      'lead',
      'leads',
      'pipeline',
      'prospect',
      'prospects',
      'contact',
      'contacts',
      'account',
      'accounts',
    ],
    entities: [
      {
        name: 'deal',
        plural: 'deals',
        fields: [
          text('title', { required: true, fake: 'commerce.productName' }),
          enumOf('stage', ['lead', 'qualified', 'proposal', 'won', 'lost'], {
            weights: [4, 3, 2, 2, 1],
          }),
          of('amount', 'money', { min: 50_000, max: 5_000_000, trend: 'growth' }),
          of('closeOn', 'date', { window: 'around' }),
          of('company', 'relation', { to: 'company' }),
          of('owner', 'persona'),
        ],
        titleField: 'title',
        ownerField: 'owner',
      },
      {
        name: 'company',
        plural: 'companies',
        fields: [
          text('name', { required: true, fake: 'company.name' }),
          of('website', 'url'),
          enumOf('segment', ['smb', 'mid-market', 'enterprise']),
        ],
        titleField: 'name',
      },
      {
        name: 'contact',
        plural: 'contacts',
        fields: [
          text('fullName', { required: true, fake: 'person.fullName' }),
          of('email', 'email'),
          of('company', 'relation', { to: 'company' }),
        ],
        titleField: 'fullName',
      },
    ],
  },
  {
    id: 'booking',
    label: 'Bookings',
    keywords: [
      'booking',
      'bookings',
      'appointment',
      'appointments',
      'reservation',
      'reservations',
      'salon',
      'studio',
      'slot',
      'slots',
      'book',
      'schedule',
    ],
    entities: [
      {
        name: 'appointment',
        plural: 'appointments',
        fields: [
          text('title', { required: true, fake: 'commerce.productName' }),
          enumOf('status', ['requested', 'confirmed', 'done', 'cancelled'], {
            weights: [2, 5, 4, 1],
          }),
          of('startsAt', 'datetime', { window: 'around' }),
          of('endsAt', 'datetime', { window: 'around' }),
          of('price', 'money', { min: 1_000, max: 30_000 }),
          of('client', 'relation', { to: 'client' }),
          of('staff', 'persona'),
        ],
        titleField: 'title',
        ownerField: 'staff',
      },
      {
        name: 'client',
        plural: 'clients',
        fields: [
          text('name', { required: true, fake: 'person.fullName' }),
          of('email', 'email'),
          of('phone', 'phone'),
        ],
        titleField: 'name',
      },
    ],
  },
  {
    id: 'logistics',
    label: 'Dispatch',
    keywords: [
      'logistics',
      'shipment',
      'shipments',
      'delivery',
      'deliveries',
      'dispatch',
      'freight',
      'courier',
      'route',
      'routes',
      'warehouse',
      'truck',
      'trucks',
      'parcel',
      'parcels',
    ],
    entities: [
      {
        name: 'shipment',
        plural: 'shipments',
        fields: [
          text('reference', { required: true, fake: 'word.words', maxLength: 40 }),
          enumOf('status', ['planned', 'in-transit', 'delivered', 'delayed'], {
            weights: [2, 4, 5, 1],
          }),
          of('departsOn', 'date', { window: 'around' }),
          of('arrivesOn', 'date', { window: 'around' }),
          of('destination', 'geo', { region: 'harbor-bay' }),
          of('cost', 'money', { min: 2_000, max: 400_000 }),
          of('driver', 'relation', { to: 'driver' }),
        ],
        titleField: 'reference',
      },
      {
        name: 'driver',
        plural: 'drivers',
        fields: [text('name', { required: true, fake: 'person.fullName' }), of('phone', 'phone')],
        titleField: 'name',
      },
    ],
  },
  {
    id: 'analytics',
    label: 'Analytics',
    strongCues: ['analytics', 'product analytics', 'event analytics'],
    kitArchetype: {
      id: 'analytics',
      kits: [
        '@protoyard/analytics',
        '@protoyard/analytics-ui/grid',
        '@protoyard/analytics-ui/date-range',
      ],
      entities: { events: 'event', metrics: 'metric' },
      screens: [{ kind: 'analytics-dashboard', path: '/analytics-dashboard' }],
      scenarioDefaults: { density: 'dense', activity: 'normal' },
    },
    keywords: [
      'analytics',
      'product analytics',
      'event analytics',
      'event tracking',
      'metric',
      'metrics',
      'kpi',
      'kpis',
      'dashboard',
      'dashboards',
      'report',
      'reports',
      'insight',
      'insights',
      'funnel',
    ],
    entities: [
      {
        name: 'metric',
        plural: 'metrics',
        fields: [
          text('name', { required: true, fake: 'company.buzzPhrase', maxLength: 80 }),
          enumOf('category', ['acquisition', 'activation', 'retention', 'revenue']),
          of('value', 'number', { min: 0, max: 1_000, trend: 'growth' }),
          of('recordedOn', 'date', { window: 'past' }),
        ],
        titleField: 'name',
      },
      {
        name: 'event',
        plural: 'events',
        fields: [
          text('name', { required: true, fake: 'company.buzzPhrase', maxLength: 80 }),
          enumOf('category', ['acquisition', 'activation', 'retention', 'revenue']),
          of('value', 'number', { min: 0, max: 1_000, trend: 'growth' }),
          of('occurredAt', 'datetime', { window: 'past' }),
        ],
        titleField: 'name',
      },
      {
        name: 'report',
        plural: 'reports',
        fields: [
          text('title', { required: true, fake: 'lorem.sentence', maxLength: 120 }),
          enumOf('status', ['draft', 'review', 'published']),
          of('owner', 'persona'),
        ],
        titleField: 'title',
        ownerField: 'owner',
      },
    ],
  },
  {
    id: 'assistant',
    label: 'AI Assistant',
    strongCues: ['ai assistant', 'assistant', 'copilot', 'chatbot'],
    kitArchetype: {
      id: 'assistant',
      kits: ['@protoyard/ai', '@protoyard/ai-ui'],
      entities: { conversations: 'conversation', messages: 'message' },
      screens: [{ kind: 'assistant-workspace', path: '/assistant' }],
      scenarioDefaults: { density: 'normal', activity: 'normal' },
    },
    keywords: [
      'ai assistant',
      'assistant',
      'copilot',
      'chatbot',
      'chat bot',
      'prompt',
      'prompts',
      'model response',
      'conversation',
      'conversations',
    ],
    entities: [
      {
        name: 'conversation',
        plural: 'conversations',
        fields: [
          text('title', { required: true, fake: 'lorem.sentence' }),
          enumOf('status', ['active', 'archived']),
          of('owner', 'persona'),
        ],
        titleField: 'title',
        ownerField: 'owner',
      },
      {
        name: 'message',
        plural: 'messages',
        fields: [
          text('content', { required: true, fake: 'lorem.sentence', maxLength: 200 }),
          enumOf('role', ['user', 'assistant', 'tool']),
          of('conversation', 'relation', { to: 'conversation', onDelete: 'cascade' }),
          of('sentAt', 'datetime', { window: 'around' }),
        ],
        titleField: 'content',
      },
    ],
  },
  {
    id: 'team-chat',
    label: 'Team Chat',
    strongCues: ['team chat', 'group chat', 'slack'],
    kitArchetype: {
      id: 'team-chat',
      kits: ['@protoyard/ai', '@protoyard/ai-ui'],
      entities: { rooms: 'room', messages: 'message', members: 'team-member' },
      screens: [{ kind: 'team-chat', path: '/team-chat' }],
      scenarioDefaults: { density: 'normal', activity: 'intense' },
    },
    keywords: [
      'team chat',
      'group chat',
      'chat',
      'slack',
      'channel',
      'channels',
      'messaging',
      'direct message',
      'direct messages',
      'room',
      'rooms',
    ],
    entities: [
      {
        name: 'room',
        plural: 'rooms',
        fields: [
          text('name', { required: true, fake: 'commerce.department' }),
          text('topic', { maxLength: 200 }),
          enumOf('visibility', ['public', 'private']),
        ],
        titleField: 'name',
      },
      {
        name: 'message',
        plural: 'messages',
        fields: [
          text('body', { required: true, fake: 'lorem.sentence', maxLength: 200 }),
          of('room', 'relation', { to: 'room', onDelete: 'cascade' }),
          of('author', 'relation', { to: 'team-member' }),
          of('sentAt', 'datetime', { window: 'around' }),
        ],
        titleField: 'body',
      },
      {
        name: 'team-member',
        plural: 'team-members',
        fields: [
          text('name', { required: true, fake: 'person.fullName' }),
          of('email', 'email'),
          enumOf('presence', ['online', 'away', 'offline']),
        ],
        titleField: 'name',
      },
    ],
  },
  {
    id: 'saas-onboarding',
    label: 'SaaS Onboarding',
    strongCues: ['saas onboarding', 'product onboarding'],
    kitArchetype: {
      id: 'saas-onboarding',
      kits: ['@protoyard/saas', '@protoyard/saas-ui'],
      entities: { workspaces: 'workspace', members: 'workspace-member' },
      screens: [{ kind: 'saas-onboarding', path: '/onboarding' }],
      scenarioDefaults: { density: 'normal', activity: 'normal' },
    },
    keywords: [
      'saas onboarding',
      'product onboarding',
      'onboarding',
      'workspace',
      'workspaces',
      'invite teammates',
      'invitations',
      'free trial',
      'trial',
      'subscription',
      'activation',
      'plan upgrade',
    ],
    entities: [
      {
        name: 'workspace',
        plural: 'workspaces',
        fields: [
          text('name', { required: true, fake: 'company.name' }),
          enumOf('plan', ['free', 'trial', 'pro']),
          enumOf('setupStatus', ['started', 'invited', 'complete']),
        ],
        titleField: 'name',
      },
      {
        name: 'workspace-member',
        plural: 'workspace-members',
        fields: [
          text('name', { required: true, fake: 'person.fullName' }),
          of('email', 'email'),
          enumOf('role', ['owner', 'admin', 'member']),
          of('workspace', 'relation', { to: 'workspace' }),
          enumOf('status', ['invited', 'active']),
        ],
        titleField: 'name',
      },
    ],
  },
  {
    id: 'pm',
    label: 'Projects',
    keywords: [
      'project',
      'projects',
      'task',
      'tasks',
      'sprint',
      'sprints',
      'kanban',
      'roadmap',
      'milestone',
      'milestones',
      'backlog',
      'todo',
    ],
    entities: [
      {
        name: 'task',
        plural: 'tasks',
        fields: [
          text('title', { required: true, fake: 'lorem.sentence', maxLength: 120 }),
          enumOf('status', ['todo', 'doing', 'review', 'done'], { weights: [4, 3, 1, 4] }),
          enumOf('priority', ['low', 'normal', 'high']),
          of('startOn', 'date', { window: 'around' }),
          of('dueOn', 'date', { window: 'around' }),
          of('estimate', 'integer', { min: 1, max: 13 }),
          of('project', 'relation', { to: 'project' }),
          of('assignee', 'persona'),
        ],
        titleField: 'title',
        ownerField: 'assignee',
      },
      {
        name: 'project',
        plural: 'projects',
        fields: [
          text('name', { required: true, fake: 'company.catchPhrase', maxLength: 80 }),
          enumOf('status', ['active', 'paused', 'done']),
          of('budget', 'money', { min: 100_000, max: 10_000_000 }),
        ],
        titleField: 'name',
      },
    ],
  },
  {
    id: 'lms',
    label: 'Academy',
    keywords: [
      'course',
      'courses',
      'lesson',
      'lessons',
      'student',
      'students',
      'learning',
      'lms',
      'class',
      'classes',
      'quiz',
      'quizzes',
      'training',
      'enrollment',
      'enrollments',
      'teacher',
      'teachers',
    ],
    entities: [
      {
        name: 'enrollment',
        plural: 'enrollments',
        fields: [
          text('student', { required: true, fake: 'person.fullName' }),
          enumOf('status', ['enrolled', 'active', 'completed', 'dropped'], {
            weights: [2, 5, 3, 1],
          }),
          of('progress', 'integer', { min: 0, max: 100, trend: 'growth' }),
          of('course', 'relation', { to: 'course' }),
        ],
        titleField: 'student',
      },
      {
        name: 'course',
        plural: 'courses',
        fields: [
          text('title', { required: true, fake: 'company.buzzPhrase', maxLength: 80 }),
          enumOf('level', ['beginner', 'intermediate', 'advanced']),
          of('startsOn', 'date', { window: 'future' }),
          of('price', 'money', { min: 0, max: 50_000 }),
          of('teacher', 'persona'),
        ],
        titleField: 'title',
        ownerField: 'teacher',
      },
    ],
  },
  {
    id: 'clinic',
    label: 'Clinic',
    keywords: [
      'clinic',
      'patient',
      'patients',
      'doctor',
      'doctors',
      'visit',
      'visits',
      'health',
      'medical',
      'veterinary',
      'vet',
      'nurse',
      'care',
    ],
    entities: [
      {
        name: 'visit',
        plural: 'visits',
        fields: [
          text('reason', { required: true, fake: 'lorem.sentence', maxLength: 120 }),
          enumOf('status', ['scheduled', 'checked-in', 'done', 'no-show'], {
            weights: [5, 1, 5, 1],
          }),
          of('startsAt', 'datetime', { window: 'around' }),
          of('endsAt', 'datetime', { window: 'around' }),
          of('patient', 'relation', { to: 'patient' }),
          of('provider', 'persona'),
        ],
        titleField: 'reason',
        ownerField: 'provider',
      },
      {
        name: 'patient',
        plural: 'patients',
        fields: [
          text('name', { required: true, fake: 'person.fullName' }),
          of('phone', 'phone'),
          of('email', 'email'),
        ],
        titleField: 'name',
      },
    ],
  },
  {
    id: 'fintech',
    label: 'Finance',
    keywords: [
      'finance',
      'budget',
      'budgets',
      'expense',
      'expenses',
      'payment',
      'payments',
      'transaction',
      'transactions',
      'bank',
      'wallet',
      'spending',
      'cash',
      'accounting',
    ],
    entities: [
      {
        name: 'transaction',
        plural: 'transactions',
        fields: [
          text('description', { required: true, fake: 'commerce.productName' }),
          enumOf('category', ['income', 'rent', 'payroll', 'software', 'travel', 'other']),
          of('amount', 'money', { min: 500, max: 2_000_000, trend: 'seasonal' }),
          of('bookedOn', 'date', { window: 'past' }),
          of('account', 'relation', { to: 'account' }),
        ],
        titleField: 'description',
      },
      {
        name: 'account',
        plural: 'accounts',
        fields: [
          text('name', { required: true, fake: 'company.name' }),
          enumOf('type', ['checking', 'savings', 'card']),
          of('balance', 'money', { min: 0, max: 50_000_000 }),
        ],
        titleField: 'name',
      },
    ],
  },
  {
    id: 'wiki',
    label: 'Docs',
    keywords: [
      'wiki',
      'docs',
      'documentation',
      'knowledge',
      'article',
      'articles',
      'page',
      'pages',
      'handbook',
      'notes',
      'guide',
      'guides',
    ],
    entities: [
      {
        name: 'page',
        plural: 'pages',
        fields: [
          text('title', { required: true, fake: 'lorem.sentence', maxLength: 120 }),
          enumOf('status', ['draft', 'review', 'published'], { weights: [2, 1, 5] }),
          of('body', 'longText', { fake: 'lorem.paragraph' }),
          of('space', 'relation', { to: 'space' }),
          of('author', 'persona'),
        ],
        titleField: 'title',
        ownerField: 'author',
      },
      {
        name: 'space',
        plural: 'spaces',
        fields: [text('name', { required: true, fake: 'commerce.department' })],
        titleField: 'name',
      },
    ],
  },
  {
    id: 'iot',
    label: 'Monitor',
    keywords: [
      'iot',
      'device',
      'devices',
      'sensor',
      'sensors',
      'telemetry',
      'monitoring',
      'alert',
      'alerts',
      'uptime',
      'firmware',
    ],
    entities: [
      {
        name: 'device',
        plural: 'devices',
        fields: [
          text('name', { required: true, fake: 'word.words', maxLength: 60 }),
          enumOf('status', ['online', 'degraded', 'offline'], { weights: [8, 2, 1] }),
          of('location', 'geo', { region: 'metro-grid' }),
          of('battery', 'integer', { min: 0, max: 100, trend: 'decline' }),
          of('lastSeenAt', 'datetime', { window: 'past' }),
        ],
        titleField: 'name',
      },
      {
        name: 'alert',
        plural: 'alerts',
        fields: [
          text('title', { required: true, fake: 'lorem.sentence', maxLength: 120 }),
          enumOf('severity', ['info', 'warning', 'critical'], { weights: [5, 3, 1] }),
          enumOf('status', ['open', 'acknowledged', 'resolved']),
          of('device', 'relation', { to: 'device' }),
        ],
        titleField: 'title',
      },
    ],
  },
  {
    id: 'social',
    label: 'Social',
    keywords: [
      'social',
      'feed',
      'post',
      'posts',
      'follower',
      'followers',
      'community',
      'comment',
      'comments',
      'like',
      'likes',
      'creator',
      'creators',
    ],
    entities: [
      {
        name: 'post',
        plural: 'posts',
        fields: [
          text('caption', { required: true, fake: 'lorem.sentence', maxLength: 140 }),
          enumOf('status', ['draft', 'published', 'flagged'], { weights: [1, 8, 1] }),
          of('likes', 'integer', { min: 0, max: 5_000, trend: 'growth' }),
          of('publishedAt', 'datetime', { window: 'past' }),
          of('author', 'persona'),
        ],
        titleField: 'caption',
        ownerField: 'author',
      },
      {
        name: 'comment',
        plural: 'comments',
        fields: [
          text('body', { required: true, fake: 'lorem.sentence', maxLength: 140 }),
          of('post', 'relation', { to: 'post', onDelete: 'cascade' }),
        ],
        titleField: 'body',
      },
    ],
  },
  {
    id: 'marketplace',
    label: 'Market',
    keywords: [
      'marketplace',
      'listing',
      'listings',
      'seller',
      'sellers',
      'buyer',
      'buyers',
      'order',
      'orders',
      'product',
      'products',
      'shop',
      'store',
      'ecommerce',
      'catalog',
    ],
    entities: [
      {
        name: 'order',
        plural: 'orders',
        fields: [
          text('reference', { required: true, fake: 'word.words', maxLength: 40 }),
          enumOf('status', ['placed', 'paid', 'shipped', 'delivered'], { weights: [2, 3, 3, 5] }),
          of('total', 'money', { min: 500, max: 500_000, trend: 'growth' }),
          of('placedOn', 'date', { window: 'past' }),
          of('listing', 'relation', { to: 'listing' }),
        ],
        titleField: 'reference',
      },
      {
        name: 'listing',
        plural: 'listings',
        fields: [
          text('title', { required: true, fake: 'commerce.productName' }),
          enumOf('category', ['home', 'outdoors', 'electronics', 'books']),
          of('price', 'money', { min: 500, max: 200_000 }),
          of('seller', 'persona'),
        ],
        titleField: 'title',
        ownerField: 'seller',
      },
    ],
  },
];

/** Used when no keyword matches: a plain tracker the extracted nouns extend. */
export const GENERIC_ARCHETYPE: Archetype = {
  id: 'tracker',
  label: 'Tracker',
  keywords: [],
  entities: [
    {
      name: 'item',
      plural: 'items',
      fields: [
        text('name', { required: true, fake: 'commerce.productName' }),
        enumOf('status', ['new', 'active', 'done']),
        of('dueOn', 'date', { window: 'around' }),
        of('owner', 'persona'),
      ],
      titleField: 'name',
      ownerField: 'owner',
    },
  ],
};

export const ARCHETYPE_IDS = [...ARCHETYPES.map((a) => a.id), GENERIC_ARCHETYPE.id] as const;
