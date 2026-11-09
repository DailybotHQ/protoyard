/**
 * The utility classes a locked prototype may use (PLAN_013, owner decision):
 * layout only, on the token scale. Everything else is refused (allow-list
 * semantics): color, background, border, ring, outline, radius, shadow,
 * typography, opacity, filters, transforms, transitions, animation, any
 * unknown utility, and any arbitrary value (`[...]` or `(...)`), even on an
 * allowed utility. Responsive and state variants (`md:`, `hover:`) are
 * allowed on allowed utilities.
 */

/** The spacing scale: whole and half steps, and `px`. */
const SCALE = String.raw`(?:\d+(?:\.5)?|px)`;
const FRACTION = String.raw`\d+\/\d+`;
const SIZE = `(?:${SCALE}|${FRACTION}|auto|full|screen|svw|lvw|dvw|svh|lvh|dvh|min|max|fit|prose|none|3xs|2xs|xs|sm|md|lg|xl|[2-7]xl|screen-(?:sm|md|lg|xl|2xl))`;
const ALIGN =
  '(?:start|end|center|baseline|stretch|normal|between|around|evenly|auto|safe|end-safe|center-safe)';

/**
 * Layout-only utilities Protoyard defines in `packages/themes/src/base.css`:
 * safe-area insets, the app frame height and the touch-target height.
 */
export const PROTOYARD_LAYOUT_UTILITIES: readonly string[] = [
  'pt-safe',
  'pb-safe',
  'pl-safe',
  'pr-safe',
  'px-safe',
  'h-app',
  'min-h-app',
  'max-h-app',
  'min-h-touch',
];

const ALLOWED: readonly RegExp[] = [
  // display
  /^(?:flex|inline-flex|grid|inline-grid|block|inline-block|inline|hidden|contents)$/,
  // flex direction, wrap, grow, shrink, basis
  /^flex-(?:row|row-reverse|col|col-reverse|wrap|wrap-reverse|nowrap|1|auto|initial|none)$/,
  /^(?:flex-)?(?:grow|shrink)(?:-0)?$/,
  new RegExp(`^basis-${SIZE}$`),
  // grid columns, rows, span, flow
  /^grid-(?:cols|rows)-(?:\d+|none|subgrid)$/,
  /^(?:col|row)-span-(?:\d+|full)$/,
  /^(?:col|row)-(?:start|end)-(?:\d+|auto)$/,
  /^(?:col|row)-auto$/,
  /^grid-flow-(?:row|col|dense|row-dense|col-dense)$/,
  /^auto-(?:cols|rows)-(?:auto|min|max|fr)$/,
  // align, justify, place, order
  new RegExp(`^(?:items|self|content|justify|justify-items|justify-self)-${ALIGN}$`),
  new RegExp(`^place-(?:content|items|self)-${ALIGN}$`),
  /^order-(?:\d+|first|last|none)$/,
  // gap, padding, margin, space
  new RegExp(`^gap(?:-[xy])?-${SCALE}$`),
  new RegExp(`^p[xytrblse]?-${SCALE}$`),
  new RegExp(`^-?m[xytrblse]?-(?:${SCALE}|auto)$`),
  new RegExp(`^-?space-[xy]-${SCALE}$`),
  /^space-[xy]-reverse$/,
  // width, height, min, max, size
  new RegExp(`^(?:w|h|min-w|max-w|min-h|max-h|size)-${SIZE}$`),
  // position and inset
  /^(?:static|relative|absolute|fixed|sticky)$/,
  new RegExp(
    `^-?(?:inset|inset-x|inset-y|top|right|bottom|left|start|end)-(?:${SCALE}|${FRACTION}|auto|full)$`
  ),
  // overflow, z (scale values only), screen-reader helpers, group/peer markers
  /^overflow(?:-[xy])?-(?:auto|hidden|clip|visible|scroll)$/,
  /^z-(?:0|10|20|30|40|50|auto)$/,
  /^(?:sr-only|not-sr-only)$/,
  /^(?:group|peer)(?:\/[\w-]+)?$/,
  // Text flow, not typography: alignment, wrapping, truncation (no size,
  // weight, family, color, leading or tracking).
  /^text-(?:left|center|right|justify|start|end)$/,
  /^(?:truncate|text-ellipsis|text-clip|text-wrap|text-nowrap|text-balance|text-pretty)$/,
  /^line-clamp-(?:\d+|none)$/,
  /^break-(?:normal|words|all|keep)$/,
  /^whitespace-(?:normal|nowrap|pre|pre-line|pre-wrap|break-spaces)$/,
  // Box and media layout
  /^(?:box-border|box-content|isolate|isolation-auto|visible|invisible|collapse)$/,
  /^aspect-(?:auto|square|video)$/,
  /^object-(?:contain|cover|fill|none|scale-down|center|top|bottom|left|right)$/,
  /^(?:table|table-row|table-cell|inline-table|flow-root|list-item)$/,
  /^pointer-events-(?:none|auto)$/,
  // Protoyard's layout tokens, exactly the `@utility` rules of
  // @protoyard/themes/base.css (a test keeps this list in step with it).
  ...PROTOYARD_LAYOUT_UTILITIES.map((name) => new RegExp(`^${name}$`)),
  // Tailwind's container-query marker (`@container`, `@container/name`).
  /^@container(?:\/[\w-]+)?$/,
];

/** Families that draw: color, borders, radius, shadow, type, effects, motion. */
const VISUAL =
  /^-?(?:bg|text|font|leading|tracking|border|divide|rounded|shadow|ring|outline|opacity|blur|brightness|contrast|grayscale|hue-rotate|invert|saturate|sepia|drop-shadow|backdrop|filter|transform|transition|duration|ease|delay|animate|scale|rotate|translate|skew|from|via|to|fill|stroke|decoration|underline|overline|line-through|no-underline|italic|not-italic|uppercase|lowercase|capitalize|normal-case|truncate|whitespace|break|antialiased|subpixel-antialiased|accent|caret|placeholder|mix-blend|bg-blend|indent|align|list|cursor|select|appearance)(?:-|$)/;

/** A variant prefix such as `md`, `hover`, `group-hover`, `dark` or `@lg`. */
const VARIANT = /^@?[a-z0-9-]+(?:\/[\w-]+)?$/;

export type UtilityVerdict = 'allowed' | 'arbitrary' | 'visual' | 'unknown';

/** Classifies one class token against the locked-mode allow-list. Pure. */
export function classifyUtility(token: string): UtilityVerdict {
  if (/[[\]()]/.test(token)) return 'arbitrary';
  const parts = token.split(':');
  const base = (parts.pop() ?? '').replace(/^!|!$/g, '');
  if (parts.some((variant) => !VARIANT.test(variant))) return 'unknown';
  if (ALLOWED.some((pattern) => pattern.test(base))) return 'allowed';
  return VISUAL.test(base) ? 'visual' : 'unknown';
}
