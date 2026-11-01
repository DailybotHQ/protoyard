import { type MissionProgress } from '@protoyard/gamification';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as kit from '../src/index.ts';
import MissionCard from '../src/mission/MissionCard.svelte';

afterEach(cleanup);

const mission = (over: Partial<MissionProgress> = {}): MissionProgress => ({
  id: 'three-this-week',
  title: 'Help three people this week',
  description: 'Three confirmed helps Monday through Sunday.',
  goal: 3,
  reward: 30,
  accepted: false,
  progress: 1,
  complete: false,
  expired: false,
  ...over,
});

describe('AchievementBadge and MissionCard', () => {
  it('accepts a mission through a pending Button promise', async () => {
    let resolveAccept!: () => void;
    const pending = new Promise<void>((resolve) => {
      resolveAccept = resolve;
    });
    const onAccept = vi.fn(() => pending);
    const view = render(MissionCard, {
      props: { mission: mission(), onAccept },
    });
    const button = view.getByRole('button', { name: 'Accept mission' });
    await fireEvent.click(button);
    expect(onAccept).toHaveBeenCalledWith('three-this-week');
    await waitFor(() => expect(button.getAttribute('aria-busy')).toBe('true'));
    resolveAccept();
    await waitFor(() => expect(button.getAttribute('aria-busy')).not.toBe('true'));
  });
});

// --- merged from exports.test.ts ---

describe('@protoyard/gamification-ui exports', () => {
  it('exports the six required surfaces', () => {
    expect(kit.LevelChip).toBeTypeOf('function');
    expect(kit.PointsChip).toBeTypeOf('function');
    expect(kit.StreakChip).toBeTypeOf('function');
    expect(kit.AchievementBadge).toBeTypeOf('function');
    expect(kit.MissionCard).toBeTypeOf('function');
    expect(kit.Leaderboard).toBeTypeOf('function');
  });
});
