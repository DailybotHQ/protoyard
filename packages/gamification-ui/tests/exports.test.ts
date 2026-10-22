import { describe, expect, it } from 'vitest';
import * as kit from '../src/index.ts';

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
