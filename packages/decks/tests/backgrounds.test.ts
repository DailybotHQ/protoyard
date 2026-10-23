import { BUILTIN_THEMES, contrastRatio } from '@protoyard/themes';
import { loadLibraryTheme, THEME_LIBRARY_META } from '@protoyard/themes/library';
import { describe, expect, it } from 'vitest';
import { compositeOver, sampleGradient } from '../src/backgrounds/contrast.ts';
import {
  checkDeckMediaSrc,
  DECK_BACKGROUND_PRESET_IDS,
  DECK_TEXT_CONTRAST_MIN,
  type DeckBackground,
  type DeckBackgroundPalette,
  DeckBackgroundSchema,
  type ResolvedDeckBackground,
  resolveDeckBackground,
} from '../src/index.ts';
import { checkDeckStatic } from '../src/quality/index.ts';
import { safeParseDeck } from '../src/schema/index.ts';

const MEDIA_SPECS: DeckBackground[] = [
  { kind: 'image', src: 'assets/cover.webp' },
  { kind: 'image-full', src: 'assets/cover.webp', tone: 'light' },
  { kind: 'video', src: 'clips/intro.mp4' },
  { kind: 'video-full', src: 'clips/intro.webm', tone: 'light', overlay: 0.8 },
];

/** Everything text sits on, re-derived from the result (not from the resolver's own math). */
function surfacesUnderText(resolved: ResolvedDeckBackground): string[] {
  let behind: string[];
  if (resolved.media) behind = ['#000000', '#ffffff'];
  else if (resolved.gradient) behind = sampleGradient(resolved.gradient.stops, 8);
  else if (resolved.pattern) behind = [resolved.color, resolved.pattern.ink];
  else behind = [resolved.color];
  const overlay = resolved.overlay;
  return overlay
    ? behind.map((color) => compositeOver(color, overlay.color, overlay.alpha))
    : behind;
}

function assertReadable(resolved: ResolvedDeckBackground, label: string): void {
  for (const surface of surfacesUnderText(resolved)) {
    const ratio = contrastRatio(resolved.textColor, surface);
    expect(ratio, `${label}: ${resolved.textColor} on ${surface}`).toBeGreaterThanOrEqual(
      DECK_TEXT_CONTRAST_MIN
    );
  }
  expect(resolved.contrast).toBeGreaterThanOrEqual(DECK_TEXT_CONTRAST_MIN);
}

const modes = (theme: { light: unknown; dark: unknown }) =>
  [
    ['light', theme.light],
    ['dark', theme.dark],
  ] as const;

