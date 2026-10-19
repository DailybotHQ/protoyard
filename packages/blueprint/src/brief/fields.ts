import type { FieldInput } from './archetypes.ts';
import { camel } from './text.ts';

/**
 * Field kinds inferred from cue words in a brief ("with amount, due date and
 * status"). The first matching rule wins; anything else is text.
 */

interface Rule {
  cues: readonly string[];
  build: (name: string) => FieldInput;
}

const enumField = (name: string, values: string[]): FieldInput =>
  ({ name, kind: 'enum', values, default: values[0], required: true }) as FieldInput;

const ENUM_VALUES: Record<string, string[]> = {
  status: ['new', 'active', 'done'],
  state: ['new', 'active', 'done'],
  stage: ['lead', 'qualified', 'won', 'lost'],
  priority: ['low', 'normal', 'high', 'urgent'],
  severity: ['low', 'medium', 'high', 'critical'],
  level: ['beginner', 'intermediate', 'advanced'],
  type: ['standard', 'premium', 'other'],
  category: ['general', 'special', 'other'],
  kind: ['standard', 'premium', 'other'],
};

const RULES: readonly Rule[] = [
  {
    cues: ['location', 'address', 'place', 'coordinates', 'map', 'site', 'gps'],
    build: (name) => ({ name, kind: 'geo' }) as FieldInput,
  },
  {
    cues: [
      'owner',
      'assignee',
      'assigned',
      'manager',
      'responsible',
      'agent',
      'author',
      'reviewer',
    ],
    build: (name) => ({ name, kind: 'persona' }) as FieldInput,
  },
  {
    cues: ['time', 'at', 'hour', 'timestamp'],
    build: (name) => ({ name, kind: 'datetime', window: 'around' }) as FieldInput,
  },
  {
    cues: [
      'date',
      'day',
      'deadline',
      'due',
      'when',
      'start',
      'end',
      'birthday',
      'expiry',
      'expires',
    ],
    build: (name) => ({ name, kind: 'date', window: 'around' }) as FieldInput,
  },
  {
    cues: [
      'price',
      'amount',
      'cost',
      'total',
      'budget',
      'fee',
      'revenue',
      'salary',
      'payment',
      'balance',
      'value',
    ],
    build: (name) => ({ name, kind: 'money', min: 0, max: 1_000_000 }) as FieldInput,
  },
  {
    cues: ['rating', 'score', 'percent', 'percentage', 'weight', 'distance', 'temperature'],
    build: (name) => ({ name, kind: 'number', min: 0, max: 100 }) as FieldInput,
  },
  {
    cues: [
      'count',
      'quantity',
      'qty',
      'hours',
      'size',
      'capacity',
      'stock',
      'seats',
      'guests',
      'number',
    ],
    build: (name) => ({ name, kind: 'integer', min: 0, max: 500 }) as FieldInput,
  },
  {
    cues: Object.keys(ENUM_VALUES),
    build: (name) => {
      const cue = Object.keys(ENUM_VALUES).find((key) => name.toLowerCase().endsWith(key));
      return enumField(name, ENUM_VALUES[cue ?? 'status'] as string[]);
    },
  },
  { cues: ['email'], build: (name) => ({ name, kind: 'email' }) as FieldInput },
  { cues: ['phone', 'mobile'], build: (name) => ({ name, kind: 'phone' }) as FieldInput },
  { cues: ['website', 'url', 'link'], build: (name) => ({ name, kind: 'url' }) as FieldInput },
  { cues: ['tags', 'labels'], build: (name) => ({ name, kind: 'tags' }) as FieldInput },
  {
    cues: ['notes', 'description', 'body', 'details', 'summary', 'comments'],
    build: (name) => ({ name, kind: 'longText', fake: 'lorem.paragraph' }) as FieldInput,
  },
  {
    cues: ['paid', 'active', 'archived', 'approved', 'verified', 'flagged'],
    build: (name) => ({ name, kind: 'boolean' }) as FieldInput,
  },
];

