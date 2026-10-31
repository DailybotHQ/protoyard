import { countFor, type ViewsCtx, type ViewsLevel, viewsLevel, viewsRng } from './shared.ts';

/**
 * A board in Texuli's canvas format (`@texuli/canvas/model`
 * `CanvasDocument`), as plain data: this package does not import
 * `@texuli/canvas`, and `@protoyard/views-ui/canvas` validates it
 * (`validateCanvas`, untrusted) before it paints.
 */
export interface CanvasBoardData {
  format: 'texuli-canvas';
  formatVersion: 1;
  meta: { title: string };
  shapes: CanvasShapeData[];
  connectors: CanvasConnectorData[];
}

/** The subset of canvas shapes this generator emits. */
export type CanvasShapeData =
  | {
      id: string;
      type: 'sticky';
      x: number;
      y: number;
      width: number;
      height: number;
      text: string;
      color: CanvasColorName;
      rotation?: number;
      locked?: boolean;
    }
  | {
      id: string;
      type: 'rect' | 'ellipse' | 'diamond';
      x: number;
      y: number;
      width: number;
      height: number;
      text?: string;
    }
  | {
      id: string;
      type: 'text';
      x: number;
      y: number;
      width: number;
      height: number;
      text: string;
      fontSize: 's' | 'm' | 'l' | 'xl';
    }
  | {
      id: string;
      type: 'frame';
      x: number;
      y: number;
      width: number;
      height: number;
      title: string;
      children: CanvasShapeData[];
    };

export interface CanvasConnectorData {
  id: string;
  from: { shape: string } | { x: number; y: number };
  to: { shape: string } | { x: number; y: number };
  routing?: 'straight' | 'elbow' | 'curved';
  endCap?: 'none' | 'arrow' | 'dot';
  text?: string;
}

/** Texuli's closed palette (`CANVAS_COLORS`). */
export type CanvasColorName =
  | 'default'
  | 'gray'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'teal'
  | 'blue'
  | 'purple'
  | 'pink';

export interface CanvasBoardOptions {
  level?: ViewsLevel;
  title?: string;
}

const COLUMNS = [
  { key: 'ideas', title: 'Ideas', color: 'yellow' },
  { key: 'doing', title: 'Doing', color: 'blue' },
  { key: 'done', title: 'Done', color: 'green' },
] as const;
const NOTES = [
  'Interview three pilot teams',
  'Sketch the onboarding path',
  'Price the starter plan',
  'Draft the launch email',
  'Map the support handoff',
  'Pick the beta cohort',
  'Write the FAQ',
  'Test the invite flow',
  'Plan the webinar',
  'Name the release',
  'Review the analytics events',
  'Record the demo video',
];
const NOTE = 160;
const GAP = 24;
const FRAME_PAD = 48;

/**
 * A fictional launch-planning board: three frames (Ideas, Doing, Done) of
 * sticky notes, a title, and connectors from each note in Doing to the
 * note it unblocks in Done. Levels: `empty` (a blank canvas), `typical`
 * (12 notes), `dense` (1,500 notes, for the editor's culling and minimap)
 * and `edge` (nested frames, a rotated and a locked note, a long note, a
 * curved connector to a free point and one between frames).
 */
