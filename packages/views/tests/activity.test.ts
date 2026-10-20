// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  type ActivityComment,
  type AuditRowLike,
  auditToActivity,
  buildThreads,
  CommentInputSchema,
  dayLabel,
  decodeMentions,
  describeChange,
  encodeMentions,
  filterActivity,
  groupByDay,
  mentionedIds,
  plainText,
  REDACTED,
  sortActivity,
  summarizeChanges,
  toggleReaction,
  tokenize,
  whenLabel,
} from '../src/activity/index.ts';

const people = new Map([
  ['p-marta', 'Marta Ruiz'],
  ['p-li', 'Li Wei'],
]);
const records = new Map([['deal-42', 'Renewal for Acme']]);
const lookups = { person: (id: string) => people.get(id), record: (id: string) => records.get(id) };
const candidates = {
  mentions: [
    { id: 'p-marta', value: 'marta.ruiz' },
    { id: 'p-li', value: 'li' },
  ],
  references: [{ id: 'deal-42', value: 'DEAL-42' }],
};

describe('mention tokenizer', () => {
  it('splits a stored body into text, mention and reference segments', () => {
    expect(tokenize('Hi @{p-marta}, see #{deal-42}.', lookups)).toEqual([
      { type: 'text', text: 'Hi ' },
      { type: 'mention', id: 'p-marta', label: 'Marta Ruiz', missing: false },
      { type: 'text', text: ', see ' },
      { type: 'reference', id: 'deal-42', label: 'Renewal for Acme', missing: false },
      { type: 'text', text: '.' },
    ]);
    expect(tokenize('plain', lookups)).toEqual([{ type: 'text', text: 'plain' }]);
    expect(tokenize('', lookups)).toEqual([]);
  });

  it('resolves names at display time, so a rename updates old comments', () => {
    const body = 'Thanks @{p-marta}';
    expect(plainText(tokenize(body, lookups))).toBe('Thanks @Marta Ruiz');
    const renamed = new Map(people).set('p-marta', 'Marta Ruiz-Olsen');
    expect(plainText(tokenize(body, { person: (id) => renamed.get(id) }))).toBe(
      'Thanks @Marta Ruiz-Olsen'
    );
    // Gone persona or record: marked missing, never a crash.
    expect(tokenize('@{p-gone} #{x-9}', lookups)).toEqual([
      { type: 'mention', id: 'p-gone', label: 'unknown person', missing: true },
      { type: 'text', text: ' ' },
      { type: 'reference', id: 'x-9', label: 'x-9', missing: true },
    ]);
  });

  it('encodes what the composer typed into id tokens and back', () => {
    const typed = 'Ping @marta.ruiz and @li about #DEAL-42, cc @nobody or email li@example.com';
    const stored = encodeMentions(typed, candidates);
    expect(stored).toBe(
      'Ping @{p-marta} and @{p-li} about #{deal-42}, cc @nobody or email li@example.com'
    );
    expect(mentionedIds(stored)).toEqual(['p-marta', 'p-li']);
    expect(decodeMentions(stored, candidates)).toBe(typed);
    // A longer handle is not split by a shorter one; a prefix of a word is not a mention.
    expect(encodeMentions('@lilly and @li.', candidates)).toBe('@lilly and @{p-li}.');
    expect(mentionedIds('@{a} @{b} @{a} #{c}')).toEqual(['a', 'b']);
  });
});

