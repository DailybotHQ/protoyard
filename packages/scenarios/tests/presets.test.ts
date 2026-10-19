import { parseScenario } from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import { composeScenario, fragments, PRESET_IDS, PRESETS, presetScenario } from '../src/index.ts';

describe('data presets', () => {
  it('adds quarter-of-history, launch-spike and busy-week, each valid on its own', () => {
    for (const id of ['quarter-of-history', 'launch-spike', 'busy-week'] as const) {
      expect(PRESET_IDS).toContain(id);
      const scenario = presetScenario(id);
      expect(scenario.id).toBe(id);
      expect(scenario.group).toBe('Data');
      expect(() => parseScenario(PRESETS[id])).not.toThrow();
    }
  });

  it('carries series and schedule knobs in generators', () => {
    expect(presetScenario('quarter-of-history').generators).toEqual({
      series: { historyDays: 90, seasonality: 'weekly' },
    });
    expect(presetScenario('launch-spike').generators).toEqual({
      series: {
        historyDays: 45,
        seasonality: 'weekly',
        spikes: [{ daysAgo: 3, factor: 5, decayDays: 4 }],
      },
    });
    expect(presetScenario('busy-week').generators).toMatchObject({
      schedule: { occupancy: 0.9 },
    });
    expect(presetScenario('quarter-of-history').organization.ageDays).toBe(90);
  });
});

describe('series fragments', () => {
  it('compose onto any preset and merge with later values winning', () => {
    const scenario = composeScenario(
      PRESETS['active-month'],
      { id: 'growth-quarter' },
      fragments.history(120),
      fragments.seasonality('weekly+annual'),
      fragments.spike(10, 2),
      fragments.occupancy(0.4)
    );
    expect(scenario.organization.ageDays).toBe(120);
    expect(scenario.generators).toEqual({
      series: {
        historyDays: 120,
        seasonality: 'weekly+annual',
        spikes: [{ daysAgo: 10, factor: 2, decayDays: 3 }],
      },
      schedule: { occupancy: 0.4 },
    });
    const later = composeScenario(scenario, fragments.seasonality('none'));
    expect(later.generators).toMatchObject({ series: { historyDays: 120, seasonality: 'none' } });
  });
});
