import { describe, expect, it } from 'vitest';
import {
  type ApprovalActor,
  type ApprovalContext,
  ApprovalError,
  type AutonomyConfig,
  DEFAULT_AUTONOMY,
  decide,
  decideSuggestion,
  effectiveLevel,
  mayDecide,
  modeForLevel,
  notifyAllowed,
  refreshPending,
  retarget,
  type Suggestion,
  type SuggestionCandidate,
  setLevel,
  sortAudit,
  statusLine,
  suggestFromCandidate,
  suggestionIdFor,
} from '../src/approvals/index.ts';

const APPROVER: ApprovalActor = { id: 'person_avery', canApprove: true };
const SUBJECT: ApprovalActor = { id: 'person_oscar', canApprove: false };
const OTHER: ApprovalActor = { id: 'person_maria', canApprove: false };

function level(levels: Partial<Record<string, AutonomyConfig['levels'][string]>>): AutonomyConfig {
  return {
    levels: { ...DEFAULT_AUTONOMY.levels, ...levels } as AutonomyConfig['levels'],
    caps: { ...DEFAULT_AUTONOMY.caps },
  };
}

function candidate(overrides: Partial<SuggestionCandidate> = {}): SuggestionCandidate {
  return {
    sourceId: 'resp_1',
    subjectId: SUBJECT.id,
    kind: 'link_record',
    action: 'apply',
    summary: 'Link blocker to ENG-12',
    targetId: 'task_12',
    targetKey: 'ENG-12',
    targetLabel: 'Ship onboarding',
    payload: { responseId: 'resp_1' },
    ...overrides,
  };
}

function ctx(overrides: Partial<ApprovalContext> = {}): ApprovalContext {
  return {
    now: '2026-03-15T10:00:00.000Z',
    scopeId: 'org_example',
    buildEffects: (suggestion, _path) => ({
      apply: {
        type: 'link_record',
        targetId: suggestion.targetId ?? 'unknown',
        summary: `Link to ${suggestion.targetKey ?? 'target'}`,
        payload: {
          ...suggestion.payload,
          targetId: suggestion.targetId,
          subjectId: suggestion.subjectId,
        },
      },
      notify: {
        channelId: 'channel_onboarding',
        text: `Please review ${suggestion.targetKey ?? 'the target'}`,
        mentionId: 'person_owner',
      },
    }),
    ...overrides,
  };
}

describe('approval policy', () => {
  it('maps the four levels to modes, clamps to the cap and refuses above it', () => {
    expect(modeForLevel(1)).toBe('inform');
    expect(modeForLevel(2)).toBe('suggest');
    expect(modeForLevel(3)).toBe('act_with_approval');
    expect(modeForLevel(4)).toBe('act');

    expect(decide(level({ records: 1 }), 'apply')).toBe('inform');
    expect(decide(level({ records: 2 }), 'apply')).toBe('suggest');
    expect(decide(level({ records: 3 }), 'apply')).toBe('act_with_approval');
    expect(decide(level({ records: 4 }), 'apply')).toBe('act');

    expect(effectiveLevel(level({ external: 4 }), 'external')).toBe(3);
    expect(decide(level({ external: 4 }), 'message_external')).toBe('act_with_approval');

    expect(() => setLevel(DEFAULT_AUTONOMY, 'billing', 2)).toThrow(/Unknown autonomy area/);
    expect(() => setLevel(DEFAULT_AUTONOMY, 'records', 5)).toThrow(/outside 1–4/);
    expect(() => setLevel(DEFAULT_AUTONOMY, 'external', 4)).toThrow(/always asks first/);

    const next = setLevel(DEFAULT_AUTONOMY, 'records', 4);
    expect(next.levels.records).toBe(4);
    expect(DEFAULT_AUTONOMY.levels.records).toBe(2);
  });

  it('notifies on its own only at notifications Level 4, after a person unless Level 1', () => {
    expect(notifyAllowed(level({ notifications: 4 }), 'auto')).toBe(true);
    expect(notifyAllowed(level({ notifications: 3 }), 'auto')).toBe(false);
    expect(notifyAllowed(level({ notifications: 2 }), 'person')).toBe(true);
    expect(notifyAllowed(level({ notifications: 1 }), 'person')).toBe(false);
  });
});