export function generateCanvasBoard(
  ctx: ViewsCtx,
  options: CanvasBoardOptions = {}
): CanvasBoardData {
  const level = viewsLevel(ctx, 'canvas', options.level);
  const count = countFor(level, [0, 12, 1500, 6]);
  const title = options.title ?? 'Launch plan';
  const board: CanvasBoardData = {
    format: 'texuli-canvas',
    formatVersion: 1,
    meta: { title },
    shapes: [],
    connectors: [],
  };
  if (count === 0) return board;
  const rng = viewsRng(ctx, 'canvas');
  // Notes in a seeded order, dealt round-robin from a seeded column, so boards differ per seed.
  const order = [...NOTES];
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [order[i], order[j]] = [order[j] as string, order[i] as string];
  }
  const start = rng.int(0, COLUMNS.length - 1);
  const perColumn = COLUMNS.map(() => [] as string[]);
  for (let i = 0; i < count; i++) {
    const base = order[i % order.length] as string;
    const text = i < NOTES.length ? base : `${base} ${Math.floor(i / NOTES.length) + 1}`;
    (perColumn[(start + i) % COLUMNS.length] as string[]).push(text);
  }
  const across = count > 60 ? 10 : 2;
  const frameWidth = FRAME_PAD * 2 + across * NOTE + (across - 1) * GAP;
  let top = 0;
  board.shapes.push({
    id: 'board-title',
    type: 'text',
    x: 0,
    y: top,
    width: frameWidth * COLUMNS.length,
    height: 48,
    text: title,
    fontSize: 'xl',
  });
  top += 96;
  const ids = COLUMNS.map(() => [] as string[]);
  COLUMNS.forEach((column, c) => {
    const notes = perColumn[c] as string[];
    const rows = Math.max(1, Math.ceil(notes.length / across));
    const x0 = c * (frameWidth + GAP * 2);
    const children: CanvasShapeData[] = notes.map((text, n) => {
      const id = `${column.key}-${n + 1}`;
      (ids[c] as string[]).push(id);
      return {
        id,
        type: 'sticky',
        x: x0 + FRAME_PAD + (n % across) * (NOTE + GAP),
        y: top + FRAME_PAD + Math.floor(n / across) * (NOTE + GAP),
        width: NOTE,
        height: NOTE,
        text,
        color: column.color,
      };
    });
    board.shapes.push({
      id: `frame-${column.key}`,
      type: 'frame',
      x: x0,
      y: top,
      width: frameWidth,
      height: FRAME_PAD * 2 + rows * NOTE + (rows - 1) * GAP,
      title: column.title,
      children,
    });
  });
  // Doing → Done: each in-progress note unblocks the done note in its slot.
  const doing = ids[1] as string[];
  const done = ids[2] as string[];
  for (let i = 0; i < Math.min(doing.length, done.length, 40); i++) {
    board.connectors.push({
      id: `link-${i + 1}`,
      from: { shape: doing[i] as string },
      to: { shape: done[i] as string },
      routing: 'elbow',
      endCap: 'arrow',
    });
  }

  if (level === 'edge') {
    const ideas = board.shapes.find((shape) => shape.id === 'frame-ideas');
    if (ideas?.type === 'frame') {
      const first = ideas.children[0];
      if (first?.type === 'sticky') {
        first.text =
          'Interview three pilot teams, then write down every question they asked twice, because the questions people repeat are the ones the product has not answered yet';
        first.rotation = 8;
      }
      const second = ideas.children[1];
      if (second?.type === 'sticky') second.locked = true;
      ideas.children.push({
        id: 'frame-parking',
        type: 'frame',
        x: ideas.x + FRAME_PAD,
        y: ideas.y + ideas.height + GAP,
        width: NOTE + FRAME_PAD * 2,
        height: NOTE + FRAME_PAD * 2,
        title: 'Parking lot',
        children: [
          {
            id: 'parked-1',
            type: 'diamond',
            x: ideas.x + FRAME_PAD * 2,
            y: ideas.y + ideas.height + GAP + FRAME_PAD,
            width: NOTE,
            height: NOTE,
            text: 'Later?',
          },
        ],
      });
      ideas.height += NOTE + FRAME_PAD * 2 + GAP * 2;
    }
    board.connectors.push(
      {
        id: 'to-nowhere',
        from: { shape: 'parked-1' },
        to: { x: -400, y: 900 },
        routing: 'curved',
        endCap: 'dot',
        text: 'Not decided',
      },
      {
        id: 'frame-to-frame',
        from: { shape: 'frame-ideas' },
        to: { shape: 'frame-done' },
        routing: 'straight',
        endCap: 'arrow',
      }
    );
  }
  return board;
}
