import { describe, expect, it } from 'vitest';
import { avatarImage, avatarUrl, formatMessage, resolveChromeMessages } from '../src/index.ts';

/**
 * Untrusted-input guards of the renderer: persona avatars come from snapshots
 * and chrome messages from the manifest, so neither may smuggle a script URL,
 * markup or a prototype key.
 */

describe('renderer untrusted input', () => {
  it('avatarUrl and avatarImage give nothing for unsafe or unknown values (snapshots are untrusted)', () => {
    for (const bad of [
      undefined,
      null,
      '',
      42,
      { src: 'https://images.example.com/x.webp' },
      'av-000',
      'av-176',
      'AV-001',
      'javascript:alert(1)',
      'data:image/png;base64,AAAA',
      'http://example.com/a.png',
      '//example.com/a.png',
      '../a.png',
      'https://user:pass@images.example.com/x.webp',
      '/a"onerror="x.png',
    ]) {
      expect(avatarImage(bad), String(bad)).toEqual({});
      if (typeof bad === 'string' && !bad.includes('@')) {
        expect(avatarUrl(bad), bad).toBeUndefined();
      }
    }
    expect(avatarImage('av-001')).toEqual({
      src: './avatars/64/av-001.webp',
      srcset: './avatars/64/av-001.webp 1x, ./avatars/128/av-001.webp 2x',
    });
  });

  it('chrome messages reject unknown keys, empty or non-string values, over-long text and __proto__', () => {
    const bad: unknown[] = [
      { services: {} },
      { service: { notAllowedTitle: '' } },
      { service: { notAllowedTitle: 42 } },
      { service: { notAllowedTitle: 'x'.repeat(501) } },
      JSON.parse('{"__proto__":{"polluted":"yes"}}'),
      JSON.parse('{"service":{"__proto__":"x"}}'),
    ];
    for (const input of bad) {
      expect(() => resolveChromeMessages(input as never), JSON.stringify(input)).toThrow(TypeError);
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('formatMessage fills values as text and never interprets them', () => {
    expect(formatMessage('Hi {who}', {})).toBe('Hi {who}');
    expect(formatMessage('{x}', { x: '<img src=x onerror=alert(1)>' })).toBe(
      '<img src=x onerror=alert(1)>'
    );
    expect(formatMessage('{toString}', {})).toBe('{toString}');
  });
});
