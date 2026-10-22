import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import LevelChip from '../src/chips/LevelChip.svelte';
import PointsChip from '../src/chips/PointsChip.svelte';
import StreakChip from '../src/chips/StreakChip.svelte';

afterEach(cleanup);

describe('gamification chips', () => {
  it('names level, points and streak for assistive tech', () => {
    const level = render(LevelChip, { props: { level: 3 } });
    expect(level.getByRole('img', { name: 'Level 3' }).textContent).toContain('Level 3');
    level.unmount();

    const points = render(PointsChip, { props: { points: 140, provisional: 10 } });
    expect(
      points.getByRole('img', { name: '140 points verified, 10 in progress' }).textContent
    ).toContain('140');
    points.unmount();

    const streak = render(StreakChip, { props: { weeks: 4 } });
    expect(streak.getByRole('img', { name: '4 week streak' }).textContent).toContain('4');
  });

  it('renders level as a link when href is set', () => {
    const view = render(LevelChip, { props: { level: 2, href: '#/level' } });
    expect(view.getByRole('link', { name: 'Level 2' }).getAttribute('href')).toBe('#/level');
  });
});