describe('text contrast on every background', () => {
  it('reaches AA for every preset and media spec, in all 6 built-in themes, light and dark', () => {
    expect(BUILTIN_THEMES).toHaveLength(6);
    for (const theme of BUILTIN_THEMES) {
      for (const [mode, palette] of modes(theme)) {
        for (const background of [...DECK_BACKGROUND_PRESET_IDS, ...MEDIA_SPECS]) {
          const label = `${theme.id}/${mode}/${typeof background === 'string' ? background : background.kind}`;
          assertReadable(
            resolveDeckBackground(background, palette as DeckBackgroundPalette),
            label
          );
        }
      }
    }
  });

  it('also holds for every library theme', async () => {
    const library = THEME_LIBRARY_META;
    expect(library.length).toBeGreaterThan(50);
    for (const meta of library) {
      const theme = await loadLibraryTheme(meta.id);
      for (const [mode, palette] of modes(theme)) {
        for (const id of DECK_BACKGROUND_PRESET_IDS) {
          assertReadable(
            resolveDeckBackground(id, palette as DeckBackgroundPalette),
            `${meta.id}/${mode}/${id}`
          );
        }
      }
    }
  });

  it('follows the site rule: media get light text over a dark scrim unless declared light', () => {
    const palette = BUILTIN_THEMES[0]?.light as DeckBackgroundPalette;
    const dark = resolveDeckBackground({ kind: 'image', src: 'assets/a.png' }, palette);
    expect(dark.textTone).toBe('light');
    expect(dark.textColor).toBe('#ffffff');
    expect(dark.overlay?.color).toBe('#000000');
    const light = resolveDeckBackground(
      { kind: 'image', src: 'assets/a.png', tone: 'light' },
      palette
    );
    expect(light.textTone).toBe('dark');
    expect(light.overlay?.color).toBe('#ffffff');
  });

  it('never lets an author weaken the scrim, only strengthen it', () => {
    const palette = BUILTIN_THEMES[1]?.dark as DeckBackgroundPalette;
    const minimum =
      resolveDeckBackground({ kind: 'video', src: 'v.mp4' }, palette).overlay?.alpha ?? 0;
    const weaker = resolveDeckBackground({ kind: 'video', src: 'v.mp4', overlay: 0 }, palette);
    expect(weaker.overlay?.alpha).toBe(minimum);
    const stronger = resolveDeckBackground({ kind: 'video', src: 'v.mp4', overlay: 0.85 }, palette);
    expect(stronger.overlay?.alpha).toBeGreaterThanOrEqual(0.85);
  });

  it('needs no scrim on plain theme backgrounds', () => {
    for (const theme of BUILTIN_THEMES) {
      for (const [, palette] of modes(theme)) {
        const solid = resolveDeckBackground('solid-color', palette as DeckBackgroundPalette);
        expect(solid.overlay).toBeNull();
        const inverse = resolveDeckBackground('solid-inverse', palette as DeckBackgroundPalette);
        expect(inverse.overlay).toBeNull();
        expect(inverse.textTone).not.toBe(solid.textTone);
      }
    }
  });
});

