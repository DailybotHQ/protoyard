import type { DeckControlIcon } from '@protoyard/decks';

/** Small inline SVG strokes for the deck controls; no icon package enters the player bundle. */
export const DECK_ICON_PATHS: Readonly<Record<DeckControlIcon, readonly string[]>> = {
  'arrow-right': ['M5 12h14', 'm12 5 7 7-7 7'],
  'arrow-left': ['M19 12H5', 'm12 19-7-7 7-7'],
  'arrow-left-to-line': ['M7 5v14', 'M19 12H9', 'm13 8-4 4 4 4'],
  'arrow-right-to-line': ['M17 5v14', 'M5 12h10', 'm11 8 4 4-4 4'],
  'layout-grid': ['M3 3h8v8H3z', 'M13 3h8v8h-8z', 'M3 13h8v8H3z', 'M13 13h8v8h-8z'],
  presentation: ['M3 4h18v12H3z', 'M12 16v5', 'm8 21 4-5 4 5'],
  maximize: [
    'M8 3H5a2 2 0 0 0-2 2v3',
    'M16 3h3a2 2 0 0 1 2 2v3',
    'M8 21H5a2 2 0 0 1-2-2v-3',
    'M16 21h3a2 2 0 0 0 2-2v-3',
  ],
  minimize: [
    'M8 3v3a2 2 0 0 1-2 2H3',
    'M21 8h-3a2 2 0 0 1-2-2V3',
    'M3 16h3a2 2 0 0 1 2 2v3',
    'M16 21v-3a2 2 0 0 1 2-2h3',
  ],
  'eye-off': [
    'm3 3 18 18',
    'M10.6 10.6a2 2 0 0 0 2.8 2.8',
    'M9.9 5.2A10.8 10.8 0 0 1 12 5c5 0 8.3 4.2 9 7-.3 1.1-.9 2.2-1.8 3.2',
    'M6.2 6.2C4.1 7.5 2.7 9.7 2 12c.4 1.5 1.5 3.2 3.6 4.7A10.5 10.5 0 0 0 12 19',
  ],
  pointer: ['m5 3 14 10-7 1-3 7L5 3z'],
  keyboard: [
    'M2 6h20v12H2z',
    'M6 10h.01',
    'M10 10h.01',
    'M14 10h.01',
    'M18 10h.01',
    'M6 14h.01',
    'M10 14h4',
    'M18 14h.01',
  ],
  printer: [
    'M6 9V3h12v6',
    'M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2',
    'M6 14h12v7H6z',
    'M18 12h.01',
  ],
  link: [
    'M10 13a5 5 0 0 0 7.1 0l3-3A5 5 0 0 0 13 2.9l-1.7 1.7',
    'M14 11a5 5 0 0 0-7.1 0l-3 3A5 5 0 0 0 11 21.1l1.7-1.7',
  ],
  bug: [
    'M8 8h8a4 4 0 0 1 4 4v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-5a4 4 0 0 1 4-4z',
    'M10 8V6a2 2 0 1 1 4 0v2',
    'M2 12h4',
    'M18 12h4',
    'M2 18h4',
    'M18 18h4',
    'm7 3 2 3',
    'm17 3-2 3',
    'M12 12v6',
  ],
  list: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
};
