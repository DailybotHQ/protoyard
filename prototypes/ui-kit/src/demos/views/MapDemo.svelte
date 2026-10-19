<script lang="ts">
import { type MapMarker, type MapRoute, SimulatedMap } from '@protoyard/views-ui/map';

let selected = $state<string | null>(null);
const markers: MapMarker[] = [
  { id: 'harbor', label: 'Harbor depot', lng: -18.6, lat: -31.1, tone: 'primary' },
  { id: 'market', label: 'Market Street', lng: -18.48, lat: -31.14, tone: 'success' },
  { id: 'station', label: 'Central station', lng: -18.42, lat: -30.98, tone: 'warning' },
];
const stops = markers.map(({ lng, lat }) => ({ lng, lat }));
const routes: MapRoute[] = [
  {
    id: 'route-1',
    label: 'Morning delivery',
    stops,
    progress: 0.6,
  },
];
</script>
<SimulatedMap {markers} {routes} bind:selected label="Fictional Port Meridian map" />
