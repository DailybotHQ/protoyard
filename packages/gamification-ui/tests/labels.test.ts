import { Trophy } from '@lucide/svelte';
import { type MissionProgress } from '@protoyard/gamification';
import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import AchievementBadge from '../src/badge/AchievementBadge.svelte';
import LevelChip from '../src/chips/LevelChip.svelte';
import PointsChip from '../src/chips/PointsChip.svelte';
import StreakChip from '../src/chips/StreakChip.svelte';
import Leaderboard from '../src/leaderboard/Leaderboard.svelte';
import MissionCard from '../src/mission/MissionCard.svelte';
import WithLabels from './fixtures/WithLabels.svelte';

afterEach(cleanup);

const mission = (over: Partial<MissionProgress> = {}): MissionProgress => ({
  id: 'auto_help',
  title: 'Help three people',
  description: 'Three confirmed helps.',
  goal: 3,
  reward: 30,
  accepted: false,
  progress: 1,
  complete: false,
  expired: false,
  ...over,
});

describe('gamification-ui labels (UG-02)', () => {
  it('keeps English without a dictionary', () => {
    const view = render(LevelChip, { props: { level: 3 } });
    expect(view.getByRole('img', { name: 'Level 3' })).toBeTruthy();
    const points = render(PointsChip, { props: { points: 1500, provisional: 10 } });
    expect(points.getByRole('img', { name: '1500 points verified, 10 in progress' })).toBeTruthy();
    expect(
      render(StreakChip, { props: { weeks: 1 } }).getByRole('img', { name: '1 week streak' })
    ).toBeTruthy();
  });

  it('speaks the dictionary language for chips, missions and the leaderboard', () => {
    const level = render(WithLabels, {
      props: {
        component: LevelChip,
        props: { level: 3 },
        labels: { 'protoyard.gamification.level-chip.label': 'Nivel {level}' },
      },
    });
    expect(level.getByRole('img', { name: 'Nivel 3' })).toBeTruthy();

    const card = render(WithLabels, {
      props: {
        component: MissionCard,
        props: { mission: mission(), onAccept: () => Promise.resolve() },
        labels: {
          'protoyard.gamification.mission-card.accept': 'Aceptar misión',
          'protoyard.gamification.mission-card.reward': 'Recompensa: {reward} puntos',
        },
      },
    });
    expect(card.getByRole('button', { name: 'Aceptar misión' })).toBeTruthy();
    expect(card.getByText(/Recompensa: 30 puntos/)).toBeTruthy();

    const board = render(WithLabels, {
      props: {
        component: Leaderboard,
        props: { rows: [] },
        labels: { 'protoyard.gamification.leaderboard.empty-title': 'Nadie en la tabla' },
      },
    });
    expect(board.getByText('Nadie en la tabla')).toBeTruthy();
  });

  it('shows no Accept button for a mission that needs no acceptance', () => {
    const view = render(MissionCard, {
      props: { mission: mission({ requiresAcceptance: false }), onAccept: () => Promise.resolve() },
    });
    expect(view.queryByRole('button', { name: 'Accept mission' })).toBeNull();
    expect(view.getByText('In progress')).toBeTruthy();
  });

  it('takes an icon on PointsChip and StreakChip', () => {
    const view = render(PointsChip, { props: { points: 5, icon: Trophy } });
    expect(view.container.querySelector('svg.lucide-trophy')).toBeTruthy();
    const streak = render(StreakChip, { props: { weeks: 2, icon: Trophy } });
    expect(streak.container.querySelector('svg.lucide-trophy')).toBeTruthy();
  });

  it('formats earnedAt in the active locale and links with href', () => {
    const view = render(WithLabels, {
      props: {
        component: AchievementBadge,
        props: {
          name: 'Helper',
          earned: true,
          earnedAt: '2026-10-20T12:00:00.000Z',
          href: '#/badges/helper',
        },
        labels: { 'protoyard.gamification.achievement-badge.earned-on': 'Obtenida el {date}' },
        locale: 'es',
      },
    });
    const expected = new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(
      Date.parse('2026-10-20T12:00:00.000Z')
    );
    expect(view.getByText(`Obtenida el ${expected}`)).toBeTruthy();
    const link = view.getByRole('link', { name: `Helper, earned ${expected}` });
    expect(link.getAttribute('href')).toBe('#/badges/helper');
  });
});
