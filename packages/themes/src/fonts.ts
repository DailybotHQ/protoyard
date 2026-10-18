/** A curated family pairing. All catalog defaults use locally available system fonts. */
export interface FontPairing {
  id: string;
  label: string;
  category:
    | 'system'
    | 'humanist'
    | 'geometric'
    | 'grotesk'
    | 'editorial'
    | 'rounded'
    | 'condensed'
    | 'mono';
  fontFamily: string;
  fontFamilyHeading: string;
  fontFamilyMono: string;
}

const stacks = {
  system: [
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    'system',
    'system',
  ],
  humanist: ['"Trebuchet MS", "Segoe UI", sans-serif', 'humanist', 'humanist'],
  geometric: ['"Avenir Next", Avenir, "Century Gothic", sans-serif', 'geometric', 'system'],
  grotesk: ['"Helvetica Neue", Helvetica, Arial, sans-serif', 'grotesk', 'system'],
  editorial: [
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    'editorial',
    'system',
  ],
  rounded: ['"Trebuchet MS", "Segoe UI", sans-serif', 'rounded', 'system'],
  condensed: [
    '"Arial Narrow", "Roboto Condensed", "Liberation Sans Narrow", sans-serif',
    'condensed',
    'system',
  ],
  mono: ['ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace', 'mono', 'mono'],
} as const;

const monoStack = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';
const editorialStack = '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif';
const roundedStack = '"Arial Rounded MT Bold", "Trebuchet MS", "Segoe UI", sans-serif';
const condensedStack = '"Arial Narrow", "Roboto Condensed", "Liberation Sans Narrow", sans-serif';
const systemStack = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

function pairing(
  id: keyof typeof stacks,
  label: string,
  category: FontPairing['category'],
  fontFamily: string,
  fontFamilyHeading: string,
  fontFamilyMono: string
): FontPairing {
  return { id, label, category, fontFamily, fontFamilyHeading, fontFamilyMono };
}

/** System-first catalog: selecting an entry never downloads a font. */
export const FONT_CATALOG: readonly FontPairing[] = [
  pairing(
    'system',
    'System',
    'system',
    `var(--py-font-stack-system-sans, ${systemStack})`,
    `var(--py-font-stack-system-heading, ${systemStack})`,
    `var(--py-font-stack-system-mono, ${monoStack})`
  ),
  pairing(
    'humanist',
    'Humanist',
    'humanist',
    `var(--py-font-stack-humanist-sans, ${stacks.humanist[0]})`,
    `var(--py-font-stack-humanist-heading, ${stacks.humanist[0]})`,
    `var(--py-font-stack-humanist-mono, ${monoStack})`
  ),
  pairing(
    'geometric',
    'Geometric',
    'geometric',
    `var(--py-font-stack-geometric-sans, ${stacks.geometric[0]})`,
    `var(--py-font-stack-geometric-heading, ${stacks.geometric[0]})`,
    `var(--py-font-stack-geometric-mono, ${monoStack})`
  ),
  pairing(
    'grotesk',
    'Grotesk',
    'grotesk',
    `var(--py-font-stack-grotesk-sans, ${stacks.grotesk[0]})`,
    `var(--py-font-stack-grotesk-heading, ${stacks.grotesk[0]})`,
    `var(--py-font-stack-grotesk-mono, ${monoStack})`
  ),
  pairing(
    'editorial',
    'Editorial serif',
    'editorial',
    `var(--py-font-stack-editorial-sans, ${systemStack})`,
    `var(--py-font-stack-editorial-heading, ${editorialStack})`,
    `var(--py-font-stack-editorial-mono, ${monoStack})`
  ),
  pairing(
    'rounded',
    'Rounded',
    'rounded',
    `var(--py-font-stack-rounded-sans, ${roundedStack})`,
    `var(--py-font-stack-rounded-heading, ${roundedStack})`,
    `var(--py-font-stack-rounded-mono, ${monoStack})`
  ),
  pairing(
    'condensed',
    'Condensed',
    'condensed',
    `var(--py-font-stack-condensed-sans, ${condensedStack})`,
    `var(--py-font-stack-condensed-heading, ${condensedStack})`,
    `var(--py-font-stack-condensed-mono, ${monoStack})`
  ),
  pairing(
    'mono',
    'Monospace',
    'mono',
    `var(--py-font-stack-mono-sans, ${systemStack})`,
    `var(--py-font-stack-mono-heading, ${systemStack})`,
    `var(--py-font-stack-mono-mono, ${monoStack})`
  ),
];

/** Returns a family pairing for a theme, or undefined for an unknown catalog id. */
export function getFontPairing(id: string): FontPairing | undefined {
  return FONT_CATALOG.find((font) => font.id === id);
}

export interface SelfHostedVariableFont {
  /** Family name used by the theme after this face is loaded. */
  family: string;
  /** Same-origin `.woff2` URL, normally imported from a local asset by Vite. */
  src: string;
  /** CSS weight descriptor for a variable face. */
  weight?: string;
  style?: 'normal' | 'italic';
}

/**
 * Loads a same-origin, self-hosted variable font only when explicitly called
 * for the selected theme. Vite-emitted asset URLs keep exported prototypes offline.
 */
export async function loadVariableFont(
  asset: SelfHostedVariableFont,
  target: Document = document
): Promise<FontFace> {
  if (!asset.family.trim()) throw new TypeError('A font family name is required');
  const url = new URL(asset.src, target.baseURI);
  if (url.origin !== new URL(target.baseURI).origin || !url.pathname.endsWith('.woff2')) {
    throw new TypeError('Variable fonts must use a same-origin .woff2 asset URL');
  }
  const face = new FontFace(asset.family, `url(${JSON.stringify(url.href)})`, {
    display: 'swap',
    style: asset.style ?? 'normal',
    weight: asset.weight ?? '100 900',
  });
  await face.load();
  target.fonts.add(face);
  return face;
}
