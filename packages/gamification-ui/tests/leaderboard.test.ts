import type { LeaderboardRow } from '@protoyard/gamification';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Leaderboard from '../src/leaderboard/Leaderboard.svelte';

afterEach(cleanup);

const rows: LeaderboardRow[] = [
  { subjectId: 'user_b', displayName: 'Bea', points: 100, position: 1 },
  { subjectId: 'user_a', displayName: 'Ada', points: 10, position: 2 },
];

describe('Leaderboard', () => {
  it('renders ranked rows and highlights the current person', () => {
    const view = render(Leaderboard, {
      props: { rows, currentSubjectId: 'user_a', rankingOptIn: true },
    });
    expect(view.getByLabelText('Position 1').textContent).toContain('1');
    expect(view.getByText('Ada').textContent).toContain('(you)');
    expect(
      view.container.querySelector('[data-you="true"]')?.getAttribute('data-py-leaderboard-row')
    ).toBe('user_a');
  });

  it('shows empty state and can opt in through the action', async () => {
    const onRankingOptInChange = vi.fn(async () => undefined);
    const view = render(Leaderboard, {
      props: {
        rows: [],
        rankingOptIn: false,
        currentSubjectId: 'user_a',
        onRankingOptInChange,
      },
    });
    expect(view.getByText('Nobody is on the board yet')).toBeTruthy();
    await fireEvent.click(view.getByRole('button', { name: 'Show me on the board' }));
    await waitFor(() => expect(onRankingOptInChange).toHaveBeenCalledWith(true));
  });

  it('toggles privacy through the switch', async () => {
    const onRankingOptInChange = vi.fn(async () => undefined);
    const view = render(Leaderboard, {
      props: {
        rows,
        rankingOptIn: true,
        currentSubjectId: 'user_a',
        onRankingOptInChange,
      },
    });
    const toggle = view.getByRole('switch', { name: 'Appear on the leaderboard' });
    await fireEvent.click(toggle);
    await waitFor(() => expect(onRankingOptInChange).toHaveBeenCalledWith(false));
  });
});
