<script lang="ts">
import { Button, Input } from '@protoyard/ui';
import type { SimulatedMap as SimulatedMapComponent } from '@protoyard/views-ui/map';

/**
 * Latitude and longitude for a blueprint `geo` field. Binds `{ lat, lng }`
 * with the raw text of each box, so the entity service validates bounds and
 * a missing half with field-level messages; both boxes empty binds `null`.
 */
let {
  value = $bindable<unknown>(),
  label,
  error,
  disabled = false,
  id,
}: {
  value?: unknown;
  label: string;
  error?: string;
  disabled?: boolean;
  id?: string;
} = $props();

let pickerOpen = $state(false);
let MapPicker = $state<typeof SimulatedMapComponent | null>(null);
let pickerError = $state(false);

const part = (key: 'lat' | 'lng'): string => {
  if (!value || typeof value !== 'object') return '';
  const raw = (value as Record<string, unknown>)[key];
  return raw === null || raw === undefined ? '' : String(raw);
};

function set(key: 'lat' | 'lng', text: string) {
  const next = { lat: part('lat'), lng: part('lng'), [key]: text.trim() };
  value = next.lat === '' && next.lng === '' ? null : next;
}

async function openPicker() {
  if (MapPicker) {
    pickerOpen = !pickerOpen;
    return;
  }
  pickerError = false;
  try {
    const map = await import('@protoyard/views-ui/map');
    MapPicker = map.SimulatedMap;
    pickerOpen = true;
  } catch {
    pickerError = true;
  }
}

function pick(point: { lat: number; lng: number }) {
  value = { lat: String(point.lat), lng: String(point.lng) };
}
</script>

<div class="grid gap-2" data-testid="geo-field">
  <div class="grid grid-cols-2 gap-2">
    <Input
      {id}
      type="text"
      inputmode="decimal"
      value={part('lat')}
      {disabled}
      aria-label={`${label} latitude`}
      aria-invalid={error ? 'true' : undefined}
      placeholder="Latitude"
      oninput={(e) => set('lat', (e.currentTarget as HTMLInputElement).value)}
      data-testid="geo-field-lat"
    />
    <Input
      type="text"
      inputmode="decimal"
      value={part('lng')}
      {disabled}
      aria-label={`${label} longitude`}
      aria-invalid={error ? 'true' : undefined}
      placeholder="Longitude"
      oninput={(e) => set('lng', (e.currentTarget as HTMLInputElement).value)}
      data-testid="geo-field-lng"
    />
  </div>
  <div>
    <Button type="button" variant="outline" size="sm" {disabled} onclick={openPicker}>
      {pickerOpen ? 'Close map' : 'Pick on map'}
    </Button>
    {#if pickerError}
      <p class="mt-1 text-sm text-destructive" role="alert">The map could not be loaded. Try again.</p>
    {/if}
  </div>
  {#if pickerOpen && MapPicker}
    {@const point = value && typeof value === 'object' ? value as { lat?: unknown; lng?: unknown } : null}
    {@const lat = typeof point?.lat === 'number' ? point.lat : Number(point?.lat)}
    {@const lng = typeof point?.lng === 'number' ? point.lng : Number(point?.lng)}
    {@const validPoint = Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lng) && lng >= -180 && lng <= 180}
    <div class="grid gap-2" data-testid="geo-field-map-picker">
      <MapPicker
        label={`${label} location picker`}
        listLabel={`${label} location`}
        markers={validPoint ? [{ id: 'current-location', label: 'Current location', lat, lng }] : []}
        onPick={pick}
      />
      <p class="text-xs text-muted-foreground">Click the map or focus it and press Enter to place the point.</p>
    </div>
  {/if}
</div>
