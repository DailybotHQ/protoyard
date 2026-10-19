import type { Theme } from '@protoyard/core';
import { getFontPairing } from '../fonts.ts';
import { createThemeFromSeed } from '../palette.ts';
import type { LibraryThemeDefinition } from './types.ts';

/** Builds a full Theme from a declarative library definition. */
export function buildLibraryTheme(definition: LibraryThemeDefinition): Theme {
  return createThemeFromSeed({
    id: definition.id,
    name: definition.name,
    seed: definition.seed,
    ...(definition.secondary ? { secondary: definition.secondary } : {}),
    ...(definition.neutral ? { neutral: definition.neutral } : {}),
    ...(definition.style ? { style: definition.style } : {}),
  });
}

/**
 * Applies font stacks, radius and density after the palette engine runs.
 * Kept separate so createThemeFromSeed stays pure color + style.
 */
export function finishLibraryTheme(theme: Theme, definition: LibraryThemeDefinition): Theme {
  const pairing = definition.font ? getFontPairing(definition.font) : undefined;
  return {
    ...theme,
    description: definition.description || theme.description,
    ...(pairing
      ? {
          fontFamily: pairing.fontFamily,
          fontFamilyHeading: pairing.fontFamilyHeading,
          fontFamilyMono: pairing.fontFamilyMono,
        }
      : {}),
    ...(definition.radius !== undefined ? { radius: definition.radius } : {}),
    ...(definition.density !== undefined ? { density: definition.density } : {}),
  };
}

export function themeFromDefinition(definition: LibraryThemeDefinition): Theme {
  return finishLibraryTheme(buildLibraryTheme(definition), definition);
}
