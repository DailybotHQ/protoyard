import { describe, expect, it } from 'vitest';
import {
  acceptMission,
  type BadgeDef,
  badgeProgress,
  type MissionDef,
  type MissionOptIn,
  missionProgress,
  missionsFor,
} from '../src/index.ts';

const BADGES: readonly BadgeDef[] = [
  {
    id: 'first-help',
    name: 'First help',
    description: 'Your first confirmed help.',
    goal: 1,
  },
  {
    id: 'five-neighbors',
    name: 'Five neighbors',
    description: 'Helped five different people.',
    goal: 5,
  },
  {
    id: 'streak-4',
    name: 'Four-week streak',
    description: 'Four consecutive weeks with an action.',
    goal: 4,
  },
];

const MISSIONS: readonly MissionDef[] = [
  {
    id: 'three-this-week',
    title: 'Help three people this week',
    description: 'Three confirmed helps Monday through Sunday.',
    goal: 3,
    reward: 30,
  },
  {
    id: 'publish-offer',
    title: 'Publish an offer',
    description: 'Share one offer of time or skills.',
    goal: 1,
    reward: 10,
    deadlineAt: '2026-10-15T00:00:00.000Z',
  },
];

describe('badges and missions', () => {
  it('builds badge progress capped at the goal without inventing earnings', () => {
    const rows = badgeProgress(
      BADGES,
      { 'first-help': 1, 'five-neighbors': 2, 'streak-4': 2, unknown: 99 },
      new Set(['first-help'])
    );
    expect(rows).toEqual([
      {
        id: 'first-help',
        name: 'First help',
        description: 'Your first confirmed help.',
        earned: true,
        progress: 1,
        goal: 1,
      },
      {
        id: 'five-neighbors',
        name: 'Five neighbors',
        description: 'Helped five different people.',
        earned: false,
        progress: 2,
        goal: 5,
      },
      {
        id: 'streak-4',
        name: 'Four-week streak',
        description: 'Four consecutive weeks with an action.',
        earned: false,
        progress: 2,
        goal: 4,
      },
    ]);
  });

  it('keeps mission progress derived and stores only the opt-in', () => {
    const now = new Date('2026-10-20T12:00:00.000Z');
    let optIns: MissionOptIn[] = [];
    optIns = acceptMission(MISSIONS, optIns, {
      id: 'mop-1',
      subjectId: 'user_0001',
      missionId: 'three-this-week',
      acceptedAt: now.toISOString(),
    });
    optIns = acceptMission(MISSIONS, optIns, {
      id: 'mop-2',
      subjectId: 'user_0001',
      missionId: 'three-this-week',
      acceptedAt: now.toISOString(),
    });
    expect(optIns).toHaveLength(1);

    const progress = missionsFor(
      MISSIONS,
      { 'three-this-week': 1, 'publish-offer': 0 },
      optIns,
      'user_0001',
      now
    );
    expect(progress.find((row) => row.id === 'three-this-week')).toMatchObject({
      accepted: true,
      progress: 1,
      complete: false,
      expired: false,
      reward: 30,
    });
    expect(progress.find((row) => row.id === 'publish-offer')).toMatchObject({
      accepted: false,
      expired: true,
      complete: false,
    });
  });

  it('rejects unknown missions and accepting after the deadline', () => {
    expect(() =>
      acceptMission(MISSIONS, [], {
        id: 'mop-x',
        subjectId: 'user_0001',
        missionId: 'missing',
        acceptedAt: '2026-10-20T12:00:00.000Z',
      })
    ).toThrow(/unknown mission/);
    expect(() =>
      acceptMission(MISSIONS, [], {
        id: 'mop-x',
        subjectId: 'user_0001',
        missionId: 'publish-offer',
        acceptedAt: '2026-10-20T12:00:00.000Z',
      })
    ).toThrow(/deadline/);
  });

  it('marks a mission complete only when accepted, not expired, and at goal', () => {
    const now = new Date('2026-10-10T12:00:00.000Z');
    const rows = missionProgress(
      MISSIONS,
      { 'three-this-week': 3, 'publish-offer': 1 },
      new Set(['three-this-week', 'publish-offer']),
      now
    );
    expect(rows.find((row) => row.id === 'three-this-week')?.complete).toBe(true);
    expect(rows.find((row) => row.id === 'publish-offer')?.complete).toBe(true);
    const later = missionProgress(
      MISSIONS,
      { 'publish-offer': 1 },
      new Set(['publish-offer']),
      new Date('2026-10-20T12:00:00.000Z')
    );
    expect(later.find((row) => row.id === 'publish-offer')).toMatchObject({
      expired: true,
      complete: false,
    });
  });
});
