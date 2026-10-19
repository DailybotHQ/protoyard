<script lang="ts">
import { Input } from '@protoyard/ui';

/**
 * Latitude and longitude for a blueprint `geo` field. Binds `{ lat, lng }`
 * with the raw text of each box, so the entity service validates bounds and
 * a missing half with field-level messages; both boxes empty binds `null`.
 * Coordinates are typed in: there is no map picker until a map view exists.
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

const part = (key: 'lat' | 'lng'): string => {
  if (!value || typeof value !== 'object') return '';
  const raw = (value as Record<string, unknown>)[key];
  return raw === null || raw === undefined ? '' : String(raw);
};

function set(key: 'lat' | 'lng', text: string) {
  const next = { lat: part('lat'), lng: part('lng'), [key]: text.trim() };
  value = next.lat === '' && next.lng === '' ? null : next;
}
</script>

<div class="grid grid-cols-2 gap-2" data-testid="geo-field">
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
