# Chart math from `@texuli/charts`

`@protoyard/charts` is a thin consumer of Texuli's chart math
(`@texuli/charts/math`). Scales, shapes, layouts and downsampling are
re-exported unchanged so existing imports (`@protoyard/charts`,
`@protoyard/charts/scales`, …) keep working.

## What still lives here

**Chart palettes** (`@protoyard/charts/palette`) stay in Protoyard. They
derive categorical, sequential and diverging colors from theme tokens with
WCAG non-text contrast checks. Texuli's chart components use theme chart
roles directly; Protoyard prototypes keep this palette helper for
`charts-ui`.

## Subpaths

| Import | Source |
| --- | --- |
| `@protoyard/charts` | math re-exports + palette |
| `@protoyard/charts/scales` | `@texuli/charts/math` |
| `@protoyard/charts/shapes` | `@texuli/charts/math` |
| `@protoyard/charts/layout` | `@texuli/charts/math` |
| `@protoyard/charts/downsample` | `@texuli/charts/math` |
| `@protoyard/charts/palette` | local |

Extra Texuli math (for example `ordinalScale`, `pack`, `sunburst`) is also
available through the same subpaths.
