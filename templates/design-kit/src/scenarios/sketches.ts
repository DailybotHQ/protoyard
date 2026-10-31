import type { GenerateContext } from '@protoyard/core';

/**
 * A screen sketch in Texuli's canvas format (`CanvasDocument`), as plain data:
 * the world generator runs on every scenario load, so it never imports the lazy
 * canvas package. The service and the view validate it (`validateCanvas`).
 */
export interface SketchCanvas {
  format: 'texuli-canvas';
  formatVersion: 1;
  meta: { title: string };
  shapes: SketchShape[];
  connectors: {
    id: string;
    from: { shape: string };
    to: { shape: string };
    routing: 'elbow';
    endCap: 'arrow';
  }[];
}

type Box = { id: string; x: number; y: number; width: number; height: number };
export type SketchShape =
  | (Box & {
      type: 'rect';
      text?: string;
      radius?: number;
      paint?: { fill?: 'gray' | 'purple' | 'none'; stroke?: 'gray' | 'purple' | 'default' };
    })
  | (Box & { type: 'text'; text: string; fontSize: 's' | 'm' | 'l' | 'xl' })
  | (Box & { type: 'sticky'; text: string; color: 'yellow' })
  | (Box & { type: 'frame'; title: string; children: SketchShape[] });

const REVIEW_NOTES = [
  'Use the quiet button here: the page already has a primary action',
  'Check the badge contrast on the dark theme',
  'Cards wrap to one column under 640 px',
  'Field hints need the 12 px caption style',
  'Is this table a list on phones?',
  'Header actions collapse into a menu on phones',
];

/**
 * A settings-screen wireframe drawn with the kit's parts: a desktop frame with a
 * header, a sidebar, a form card and a button row, and review sticky notes, each
 * with a connector to the part it is about. The notes and their order come from
 * the scenario seed (`ctx.rng`), so every scenario load draws the same sketch.
 */
export function generateSettingsSketch(ctx: GenerateContext): SketchCanvas {
  const rng = ctx.rng.fork('design-kit:sketch');
  const parts: SketchShape[] = [
    {
      id: 'header',
      type: 'rect',
      x: 40,
      y: 80,
      width: 1200,
      height: 64,
      text: 'Header · logo, search, avatar',
      paint: { fill: 'gray', stroke: 'gray' },
    },
    {
      id: 'sidebar',
      type: 'rect',
      x: 40,
      y: 168,
      width: 240,
      height: 480,
      text: 'Sidebar · nav items',
      paint: { fill: 'gray', stroke: 'gray' },
    },
    {
      id: 'page-title',
      type: 'text',
      x: 320,
      y: 176,
      width: 600,
      height: 48,
      text: 'Workspace settings',
      fontSize: 'xl',
    },
    {
      id: 'form-card',
      type: 'rect',
      x: 320,
      y: 248,
      width: 640,
      height: 300,
      text: 'Card · name, email and role fields',
    },
    {
      id: 'badge',
      type: 'rect',
      x: 984,
      y: 248,
      width: 256,
      height: 48,
      text: 'Badge · Owner',
      radius: 24,
      paint: { fill: 'purple', stroke: 'purple' },
    },
    {
      id: 'buttons',
      type: 'rect',
      x: 320,
      y: 572,
      width: 640,
      height: 56,
      text: 'Buttons · Cancel (quiet), Save (primary)',
    },
  ];
  const targets = ['buttons', 'badge', 'form-card', 'form-card', 'sidebar', 'header'];
  const order = REVIEW_NOTES.map((_, index) => index);
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [order[i], order[j]] = [order[j] as number, order[i] as number];
  }
  const picked = order.slice(0, 3).sort((a, b) => a - b);
  const notes: SketchShape[] = picked.map((note, index) => ({
    id: `note-${index + 1}`,
    type: 'sticky',
    x: 1320,
    y: 80 + index * 200,
    width: 180,
    height: 180,
    text: REVIEW_NOTES[note] as string,
    color: 'yellow',
  }));
  return {
    format: 'texuli-canvas',
    formatVersion: 1,
    meta: { title: 'Settings screen' },
    shapes: [
      {
        id: 'desktop',
        type: 'frame',
        x: 0,
        y: 0,
        width: 1280,
        height: 680,
        title: 'Desktop · 1280 px',
        children: parts,
      },
      ...notes,
    ],
    connectors: picked.map((note, index) => ({
      id: `points-${index + 1}`,
      from: { shape: `note-${index + 1}` },
      to: { shape: targets[note] as string },
      routing: 'elbow',
      endCap: 'arrow',
    })),
  };
}
