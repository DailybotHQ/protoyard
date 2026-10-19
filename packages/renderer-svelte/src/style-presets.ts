import type { Theme } from '@protoyard/core';
import { type StylePresetSelection, stylePresetInput } from '@protoyard/themes';

/**
 * Loaded on demand by `bindAppearance` the first time a style preset
 * (radius, elevation, font, motion) is active, so the preset data and font
 * catalog stay out of the initial bundle. Same result as `applyStylePresets`
 * without re-parsing the theme: the theme is already valid and every preset
 * value is library data, so the zod schemas stay out of this chunk too.
 */
export function styledTheme(theme: Theme, selection: StylePresetSelection): Theme {
  const { style, ...fields } = stylePresetInput(selection);
  const base = theme.style;
  return {
    ...theme,
    ...fields,
    style: {
      ...base,
      elevation: style.elevation ?? base.elevation,
      shape: { ...base.shape, ...style.shape },
      motion: { ...base.motion, ...style.motion } as Theme['style']['motion'],
    },
  };
}
