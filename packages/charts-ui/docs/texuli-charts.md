# Charts UI and Texuli

`@protoyard/charts-ui` keeps the Protoyard chart shells (titles, legends,
tables, `seriesFromRows`, money/percent formatters) that prototypes already
use. Chart **math** comes from `@protoyard/charts`, which re-exports
`@texuli/charts/math`.

Svelte mark components stay in this package for API stability (props such as
`unit`, `currency`, `xKind`, `seriesFromRows`). Texuli's own chart families
live under `@texuli/charts/{cartesian,part-whole,…}` for new work that wants
them directly.