describe('day grouping', () => {
  const now = '2026-10-19T15:00:00Z'; // Monday
  it('labels days relative to the runtime clock', () => {
    const today = '2026-10-19';
    expect(dayLabel('2026-10-19', today)).toBe('Today');
    expect(dayLabel('2026-10-18', today)).toBe('Yesterday');
    expect(dayLabel('2026-10-20', today)).toBe('Tomorrow');
    expect(dayLabel('2026-10-14', today)).toBe('Wednesday');
    expect(dayLabel('2026-10-12', today)).toBe('Oct 12');
    expect(dayLabel('2025-12-31', today)).toBe('Dec 31, 2025');
  });

  it('groups by civil day in the time zone, keeping order', () => {
    const items = [
      { id: 'a', at: '2026-10-19T14:00:00Z' },
      { id: 'b', at: '2026-10-19T02:00:00Z' },
      { id: 'c', at: '2026-10-18T23:30:00Z' },
      { id: 'd', at: 'not a date' },
      { id: 'e', at: '2026-10-12T09:00:00Z' },
    ];
    const utc = groupByDay(items, { at: (i) => i.at, now });
    expect(utc.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ['Today', ['a', 'b']],
      ['Yesterday', ['c']],
      ['Oct 12', ['e']],
    ]);
    // In Los Angeles, 02:00Z and 23:30Z both fall on Sunday the 18th.
    const la = groupByDay(items, { at: (i) => i.at, now, timeZone: 'America/Los_Angeles' });
    expect(la.map((g) => [g.day, g.items.map((i) => i.id)])).toEqual([
      ['2026-10-19', ['a']],
      ['2026-10-18', ['b', 'c']],
      ['2026-10-12', ['e']],
    ]);
  });
});

describe('when labels', () => {
  it('formats a time relative to the runtime clock, in the time zone', () => {
    const now = '2026-10-19T15:00:00Z';
    expect(whenLabel('2026-10-19T09:05:00Z', { now })).toBe('Today, 9:05 AM');
    expect(whenLabel('2026-10-19T02:00:00Z', { now, timeZone: 'America/New_York' })).toBe(
      'Yesterday, 10:00 PM'
    );
    expect(whenLabel('2026-09-01T12:00:00Z', { now })).toBe('Sep 1, 12:00 PM');
    expect(whenLabel('nope', { now })).toBe('');
  });
});

describe('change summaries', () => {
  it('describes one field in plain words', () => {
    expect(describeChange('status', { before: 'open', after: 'won' })).toBe(
      'changed status from open to won'
    );
    expect(describeChange('dueDate', { before: null, after: '2026-11-01' })).toBe(
      'set due date to 2026-11-01'
    );
    expect(describeChange('owner_id', { before: 'p-1', after: '' })).toBe('cleared owner id');
    expect(describeChange('apiKey', { before: REDACTED, after: REDACTED })).toBe('changed api key');
    expect(describeChange('amountCents', { before: 120000, after: 9900 })).toBe(
      'changed amount cents from 120,000 to 9,900'
    );
    expect(describeChange('done', { before: false, after: true })).toBe(
      'changed done from No to Yes'
    );
    expect(describeChange('notes', { before: 'a', after: 'x'.repeat(100) })).toMatch(/to x{59}…$/);
    expect(
      describeChange(
        'stage',
        { before: 'lead', after: 'won' },
        { fieldLabel: () => 'Stage', formatValue: (_f, v) => String(v).toUpperCase() }
      )
    ).toBe('changed Stage from LEAD to WON');
  });

  it('summarizes audit rows and caps long change lists', () => {
    const changes = {
      a: { before: 1, after: 2 },
      b: { before: 1, after: 2 },
      c: { before: 1, after: 2 },
      d: { before: 1, after: 2 },
    };
    expect(summarizeChanges('update', changes)).toEqual([
      'changed a from 1 to 2',
      'changed b from 1 to 2',
      'and 2 more changes',
    ]);
    expect(summarizeChanges('update', {})).toEqual(['updated']);
    expect(summarizeChanges('purge', {})).toEqual(['permanently deleted']);
  });

  it('adapts blueprint audit rows to feed items, then sorts and filters them', () => {
    const row = (id: string, at: string, seq: number, extra: Partial<AuditRowLike> = {}) =>
      ({
        id,
        entity: 'deal',
        recordId: 'deal-42',
        actorId: 'p-marta',
        action: 'update',
        at,
        seq,
        changes: { stage: { before: 'lead', after: 'won' } },
        ...extra,
      }) satisfies AuditRowLike;
    const item = auditToActivity(row('au-1', '2026-10-19T10:00:00Z', 1), {
      recordLabel: (r) => records.get(r.recordId),
    });
    expect(item).toEqual({
      id: 'au-1',
      at: '2026-10-19T10:00:00Z',
      actorId: 'p-marta',
      kind: 'update',
      entity: 'deal',
      recordId: 'deal-42',
      recordLabel: 'Renewal for Acme',
      lines: ['changed stage from lead to won'],
      seq: 1,
    });
    const items = [
      item,
      auditToActivity(
        row('au-2', '2026-10-19T10:00:00Z', 2, { action: 'create', actorId: 'p-li' })
      ),
      auditToActivity(row('au-3', '2026-10-18T10:00:00Z', 9, { recordId: 'deal-7' })),
    ];
    expect(sortActivity(items).map((i) => i.id)).toEqual(['au-2', 'au-1', 'au-3']);
    expect(filterActivity(items, { kinds: ['create'] }).map((i) => i.id)).toEqual(['au-2']);
    expect(filterActivity(items, { actorId: 'p-marta' }).map((i) => i.id)).toEqual([
      'au-1',
      'au-3',
    ]);
    expect(filterActivity(items, { recordId: 'deal-7' }).map((i) => i.id)).toEqual(['au-3']);
    expect(filterActivity(items, { kinds: [] })).toHaveLength(3);
  });
});

