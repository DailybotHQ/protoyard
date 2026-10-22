import type {
  ActivityLevel,
  DataDensity,
  NetworkMode,
  SubscriptionStatus,
  ViewportPreset,
} from '@protoyard/core';
import type { ScenarioFragment } from './compose.ts';
import type { Seasonality } from './series.ts';

/**
 * Reusable, domain-free scenario building blocks. Fragments describe ONE axis
 * (tenure, role, billing, network…); full presets combine them into the
 * situations product teams ask for most. Prototypes extend presets by id
 * (`extends: 'first-week'`) or compose them in code.
 *
 * Presets carry a fixed seed and reference time so they are valid on their
 * own; a prototype normally overrides both.
 */

export const PRESET_REFERENCE_TIME = '2026-03-02T09:00:00.000Z';
export const PRESET_SEED = 20_260_302;

/** Single-axis fragments. Combine with `composeScenario(base, ...fragments)`. */
export const fragments = {
  density: (density: DataDensity): ScenarioFragment => ({ density }),
  activity: (level: ActivityLevel): ScenarioFragment => ({ activity: { level } }),
  role: (role: string): ScenarioFragment => ({ actor: { role } }),
  /** Actor tenure, independent from organization age. */
  tenure: (joinedDaysAgo: number): ScenarioFragment => ({ actor: { joinedDaysAgo } }),
  organizationAge: (ageDays: number): ScenarioFragment => ({ organization: { ageDays } }),
  organizationSize: (size: number): ScenarioFragment => ({ organization: { size } }),
  /** Account age: organization created and actor joined `days` ago. */
  accountAge: (days: number): ScenarioFragment => ({
    organization: { ageDays: days },
    actor: { joinedDaysAgo: days },
  }),
  onboarding: (progress: number): ScenarioFragment => ({
    actor: { onboardingComplete: progress >= 1, onboardingProgress: progress },
  }),
  subscription: (subscription: SubscriptionStatus): ScenarioFragment => ({
    organization: { subscription },
  }),
  network: (network: NetworkMode, latencyMs = 0): ScenarioFragment => ({
    environment: { network, latencyMs },
  }),
  featureFlags: (flags: Record<string, boolean>): ScenarioFragment => ({
    organization: { featureFlags: flags },
  }),
  appearance: (appearance: {
    themeId?: string;
    mode?: 'light' | 'dark' | 'system';
    reducedMotion?: boolean;
    viewport?: ViewportPreset;
  }): ScenarioFragment => ({ appearance }),
  tags: (...tags: string[]): ScenarioFragment => ({ tags }),
  /**
   * Days of history for time series (`scenarioSeriesOptions`); also ages the
   * organization so records and series start together.
   */
  history: (days: number): ScenarioFragment => ({
    organization: { ageDays: days },
    generators: { series: { historyDays: days } },
  }),
  /** Seasonal rhythm for time series and event streams. */
  seasonality: (kind: Seasonality): ScenarioFragment => ({
    generators: { series: { seasonality: kind } },
  }),
  /** A lift `daysAgo` days before the reference time that decays over `decayDays`. */
  spike: (daysAgo: number, factor: number, decayDays = 3): ScenarioFragment => ({
    generators: { series: { spikes: [{ daysAgo, factor, decayDays }] } },
  }),
  /** Share of free calendar time that is booked (`schedule()` default), in [0, 1]. */
  occupancy: (occupancy: number): ScenarioFragment => ({
    generators: { schedule: { occupancy } },
  }),
} as const;