describe('approval reducer', () => {
  it('Level 2: a waiting card and a suggested audit row, no effect until confirmed', () => {
    const t = suggestFromCandidate(candidate(), DEFAULT_AUTONOMY, ctx());
    expect(t.suggestion).toMatchObject({
      id: suggestionIdFor('resp_1'),
      status: 'pending',
      mode: 'suggest',
      levelAtCreation: 2,
      area: 'records',
      decidedBy: null,
    });
    expect(t.effects).toEqual({});
    expect(t.audit).toHaveLength(1);
    expect(t.audit[0]?.action).toBe('suggested');
    expect(t.audit[0]?.actor).toBe('agent');
  });

  it('confirm applies, notifies and audits both once; a second decision is refused', () => {
    const pending = suggestFromCandidate(candidate(), DEFAULT_AUTONOMY, ctx()).suggestion;
    const t = decideSuggestion(pending, 'confirm', APPROVER, DEFAULT_AUTONOMY, ctx());
    expect(t.suggestion).toMatchObject({
      status: 'confirmed',
      decidedBy: 'person',
      deciderId: APPROVER.id,
    });
    expect(t.effects.apply).toMatchObject({
      type: 'link_record',
      targetId: 'task_12',
      summary: 'Link to ENG-12',
    });
    expect(t.effects.notify).toMatchObject({
      channelId: 'channel_onboarding',
      mentionId: 'person_owner',
    });
    expect(t.audit.map((row) => row.action)).toEqual(['confirmed', 'notified']);
    expect(() =>
      decideSuggestion(t.suggestion, 'confirm', APPROVER, DEFAULT_AUTONOMY, ctx())
    ).toThrow(ApprovalError);
    try {
      decideSuggestion(t.suggestion, 'confirm', APPROVER, DEFAULT_AUTONOMY, ctx());
    } catch (error) {
      expect(error).toBeInstanceOf(ApprovalError);
      expect((error as ApprovalError).code).toBe('decided');
    }
  });

  it('dismiss writes an audit row and nothing else', () => {
    const pending = suggestFromCandidate(candidate(), DEFAULT_AUTONOMY, ctx()).suggestion;
    const t = decideSuggestion(pending, 'dismiss', SUBJECT, DEFAULT_AUTONOMY, ctx());
    expect(t.suggestion.status).toBe('dismissed');
    expect(t.effects).toEqual({});
    expect(t.audit.map((row) => row.action)).toEqual(['dismissed']);
  });

  it('only the subject or an approver decides; only an approver approves', () => {
    const pending = suggestFromCandidate(candidate(), DEFAULT_AUTONOMY, ctx()).suggestion;
    expect(mayDecide(SUBJECT, pending, 'confirm')).toBe(true);
    expect(mayDecide(OTHER, pending, 'confirm')).toBe(false);
    expect(mayDecide(SUBJECT, pending, 'approve')).toBe(false);
    expect(mayDecide(APPROVER, pending, 'approve')).toBe(true);

    expect(() => decideSuggestion(pending, 'confirm', OTHER, DEFAULT_AUTONOMY, ctx())).toThrow(
      /subject, or an approver/
    );

    const approval = suggestFromCandidate(candidate(), level({ records: 3 }), ctx()).suggestion;
    expect(approval.mode).toBe('act_with_approval');
    expect(approval.preparedApplySummary).toBe('Link to ENG-12');
    expect(approval.preparedNotifySummary).toContain('ENG-12');

    expect(() => decideSuggestion(approval, 'approve', SUBJECT, DEFAULT_AUTONOMY, ctx())).toThrow(
      /Only an approver may approve/
    );
    expect(() => decideSuggestion(approval, 'confirm', APPROVER, DEFAULT_AUTONOMY, ctx())).toThrow(
      /needs an approval/
    );
    expect(
      decideSuggestion(approval, 'approve', APPROVER, DEFAULT_AUTONOMY, ctx()).audit[0]?.action
    ).toBe('approved');
  });

  it('Level 3 refuses approve on a suggest-mode card', () => {
    const pending = suggestFromCandidate(candidate(), level({ records: 2 }), ctx()).suggestion;
    expect(() => decideSuggestion(pending, 'approve', APPROVER, DEFAULT_AUTONOMY, ctx())).toThrow(
      /confirmed, not approved/
    );
  });

  it('Level 4 applies at once; it notifies only at notifications Level 4', () => {
    const quiet = suggestFromCandidate(candidate(), level({ records: 4 }), ctx());
    expect(quiet.suggestion.status).toBe('auto');
    expect(quiet.suggestion.decidedBy).toBe('agent');
    expect(quiet.effects.apply?.targetId).toBe('task_12');
    expect(quiet.effects.notify).toBeUndefined();
    expect(quiet.audit.map((row) => row.action)).toEqual(['auto_handled']);

    const loud = suggestFromCandidate(candidate(), level({ records: 4, notifications: 4 }), ctx());
    expect(loud.effects.notify?.channelId).toBe('channel_onboarding');
    expect(loud.audit.map((row) => row.action)).toEqual(['auto_handled', 'notified']);
  });

  it('Level 1 only informs: no waiting card and no effect', () => {
    const t = suggestFromCandidate(candidate(), level({ records: 1 }), ctx());
    expect(t.suggestion.status).toBe('informed');
    expect(t.suggestion.mode).toBe('inform');
    expect(t.effects).toEqual({});
    expect(t.audit.map((row) => row.action)).toEqual(['informed']);
  });

  it('a new candidate updates the waiting card; an unchanged or decided one is left alone', () => {
    const pending = suggestFromCandidate(candidate(), DEFAULT_AUTONOMY, ctx()).suggestion;
    expect(refreshPending(pending, candidate(), DEFAULT_AUTONOMY, ctx())).toBeNull();

    const refreshed = refreshPending(
      pending,
      candidate({ summary: 'Link blocker to ENG-12 (updated)' }),
      DEFAULT_AUTONOMY,
      ctx()
    );
    expect(refreshed?.suggestion.summary).toContain('updated');
    expect(refreshed?.audit).toEqual([]);
    expect(refreshed?.effects).toEqual({});

    const decided = decideSuggestion(
      pending,
      'dismiss',
      SUBJECT,
      DEFAULT_AUTONOMY,
      ctx()
    ).suggestion;
    expect(
      refreshPending(decided, candidate({ summary: 'x' }), DEFAULT_AUTONOMY, ctx())
    ).toBeNull();
  });

  it('refresh can auto-handle when today is Level 4', () => {
    const pending = suggestFromCandidate(candidate(), DEFAULT_AUTONOMY, ctx()).suggestion;
    const t = refreshPending(
      pending,
      candidate({ summary: 'Link blocker to ENG-99', targetId: 'task_99', targetKey: 'ENG-99' }),
      level({ records: 4 }),
      ctx()
    );
    expect(t?.suggestion.status).toBe('auto');
    expect(t?.effects.apply?.targetId).toBe('task_99');
  });

  it('edit retargets a waiting card and records it', () => {
    const pending = suggestFromCandidate(candidate(), level({ records: 3 }), ctx()).suggestion;
    const t = retarget(
      pending,
      { targetId: 'task_99', targetKey: 'ENG-99', targetLabel: 'Other work' },
      SUBJECT,
      ctx()
    );
    expect(t.suggestion.targetKey).toBe('ENG-99');
    expect(t.suggestion.preparedApplySummary).toBe('Link to ENG-99');
    expect(t.audit[0]?.action).toBe('edited');
    expect(t.effects).toEqual({});

    const same = retarget(
      t.suggestion,
      { targetId: 'task_99', targetKey: 'ENG-99', targetLabel: 'Other work' },
      SUBJECT,
      ctx()
    );
    expect(same.audit).toEqual([]);
  });

  it('sorts the audit newest first and is stable on ties', () => {
    const rows = [
      {
        id: 'a',
        scopeId: 'org',
        at: '2026-03-15T10:00:00.000Z',
        actor: 'agent' as const,
        actorId: null,
        action: 'suggested' as const,
        suggestionId: 's',
        detail: 'a',
      },
      {
        id: 'c',
        scopeId: 'org',
        at: '2026-03-15T12:00:00.000Z',
        actor: 'person' as const,
        actorId: 'p',
        action: 'confirmed' as const,
        suggestionId: 's',
        detail: 'c',
      },
      {
        id: 'b',
        scopeId: 'org',
        at: '2026-03-15T12:00:00.000Z',
        actor: 'agent' as const,
        actorId: null,
        action: 'notified' as const,
        suggestionId: 's',
        detail: 'b',
      },
    ];
    expect(sortAudit(rows).map((row) => row.id)).toEqual(['c', 'b', 'a']);
  });

  it('statusLine reflects mode, viewer role and notify side effect', () => {
    const pending = suggestFromCandidate(candidate(), level({ records: 3 }), ctx()).suggestion;
    expect(statusLine(pending, APPROVER, false)).toMatch(/Needs your approval/);
    expect(statusLine(pending, SUBJECT, false)).toMatch(/Waiting for an approver/);

    const auto = suggestFromCandidate(
      candidate(),
      level({ records: 4, notifications: 4 }),
      ctx()
    ).suggestion;
    expect(statusLine(auto, APPROVER, true)).toMatch(/sent a notification/);
  });

  it('person confirm drops notify at notifications Level 1', () => {
    const pending = suggestFromCandidate(candidate(), DEFAULT_AUTONOMY, ctx()).suggestion;
    const t = decideSuggestion(pending, 'confirm', APPROVER, level({ notifications: 1 }), ctx());
    expect(t.effects.apply).toBeDefined();
    expect(t.effects.notify).toBeUndefined();
    expect(t.audit.map((row) => row.action)).toEqual(['confirmed']);
  });

  it('custom areas work when listed on the config', () => {
    const config: AutonomyConfig = {
      levels: { ...DEFAULT_AUTONOMY.levels, scheduling: 3 },
      caps: { ...DEFAULT_AUTONOMY.caps, scheduling: 3 },
    };
    const t = suggestFromCandidate(
      candidate({ action: 'schedule', area: 'scheduling', kind: 'schedule_reminder' }),
      config,
      ctx()
    );
    expect(t.suggestion.area).toBe('scheduling');
    expect(t.suggestion.mode).toBe('act_with_approval');
  });
});

