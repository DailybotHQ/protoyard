/*
 * Palette sizes and validation thresholds, in their own module so code that
 * only needs them (theme-block readers, color helpers) does not pull in the
 * palette builder, which loads lazily through `@protoyard/charts/palette/derive`.
 */

export const CATEGORICAL_COUNT = 8;
export const RAMP_STEPS = 9;

/** Graphical objects need 3:1 against adjacent colors (WCAG 1.4.11). */
export const MIN_SURFACE_CONTRAST = 3;
/** OKLab distance between any two categorical colors in normal vision. */
export const MIN_CATEGORICAL_DISTANCE = 0.08;
/** OKLab distance between any two categorical colors under simulated protanopia/deuteranopia. */
export const MIN_CVD_DISTANCE = 0.04;
