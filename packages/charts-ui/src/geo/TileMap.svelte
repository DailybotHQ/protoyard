<script lang="ts">
import { type ValueUnit, valueFormatter } from '../cartesian/model.ts';
import type { PlotSeries } from '../interaction/model.ts';
import MatrixFrame from '../matrix/MatrixFrame.svelte';
import { type Tile, WORLD_TILES } from './layouts.ts';
import TilePlot from './TilePlot.svelte';

type Props = {
  title: string;
  description?: string;
  summary?: string;
  /** Values by tile id; tiles without one are "no data". */
  data: Readonly<Record<string, number | null>>;
  /** The tile grid (default `WORLD_TILES`; `REGION_TILES` is fictional). */
  layout?: readonly Tile[];
  unit?: ValueUnit;
  currency?: string;
  height?: number;
  loading?: boolean;
  error?: string | null;
  onretry?: () => unknown;
  emptyMessage?: string;
  onselect?: (tile: Tile, value: number | null) => void;
};

let {
  title,
  description,
  summary,
  data,
  layout = WORLD_TILES,
  unit = 'number',
  currency,
  height = 260,
  loading = false,
  error = null,
  onretry,
  emptyMessage,
  onselect,
}: Props = $props();

const format = $derived(valueFormatter({ unit, ...(currency ? { currency } : {}) }));
const tileValue = (id: string): number | null => {
  const v = Object.hasOwn(data, id) ? data[id] : null;
  return v === undefined || v === null || !Number.isFinite(v) ? null : v;
};
const finite = $derived(layout.map((t) => tileValue(t.id)).filter((v): v is number => v !== null));
const min = $derived(finite.length ? Math.min(...finite) : 0);
const max = $derived(finite.length ? Math.max(...finite) : 0);
const text = $derived(
  summary ??
    `${title}: highest in ${
      [...layout]
        .filter((t) => tileValue(t.id) !== null)
        .sort((a, b) => (tileValue(b.id) as number) - (tileValue(a.id) as number))
        .slice(0, 3)
        .map((t) => `${t.label} (${format(tileValue(t.id))})`)
        .join(', ') || 'no region'
    }.`
);
const tableSeries = $derived<PlotSeries[]>([
  {
    id: 'value',
    label: 'Value',
    points: layout.map((t) => ({ x: 0, y: 0, xValue: t.label, yValue: tileValue(t.id) })),
  },
]);
</script>

<MatrixFrame
  {title}
  {description}
  summary={text}
  {height}
  {loading}
  {error}
  {onretry}
  empty={!loading && !error && finite.length === 0 ? (emptyMessage ?? true) : false}
  {tableSeries}
  formatters={{ x: (v) => String(v), y: (v) => format(v) }}
  xHeader="Region"
  ramp={{ min, max, format: (v) => format(v), emptyLabel: layout.some((t) => tileValue(t.id) === null) ? 'No data' : undefined }}
>
  {#snippet plot(size)}
    <TilePlot label={title} {layout} {tileValue} width={size.width} height={size.height} {format} {onselect} />
  {/snippet}
</MatrixFrame>