describe('approval engine honesty', () => {
  it('never mutates the input suggestion or config', () => {
    const pending = suggestFromCandidate(candidate(), DEFAULT_AUTONOMY, ctx()).suggestion;
    const snapshot: Suggestion = structuredClone(pending);
    const configSnap = structuredClone(DEFAULT_AUTONOMY);
    decideSuggestion(pending, 'confirm', APPROVER, DEFAULT_AUTONOMY, ctx());
    expect(pending).toEqual(snapshot);
    expect(DEFAULT_AUTONOMY).toEqual(configSnap);
  });

  it('effects stay proposed data — the transition does not call buildEffects after returning', () => {
    let builds = 0;
    const context = ctx({
      buildEffects: (suggestion, path) => {
        builds += 1;
        return {
          apply: {
            type: 'link_record',
            targetId: suggestion.targetId ?? 'x',
            summary: `via ${path}`,
            payload: {},
          },
        };
      },
    });
    const pending = suggestFromCandidate(candidate(), level({ records: 3 }), context).suggestion;
    // preparedFor builds once at suggest time for act_with_approval
    expect(builds).toBe(1);
    const t = decideSuggestion(pending, 'approve', APPROVER, DEFAULT_AUTONOMY, context);
    expect(builds).toBe(2);
    expect(t.effects.apply?.summary).toBe('via person');
  });
});
