import type { MissionProgress } from '@protoyard/gamification';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AchievementBadge from '../src/badge/AchievementBadge.svelte';
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
  it('exposes progress on the badge and marks earned state', () => {
    const open = render(AchievementBadge, {
      props: {
        name: 'First help',
        description: 'Your first confirmed help.',
        progress: 0,
        goal: 1,
        earned: false,
      },
    });
    expect(open.getByRole('img', { name: /First help, 0 of 1/ })).toBeTruthy();
    expect(open.container.querySelector('[data-py-badge-ring]')).toBeNull();
    open.unmount();

    const earned = render(AchievementBadge, {
      props: { name: 'First help', earned: true, progress: 1, goal: 1 },
    });
    expect(earned.getByLabelText('First help, earned')).toBeTruthy();
    expect(earned.container.querySelector('[data-earned="true"]')).toBeTruthy();
    expect(earned.container.querySelector('[data-py-badge-ring]')).toBeTruthy();
  });

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

  it('hides accept when already accepted or expired', () => {
    const accepted = render(MissionCard, {
      props: { mission: mission({ accepted: true, progress: 2 }), onAccept: vi.fn() },
    });
    expect(accepted.queryByRole('button', { name: 'Accept mission' })).toBeNull();
    expect(accepted.getByText('Accepted')).toBeTruthy();
    accepted.unmount();

    const expired = render(MissionCard, {
      props: { mission: mission({ expired: true }), onAccept: vi.fn() },
    });
    expect(expired.queryByRole('button', { name: 'Accept mission' })).toBeNull();
    expect(expired.getByText('Expired')).toBeTruthy();
  });
});
