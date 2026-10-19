import { type BlueprintField, deriveInputSchemas, parseBlueprint } from '@protoyard/blueprint';
import { parseInput, ValidationError } from '@protoyard/core';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { formatFieldValue } from '../src/format.ts';
import GeoFieldHarness from './fixtures/GeoFieldHarness.svelte';

const blueprint = parseBlueprint({
  formatVersion: 1,
  name: 'Stops',
  entities: [
    {
      name: 'stop',
      plural: 'stops',
      fields: [
        { name: 'label', kind: 'text', required: true },
        { name: 'position', kind: 'geo', region: 'harbor-bay' },
      ],
      titleField: 'label',
    },
  ],
  roles: [{ name: 'owner', permissions: { '*': ['*'] } }],
});
const stop = blueprint.entities[0]!;
const position = stop.fields[1] as BlueprintField;
const { create } = deriveInputSchemas(stop);

afterEach(() => cleanup());

const bound = () => JSON.parse(screen.getByTestId('geo-value').textContent ?? 'null');

describe('GeoField', () => {
  it('renders two labelled inputs with the current point', () => {
    render(GeoFieldHarness, { field: position, initial: { lat: -30.4, lng: -18.6 } });
    const lat = screen.getByLabelText('Position latitude') as HTMLInputElement;
    const lng = screen.getByLabelText('Position longitude') as HTMLInputElement;
    expect(lat.value).toBe('-30.4');
    expect(lng.value).toBe('-18.6');
    expect(lat.id).toBe('geo-under-test');
    expect(screen.getByRole('button', { name: 'Pick on map' })).toBeTruthy();
  });

  it('loads the offline map on demand and binds a picked point without removing the inputs', async () => {
    render(GeoFieldHarness, { field: position, initial: { lat: '-30', lng: '-18' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Pick on map' }));

    const region = await screen.findByRole('region', { name: /Position location picker/ });
    await fireEvent.keyDown(region, { key: 'Enter' });
    await waitFor(() =>
      expect(bound()).toEqual({ lat: expect.any(String), lng: expect.any(String) })
    );
    expect(Number(bound().lat)).toBeGreaterThan(-90);
    expect(Number(bound().lat)).toBeLessThan(90);
    expect(Number(bound().lng)).toBeGreaterThan(-180);
    expect(Number(bound().lng)).toBeLessThan(180);
    expect(screen.getByTestId('geo-field-lat')).toBeTruthy();
    expect(screen.getByTestId('geo-field-lng')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close map' })).toBeTruthy();
  });

  it('binds typed coordinates that the entity service validates', async () => {
    render(GeoFieldHarness, { field: position });
    expect(bound()).toBeNull();
    await fireEvent.input(screen.getByTestId('geo-field-lat'), {
      target: { value: ' -31.123456 ' },
    });
    expect(bound()).toEqual({ lat: '-31.123456', lng: '' });
    // Half a point is a field error, not a silent null.
    try {
      parseInput(create, { label: 'Gate', position: bound() });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).issues.position).toBe(
        'Position needs a latitude and a longitude'
      );
    }
    await fireEvent.input(screen.getByTestId('geo-field-lng'), { target: { value: '-18.5' } });
    expect(parseInput(create, { label: 'Gate', position: bound() }).position).toEqual({
      lat: -31.12346,
      lng: -18.5,
    });
  });

  it('binds null when both boxes are cleared, and flags out-of-range values', async () => {
    render(GeoFieldHarness, {
      field: position,
      initial: { lat: 1, lng: 2 },
      error: 'Position latitude must be between -90 and 90',
    });
    expect(screen.getByTestId('geo-field-lat').getAttribute('aria-invalid')).toBe('true');
    await fireEvent.input(screen.getByTestId('geo-field-lat'), { target: { value: '' } });
    await fireEvent.input(screen.getByTestId('geo-field-lng'), { target: { value: '' } });
    expect(bound()).toBeNull();
    expect(() => parseInput(create, { label: 'Gate', position: { lat: '95', lng: '0' } })).toThrow(
      /latitude must be between -90 and 90/
    );
  });

  it('formats points for lists and details', () => {
    expect(formatFieldValue(position, { lat: -30.4, lng: -18.60001 })).toBe('-30.40000, -18.60001');
    expect(formatFieldValue(position, null)).toBe('—');
  });
});