/** Words dropped from field phrases ("the due date" → `dueDate`). */
const FILLER = new Set([
  'the',
  'a',
  'an',
  'their',
  'its',
  'his',
  'her',
  'our',
  'your',
  'each',
  'every',
  'some',
  'of',
  'any',
]);

/** Names the platform manages; a brief asking for one gets a suffixed name instead. */
const RESERVED = new Set(['id', 'createdAt', 'updatedAt', 'deletedAt', 'deletedBy']);

/** A field for a phrase from a brief, or null when nothing usable remains. */
export function fieldFromPhrase(phrase: string): { field: FieldInput; cue: string | null } | null {
  const all: string[] = phrase.toLowerCase().match(/[a-z]+/g) ?? [];
  // "a live map of delivery locations" describes a screen, not a field.
  if (all.includes('of')) return null;
  const parts = all.filter((w) => !FILLER.has(w));
  if (parts.length === 0 || parts.length > 3) return null;
  let name = camel(parts);
  if (RESERVED.has(name)) name = `${name}Value`;
  if (name.length > 40) return null;
  const rule = RULES.find((r) => r.cues.some((cue) => parts.includes(cue)));
  const cue = rule ? (rule.cues.find((c) => parts.includes(c)) ?? null) : null;
  return { field: rule ? rule.build(name) : ({ name, kind: 'text' } as FieldInput), cue };
}

/** Brief-wide cues that add a field to the focus entity when it lacks that kind. */
export const GLOBAL_CUES: readonly { kind: string; cues: readonly string[]; field: FieldInput }[] =
  [
    {
      kind: 'geo',
      cues: ['location', 'locations', 'address', 'addresses', 'map', 'maps', 'nearby', 'gps'],
      field: { name: 'location', kind: 'geo' } as FieldInput,
    },
    {
      kind: 'money',
      cues: [
        'price',
        'prices',
        'pricing',
        'revenue',
        'cost',
        'costs',
        'budget',
        'invoice',
        'invoices',
        'payment',
        'payments',
        'amount',
      ],
      field: {
        name: 'amount',
        kind: 'money',
        min: 0,
        max: 1_000_000,
        trend: 'growth',
      } as FieldInput,
    },
    {
      kind: 'date',
      cues: ['deadline', 'deadlines', 'due', 'calendar', 'schedule', 'scheduled', 'dates'],
      field: { name: 'dueOn', kind: 'date', window: 'around' } as FieldInput,
    },
    {
      kind: 'persona',
      cues: ['assign', 'assigns', 'assigned', 'assignee', 'owner', 'owners', 'team'],
      field: { name: 'owner', kind: 'persona' } as FieldInput,
    },
  ];

/**
 * Entity names that describe people. They get an `avatar` field (a face from
 * the avatar library), so generated lists and details show real-looking people.
 */
export const PEOPLE_ENTITIES: ReadonlySet<string> = new Set([
  'agent',
  'athlete',
  'attendee',
  'author',
  'candidate',
  'client',
  'coach',
  'contact',
  'courier',
  'customer',
  'doctor',
  'driver',
  'employee',
  'follower',
  'groomer',
  'guest',
  'instructor',
  'lead',
  'member',
  'mentor',
  'nurse',
  'patient',
  'player',
  'resident',
  'rider',
  'student',
  'subscriber',
  'teacher',
  'technician',
  'tenant',
  'trainer',
  'tutor',
  'volunteer',
  'worker',
]);

/** The avatar field added to people-like entities: `avatar`, or `photo` when the name is taken. */
export function avatarFieldFor(fieldNames: readonly string[]): FieldInput | null {
  const name = ['avatar', 'photo', 'face'].find((candidate) => !fieldNames.includes(candidate));
  return name ? ({ name, kind: 'avatar', label: 'Photo' } as FieldInput) : null;
}
