# Charts UI from `@texuli/charts`

Every family subpath (`cartesian`, `part-whole`, `matrix`, `compact`, `canvas`,
`geo`, `flow`, `interaction`) re-exports Texuli chart components. Thin adapters
map Protoyard props where needed:

| Adapter | Mapping |
| --- | --- |
| Line/Bar/Area/Combo | `emptyMessage`/`description` → Texuli `description`; strip Protoyard-only series fields |
| ScatterChart | `series[]` → Texuli matrix `points[]` |
| Pie/Donut | default table `labels`; `height` → `size` |
| FunnelChart | `count` → `value`; from `@texuli/charts/flow` |
| RadialProgress | → Texuli `ProgressRing` |
| TileMap | → Texuli `GeoMap`; `WORLD_TILES`/`REGION_TILES` re-exported |
| Histogram | bins via `@texuli/charts/math` `bin` → BarChart |
| CalendarHeatmap | `calendarLayout` → HeatmapChart cells |

`seriesFromRows` and unit formatters stay in `compat/series.ts` for dashboards.
