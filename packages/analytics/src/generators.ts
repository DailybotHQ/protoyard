/*
 * Deterministic analytics generators (time series with trend, seasonality
 * and noise; product events; funnel journeys; cohorts) are added by the
 * PLAN_003 analytics-generators task. They use only the scenario context
 * (`ctx.rng`, `ctx.ids`, `ctx.time`, `ctx.scale`), never Math.random() or
 * Date.now().
 */

/** Bump when generator output can change, so prototypes bump their `generatorVersion`. */
export const ANALYTICS_GENERATOR_VERSION = 1;
