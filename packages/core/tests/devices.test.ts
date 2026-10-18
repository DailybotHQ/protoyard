import { describe, expect, it } from 'vitest';
import {
  DEVICE_IDS,
  DEVICES,
  DeviceSpecSchema,
  defaultDeviceFor,
  deviceFitsShell,
  fitScale,
  getDevice,
  orient,
  rotate,
  safeAreaOf,
} from '../src/index.ts';

describe('device catalog', () => {
  it('has unique ids that match the id list, and every entry parses', () => {
    const ids = DEVICES.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...DEVICE_IDS].sort());
    for (const device of DEVICES) expect(DeviceSpecSchema.parse(device)).toEqual(device);
  });

  it('has positive sizes and non-negative insets in both orientations', () => {
    for (const device of DEVICES) {
      expect(device.width, device.id).toBeGreaterThan(0);
      expect(device.height, device.id).toBeGreaterThan(0);
      expect(device.cornerRadius, device.id).toBeGreaterThanOrEqual(0);
      for (const insets of [device.safeArea.portrait, device.safeArea.landscape]) {
        for (const value of Object.values(insets)) expect(value).toBeGreaterThanOrEqual(0);
        expect(insets.top + insets.bottom).toBeLessThan(device.height);
        expect(insets.left + insets.right).toBeLessThan(device.width);
      }
      expect(device.statusBar.height).toBeGreaterThanOrEqual(0);
      expect(device.homeIndicator.height).toBeGreaterThanOrEqual(0);
    }
  });

  it('uses brand-neutral labels only', () => {
    const marks =
      /iphone|ipad|android|pixel|galaxy|apple|google|samsung|ios|macos|windows|macbook/i;
    for (const device of DEVICES) {
      expect(device.label, device.id).not.toMatch(marks);
      expect(device.id).not.toMatch(marks);
    }
  });

  it('is deeply frozen', () => {
    const phone = getDevice('phone-pill');
    expect(phone).toBeDefined();
    expect(Object.isFrozen(DEVICES)).toBe(true);
    expect(Object.isFrozen(phone)).toBe(true);
    expect(Object.isFrozen(phone?.safeArea.portrait)).toBe(true);
  });

  it('getDevice returns undefined for unknown or hostile ids', () => {
    expect(getDevice('tablet')?.kind).toBe('tablet');
    expect(getDevice('nope')).toBeUndefined();
    expect(getDevice('__proto__')).toBeUndefined();
  });

  it('rotate() swaps dimensions and insets without mutating the catalog', () => {
    const phone = getDevice('phone-pill');
    if (!phone) throw new Error('missing phone-pill');
    const turned = rotate(phone);
    expect(turned).not.toBe(phone);
    expect(turned.orientation).toBe('landscape');
    expect([turned.width, turned.height]).toEqual([phone.height, phone.width]);
    expect(safeAreaOf(phone)).toEqual(phone.safeArea.portrait);
    expect(safeAreaOf(turned)).toEqual(phone.safeArea.landscape);
    expect(safeAreaOf(turned).left).toBeGreaterThan(0);
    expect(rotate(turned)).toEqual(phone);
    expect(phone.orientation).toBe('portrait');
    expect(DeviceSpecSchema.parse(turned)).toEqual(turned);
  });

  it('rotate() leaves non-rotatable windows unchanged; orient() is idempotent', () => {
    const laptop = getDevice('laptop-window');
    const tablet = getDevice('tablet');
    if (!laptop || !tablet) throw new Error('missing catalog entries');
    expect(rotate(laptop)).toBe(laptop);
    expect(orient(laptop, 'portrait')).toBe(laptop);
    expect(orient(tablet, 'portrait')).toBe(tablet);
    expect(orient(tablet, 'landscape').width).toBe(tablet.height);
  });

  it('fitScale never upscales and tolerates bad input', () => {
    expect(fitScale(800, 400)).toBe(1);
    expect(fitScale(200, 400)).toBe(0.5);
    expect(fitScale(0, 400)).toBe(1);
    expect(fitScale(Number.NaN, 400)).toBe(1);
    expect(fitScale(200, 0)).toBe(1);
  });

  it('defaultDeviceFor always returns a device that fits the shell', () => {
    const shells = [
      'none',
      'phone',
      'tablet',
      'desktop-window',
      'browser',
      'widget-host',
      'extension-popup',
      'side-panel',
    ] as const;
    const viewports = ['desktop', 'tablet', 'iphone', 'android', 'custom'] as const;
    for (const shell of shells) {
      for (const viewport of viewports) {
        expect(
          deviceFitsShell(defaultDeviceFor(shell, viewport), shell),
          `${shell}/${viewport}`
        ).toBe(true);
      }
    }
    expect(defaultDeviceFor('phone', 'android')).toBe('phone-punch-hole');
    expect(defaultDeviceFor('phone', 'desktop')).toBe('phone-pill');
    expect(defaultDeviceFor('none', 'tablet')).toBe('tablet');
    expect(defaultDeviceFor('desktop-window', 'iphone')).toBe('laptop-window');
  });

  it('deviceFitsShell matches device kinds to shells and rejects unknown ids', () => {
    expect(deviceFitsShell('phone-pill', 'phone')).toBe(true);
    expect(deviceFitsShell('phone-pill', 'tablet')).toBe(false);
    expect(deviceFitsShell('phone-pill', 'desktop-window')).toBe(false);
    expect(deviceFitsShell('desktop-window', 'browser')).toBe(true);
    expect(deviceFitsShell('tablet', 'none')).toBe(true);
    expect(deviceFitsShell('nope', 'none')).toBe(false);
  });
});