describe('threads and reactions', () => {
  const c = (id: string, at: string, extra: Partial<ActivityComment> = {}): ActivityComment => ({
    id,
    authorId: 'p-li',
    body: id,
    createdAt: `2026-10-19T${at}:00Z`,
    ...extra,
  });

  it('nests replies under their root, oldest first', () => {
    const threads = buildThreads([
      c('r2', '11:00', { parentId: 'root' }),
      c('root', '09:00'),
      c('nested', '12:00', { parentId: 'r2' }),
      c('r1', '10:00', { parentId: 'root' }),
      c('orphan', '08:00', { parentId: 'gone' }),
      c('gone-root', '07:00', { deletedAt: '2026-10-19T07:30:00Z' }),
      c('kept-root', '06:00', { deletedAt: '2026-10-19T06:30:00Z' }),
      c('kept-reply', '06:10', { parentId: 'kept-root' }),
    ]);
    expect(threads.map((t) => [t.comment.id, t.replies.map((r) => r.id)])).toEqual([
      ['kept-root', ['kept-reply']],
      ['orphan', []],
      ['root', ['r1', 'r2', 'nested']],
    ]);
  });

  it('validates comment input and toggles reactions', () => {
    expect(CommentInputSchema.parse({ body: '  hi  ' })).toEqual({ body: 'hi', parentId: null });
    const blank = CommentInputSchema.safeParse({ body: '   ' });
    expect(blank.success === false && blank.error.issues[0]?.message).toBe('Write something first');
    const once = toggleReaction(undefined, '👍', 'p-li');
    expect(once).toEqual({ '👍': ['p-li'] });
    expect(toggleReaction(once, '👍', 'p-marta')).toEqual({ '👍': ['p-li', 'p-marta'] });
    expect(toggleReaction(once, '👍', 'p-li')).toEqual({});
    expect(once).toEqual({ '👍': ['p-li'] }); // not mutated
  });

  it('keeps a stored __proto__ reaction key as data, never as the prototype', () => {
    const stored = JSON.parse('{"__proto__":["p-x"],"👍":["p-li"]}') as Record<string, string[]>;
    const next = toggleReaction(stored, '👍', 'p-marta');
    expect(Object.getPrototypeOf(next)).toBe(Object.prototype);
    expect(Object.hasOwn(next, '__proto__')).toBe(true);
    expect(Object.getOwnPropertyDescriptor(next, '__proto__')?.value).toEqual(['p-x']);
    expect(next['👍']).toEqual(['p-li', 'p-marta']);
    const removed = toggleReaction(next, '__proto__', 'p-x');
    expect(Object.hasOwn(removed, '__proto__')).toBe(false);
    expect(Object.getPrototypeOf(removed)).toBe(Object.prototype);
  });
});
