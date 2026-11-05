import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import Leaderboard from '../src/leaderboard/Leaderboard.svelte';
import type { LeaderboardRow } from '../src/ports.ts';

afterEach(cleanup);

/**
 * ADR-046 / Dailybot G-030: a product's own kudos counts map to plain
 * leaderboard rows; no gamification engine or runtime is involved.
 */
describe('gamification-ui on a product domain', () => {
  it("renders a product's own ranking from plain rows", () => {
    const kudos = [
      { userId: 'u-ada', name: 'Ada Example', kudos: 42 },
      { userId: 'u-lin', name: 'Lin Example', kudos: 17 },
    ];
    const rows: LeaderboardRow[] = kudos.map((k, i) => ({
      subjectId: k.userId,
      displayName: k.name,
      points: k.kudos,
      position: i + 1,
    }));
    render(Leaderboard, { props: { rows } });
    expect(screen.getByText('Ada Example')).toBeTruthy();
    expect(screen.getByText('Lin Example')).toBeTruthy();
  });
});
