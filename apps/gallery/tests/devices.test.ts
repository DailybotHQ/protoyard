import { defaultDeviceFor, getDevice, resolveShell } from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import {
  clampDimension,
  DEVICES,
  defaultGalleryDevice,
  fitScale,
  frameFor,
  normalizeDeviceId,
  safePreviewUrl,
  withGalleryShellNone,
} from '../src/lib/devices';

describe('gallery devices (core catalog)', () => {
  it('exposes the core catalog entries', () => {
    expect(DEVICES.map((d) => d.id)).toEqual([
      'phone-pill',
      'phone-punch-hole',
      'tablet',
      'laptop-window',
      'desktop-window',
    ]);
    expect(DEVICES.every((d) => d.width > 0 && d.height > 0)).toBe(true);
  });

  it('maps registry viewport + platform to a catalog device', () => {
    expect(defaultGalleryDevice({ viewport: 'iphone', platform: 'mobile' })).toBe('phone-pill');
    expect(defaultGalleryDevice({ viewport: 'android', platform: 'mobile' })).toBe(
      'phone-punch-hole'
    );
    expect(defaultGalleryDevice({ viewport: 'desktop', platform: 'desktop' })).toBe(
      'laptop-window'
    );
    expect(
      defaultGalleryDevice({
        viewport: 'desktop',
        shell: 'phone',
        platform: 'mobile',
      })
    ).toBe(defaultDeviceFor(resolveShell('phone', 'mobile'), 'desktop'));
  });

  it('normalizes legacy viewport aliases used in compare URLs', () => {
    expect(normalizeDeviceId('iphone')).toBe('phone-pill');
    expect(normalizeDeviceId('android')).toBe('phone-punch-hole');
    expect(normalizeDeviceId('desktop')).toBe('laptop-window');
    expect(normalizeDeviceId('phone-pill')).toBe('phone-pill');
    expect(normalizeDeviceId('custom')).toBe('custom');
  });

  it('builds frame sizes from the catalog and supports rotation', () => {
    const portrait = frameFor('phone-pill');
    expect(portrait.width).toBe(getDevice('phone-pill')?.width);
    expect(portrait.framed).toBe(true);
    expect(portrait.spec?.cutout).toBe('pill');

    const landscape = frameFor('phone-pill', { orientation: 'landscape' });
    expect(landscape.width).toBe(portrait.height);
    expect(landscape.height).toBe(portrait.width);
    expect(landscape.orientation).toBe('landscape');

    const custom = frameFor('custom', { customWidth: 800, customHeight: 600 });
    expect(custom).toMatchObject({ width: 800, height: 600, framed: false, id: 'custom' });
  });

  it('keeps fitScale, clampDimension and safePreviewUrl', () => {
    expect(fitScale(640, 1280)).toBe(0.5);
    expect(fitScale(2000, 1280)).toBe(1);
    expect(clampDimension(100)).toBe(240);
    expect(safePreviewUrl('http://localhost:5173')).toBe('http://localhost:5173/');
    expect(safePreviewUrl('javascript:alert(1)')).toBeNull();
  });

  it('adds shell=none so the iframe does not double-frame', () => {
    expect(withGalleryShellNone('http://localhost:4173/app/')).toBe(
      'http://localhost:4173/app/?shell=none'
    );
    expect(withGalleryShellNone('/demos/bank/?scenario=active-customer')).toBe(
      '/demos/bank/?scenario=active-customer&shell=none'
    );
  });
});
