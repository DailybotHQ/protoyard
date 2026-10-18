import { describe, expect, it } from 'vitest';
import {
  formatShortcut,
  isMacPlatform,
  isTypingTarget,
  type KeyLike,
  SHORTCUTS,
  shortcutFor,
} from '../src/lib/shortcuts.ts';

const key = (patch: Partial<KeyLike>): KeyLike => ({
  code: '',
  key: '',
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...patch,
});

describe('keyboard shortcuts', () => {
  it('uses ⌘ on macOS and Ctrl elsewhere for save and search', () => {
    expect(shortcutFor(key({ code: 'KeyS', metaKey: true }), { mac: true, typing: true })?.id).toBe(
      'save'
    );
    expect(
      shortcutFor(key({ code: 'KeyS', ctrlKey: true }), { mac: false, typing: true })?.id
    ).toBe('save');
    // The other platform's modifier does not count.
    expect(
      shortcutFor(key({ code: 'KeyS', ctrlKey: true }), { mac: true, typing: false })
    ).toBeUndefined();
    expect(
      shortcutFor(key({ code: 'KeyK', ctrlKey: true }), { mac: false, typing: false })?.id
    ).toBe('search');
  });

  it('matches letters by code, so ⌥N works although it types another character', () => {
    expect(
      shortcutFor(key({ code: 'KeyN', key: '˜', altKey: true }), { mac: true, typing: false })?.id
    ).toBe('new-document');
    expect(
      shortcutFor(key({ code: 'KeyN', key: 'N', altKey: true, shiftKey: true }), {
        mac: false,
        typing: false,
      })?.id
    ).toBe('new-folder');
    expect(shortcutFor(key({ code: 'KeyW', altKey: true }), { mac: false, typing: true })?.id).toBe(
      'close'
    );
    expect(shortcutFor(key({ code: 'KeyN' }), { mac: false, typing: false })).toBeUndefined();
  });

  it('never steals plain keys while typing', () => {
    const question = key({ key: '?', code: 'Slash', shiftKey: true });
    expect(shortcutFor(question, { mac: false, typing: false })?.id).toBe('help');
    expect(shortcutFor(question, { mac: false, typing: true })).toBeUndefined();
  });

  it('formats labels per platform and has one entry per action', () => {
    const byId = Object.fromEntries(SHORTCUTS.map((s) => [s.id, s]));
    expect(new Set(SHORTCUTS.map((s) => s.id)).size).toBe(SHORTCUTS.length);
    expect(formatShortcut(byId.save!, true)).toBe('⌘S');
    expect(formatShortcut(byId.save!, false)).toBe('Ctrl+S');
    expect(formatShortcut(byId['new-folder']!, true)).toBe('⌥⇧N');
    expect(formatShortcut(byId['toggle-sidebar']!, false)).toBe('Ctrl+\\');
    expect(formatShortcut(byId.help!, true)).toBe('?');
    expect(isMacPlatform('MacIntel')).toBe(true);
    expect(isMacPlatform('Win32')).toBe(false);
  });

  it('treats inputs, textareas and editable content as typing targets', () => {
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true);
    expect(isTypingTarget(document.createElement('input'))).toBe(true);
    expect(isTypingTarget(document.createElement('button'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