describe('resolved output', () => {
  const palette = BUILTIN_THEMES[2]?.light as DeckBackgroundPalette;

  it('marks video muted, looping, inline and autoplaying', () => {
    const video = resolveDeckBackground(
      { kind: 'video-full', src: 'clips/a.mp4', poster: 'assets/p.webp', position: 'top' },
      palette
    );
    expect(video.media).toEqual({
      type: 'video',
      src: 'clips/a.mp4',
      full: true,
      poster: 'assets/p.webp',
      fit: 'cover',
      position: 'top',
      muted: true,
      autoplay: true,
      loop: true,
      playsInline: true,
    });
  });

  it('builds CSS variables only from computed colors and numbers', () => {
    const safe =
      /^(#[0-9a-f]{6}|transparent|light|dark|[0-9.]+|linear-gradient\(\d+deg(, #[0-9a-f]{6})+\))$/;
    for (const background of [...DECK_BACKGROUND_PRESET_IDS, ...MEDIA_SPECS]) {
      const resolved = resolveDeckBackground(background, palette);
      for (const [name, value] of Object.entries(resolved.variables)) {
        expect(value, `${name}=${value}`).toMatch(safe);
      }
      // A media source is never put in CSS (no url()).
      expect(JSON.stringify(resolved.variables)).not.toContain('url(');
    }
  });

  it('falls back to solid-color for an unknown preset id, with a warning', () => {
    const resolved = resolveDeckBackground('gradient-rainbow', palette);
    expect(resolved.preset).toBe('solid-color');
    expect(resolved.warning).toMatch(/Unknown background "gradient-rainbow"/);
    expect(resolveDeckBackground(undefined, palette).preset).toBe('solid-color');
  });

  it('is deterministic', () => {
    for (const id of DECK_BACKGROUND_PRESET_IDS) {
      expect(resolveDeckBackground(id, palette)).toEqual(resolveDeckBackground(id, palette));
    }
  });
});

describe('media URL policy', () => {
  const PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

  it.each([
    ['assets/cover.webp', 'image'],
    ['./assets/cover.jpg', 'image'],
    ['clips/intro.mp4', 'video'],
    [PNG, 'image'],
    [
      'data:video/webm;base64,GkXfo0AgQoaBAUL3gQFC8oEEQvOBCEKCQAR3ZWJtQoeBAkKFgQIYU4BnQI0VSalmQCgq17FAAw9CQE2AQAZ3aGFtbXlXQUAGd2hhbW15RIlACECPQAAAAAAAFlSua0AxrkAu14EBY8WBAZyBACK1nEADdW5khkAFVl9WUDglhohAA1ZQOIOBAeBABrCBCLqBCB9DtnVAIueBAKNAHIEAAIAwAQCdASoIAAgAAUAmJaQAA3AA/vz0AAA=',
      'video',
    ],
    ['avatar:av-012', 'image'],
  ] as const)('accepts %s as %s', (src, kind) => {
    expect(checkDeckMediaSrc(src, kind)).toMatchObject({ ok: true, src });
  });

  it.each([
    ['https://example.com/a.png', 'image'],
    ['http://example.com/a.png', 'image'],
    ['//cdn.example.com/a.png', 'image'],
    ['javascript:alert(1)', 'image'],
    ['JaVaScRiPt:alert(1)', 'image'],
    [' javascript:alert(1)', 'image'],
    ['vbscript:msgbox(1)', 'image'],
    ['blob:https://example.com/123', 'image'],
    ['file:///etc/passwd', 'image'],
    ['data:text/html;base64,PHNjcmlwdD4=', 'image'],
    ['data:image/svg+xml;base64,PHN2Zz4=', 'image'],
    ['data:image/png,notbase64', 'image'],
    ['data:image/png;base64,iVBOR', 'video'],
    ['data:video/mp4;base64,AAAA', 'image'],
    ['../secrets.png', 'image'],
    ['assets/../../x.png', 'image'],
    ['assets//x.png', 'image'],
    ['/absolute.png', 'image'],
    ['assets\\x.png', 'image'],
    ['assets/logo.svg', 'image'],
    ['assets/x.png' + String.fromCharCode(0), 'image'],
    ['assets/' + String.fromCharCode(0x202e) + 'gnp.exe', 'image'],
    ['avatar:av-012', 'video'],
    ['avatar:../etc', 'image'],
    ['', 'image'],
  ] as const)('rejects %j as %s', (src, kind) => {
    expect(checkDeckMediaSrc(src, kind).ok).toBe(false);
  });

  it('bounds data: URIs and paths', () => {
    expect(checkDeckMediaSrc(`data:image/png;base64,${'A'.repeat(1_500_001)}`, 'image').ok).toBe(
      false
    );
    expect(checkDeckMediaSrc(`assets/${'a'.repeat(600)}.png`, 'image').ok).toBe(false);
    expect(checkDeckMediaSrc(42, 'image').ok).toBe(false);
  });
});

describe('DeckBackgroundSchema', () => {
  it('accepts preset ids and specs', () => {
    for (const id of DECK_BACKGROUND_PRESET_IDS) expect(DeckBackgroundSchema.parse(id)).toBe(id);
    for (const spec of MEDIA_SPECS) expect(DeckBackgroundSchema.safeParse(spec).success).toBe(true);
    expect(
      DeckBackgroundSchema.safeParse({ kind: 'gradient', gradient: 'dusk', angle: 90 }).success
    ).toBe(true);
    expect(DeckBackgroundSchema.safeParse({ kind: 'pattern', pattern: 'grid' }).success).toBe(true);
  });

  it('rejects iframes, unsafe media, unknown keys and an over-strong scrim', () => {
    const bad: unknown[] = [
      'iframe',
      { kind: 'iframe', src: 'https://example.com' },
      { kind: 'image', src: 'https://example.com/a.png' },
      { kind: 'video', src: 'javascript:alert(1)' },
      { kind: 'video', src: 'clips/a.mp4', poster: '//cdn.example.com/p.png' },
      { kind: 'image', src: 'assets/a.png', style: 'background:url(x)' },
      { kind: 'image', src: 'assets/a.png', overlay: 1 },
      { kind: 'solid', token: 'chart1' },
      { kind: 'gradient', gradient: 'rainbow' },
    ];
    for (const value of bad) {
      expect(DeckBackgroundSchema.safeParse(value).success, JSON.stringify(value)).toBe(false);
    }
  });
});

describe('slide backgrounds from older decks', () => {
  // Before media backgrounds, `slide.background` took any slug and an unknown one
  // rendered solid-color with a warning. Such decks (share links, Deck Studio
  // storage, user blueprints) must still open.
  const oldDeck = {
    style: {},
    slides: [
      {
        id: 'intro',
        layout: 'title-hero',
        background: 'gradient-rainbow',
        props: { title: 'Fictional launch' },
      },
      { id: 'known', layout: 'title-hero', background: 'solid-color', props: { title: 'Next' } },
    ],
  };

  it('parses, renders the default and warns in lint', () => {
    const parsed = safeParseDeck(oldDeck);
    expect(parsed.success).toBe(true);
    const deck = parsed.deck as NonNullable<typeof parsed.deck>;
    expect(deck.slides[0]?.background).toBe('gradient-rainbow');

    const resolved = resolveDeckBackground(deck.slides[0]?.background, BUILTIN_THEMES[0]!.light);
    expect(resolved.preset).toBe('solid-color');
    expect(resolved.warning).toMatch(/Unknown background "gradient-rainbow"/);

    const unknown = checkDeckStatic(deck).issues.filter(
      (issue) => issue.rule === 'unknown-background'
    );
    expect(unknown).toEqual([
      expect.objectContaining({
        severity: 'warning',
        slideId: 'intro',
        jsonPath: '$.slides[0].background',
      }),
    ]);
  });

  it('still refuses a background that is not a slug', () => {
    expect(
      safeParseDeck({
        ...oldDeck,
        slides: [{ ...oldDeck.slides[0], background: 'url(https://example.com/x.png)' }],
      }).success
    ).toBe(false);
  });
});

describe('pattern ink', () => {
  it('keeps the theme border as the line color when text reads on it (the built-ins)', () => {
    for (const theme of BUILTIN_THEMES) {
      for (const mode of ['light', 'dark'] as const) {
        const palette = theme[mode] as unknown as DeckBackgroundPalette;
        for (const preset of ['pattern-dots', 'pattern-grid'] as const) {
          const resolved = resolveDeckBackground(preset, palette);
          expect(resolved.pattern?.ink, `${theme.id}/${mode}/${preset}`).toBe(
            resolveDeckBackground('pattern-dots', palette).pattern?.ink
          );
          expect(resolved.overlay, `${theme.id}/${mode}`).toBeNull();
        }
      }
    }
    const violet = BUILTIN_THEMES[0]?.light as unknown as DeckBackgroundPalette;
    expect(resolveDeckBackground('pattern-grid', violet).pattern?.ink).toBe(violet.border);
  });

  it('fades a border as strong as the text until text reads on the lines, with no scrim', () => {
    const base = BUILTIN_THEMES[0]?.light as unknown as DeckBackgroundPalette;
    // Borders drawn for 3:1 non-text contrast, as dark as the body text.
    const palette = { ...base, border: base.foreground };
    const resolved = resolveDeckBackground('pattern-dots', palette);
    const ink = resolved.pattern?.ink as string;
    expect(ink).not.toBe(palette.border);
    expect(resolved.overlay).toBeNull();
    for (const sample of [resolved.color, ink]) {
      expect(contrastRatio(resolved.textColor, sample)).toBeGreaterThanOrEqual(
        DECK_TEXT_CONTRAST_MIN
      );
    }
    // The fade is the strongest that still reads: one step darker would not.
    expect(ink).not.toBe(resolved.color);
  });
});
