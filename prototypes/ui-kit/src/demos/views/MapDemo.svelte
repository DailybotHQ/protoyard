<script lang="ts">
import { Button } from '@protoyard/ui';
import { PORT_MERIDIAN } from '@protoyard/views/map';
import { type MapMarker, type MapRoute, SimulatedMap } from '@protoyard/views-ui/map';

let selected = $state<string | null>(null);
let stress = $state(false);
const sample: MapMarker[] = [
  { id: 'harbor', label: 'Harbor depot', lng: -18.6, lat: -31.1, tone: 'primary' },
  { id: 'market', label: 'Market Street', lng: -18.48, lat: -31.14, tone: 'success' },
  { id: 'station', label: 'Central station', lng: -18.42, lat: -30.98, tone: 'warning' },
];
/**
 * 5,000 fictional stops spread over the basemap with a low-discrepancy
 * sequence: deterministic (no Math.random), even enough to form clusters.
 */
function manyPlaces(count: number): MapMarker[] {
  const [minLng, minLat, maxLng, maxLat] = PORT_MERIDIAN.bbox;
  const frac = (n: number) => n - Math.floor(n);
  const tones = ['primary', 'success', 'warning'] as const;
  return Array.from({ length: count }, (_, i) => ({
    id: `stop-${i + 1}`,
    label: `Stop ${i + 1}`,
    lng: minLng + frac((i + 1) * 0.6180339887) * (maxLng - minLng),
    lat: minLat + frac((i + 1) * 0.7548776662) * (maxLat - minLat),
    tone: tones[i % 3],
  }));
}
const markers = $derived(stress ? manyPlaces(5_000) : sample);
const routes: MapRoute[] = [
  {
    id: 'route-1',
    label: 'Morning delivery',
    stops: sample.map(({ lng, lat }) => ({ lng, lat })),
    progress: 0.6,
  },
];
</script>
<div class="space-y-3"><div class="flex items-center gap-3"><Button size="sm" variant="outline" aria-pressed={stress} onclick={() => { stress = !stress; selected = null; }}>{stress ? 'Show sample places' : 'Load 5,000 places'}</Button><span class="text-sm text-muted-foreground">{markers.length.toLocaleString('en')} places</span></div><SimulatedMap {markers} {routes} bind:selected label="Fictional Port Meridian map" /></div>
