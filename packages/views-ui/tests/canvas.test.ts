import { type CanvasBoardData, generateCanvasBoard } from '@protoyard/views/scenarios';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type CanvasDocument, CanvasView, validateCanvas } from '../src/canvas/index.ts';

afterEach(cleanup);

const ctx = (seed = 1, density = 'typical') =>
  ({ scenario: { id: 'canvas-test', seed, density } }) as never;
const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

function mount(current: unknown, props: Record<string, unknown> = {}) {
  return render(CanvasView, { query: { current, loading: false, error: undefined }, ...props });
}

/** The world position of a shape in a saved canvas (frames hold their notes as children). */
function find(doc: CanvasDocument, id: string): { x: number; y: number } | undefined {
  const walk = (
    shapes: readonly CanvasDocument['shapes'][number][]
  ): { x: number; y: number } | undefined => {
    for (const shape of shapes) {
      if (shape.id === id && 'x' in shape) return { x: shape.x, y: shape.y };
      if ('children' in shape && Array.isArray(shape.children)) {
        const hit = walk(shape.children as CanvasDocument['shapes'][number][]);
        if (hit) return hit;
      }
    }
    return undefined;
  };
  return walk(doc.shapes);
}

async function moveRight(name: string) {
  const note = screen.getByRole('img', { name });
  note.focus();
  await fireEvent.keyDown(note, { key: 'ArrowRight' });
  await tick();
}

describe('views planning board (scenario generator)', () => {
  it('is a valid Texuli canvas at every level (untrusted tier)', () => {
    for (const level of ['empty', 'typical', 'dense', 'edge'] as const) {
      const checked = validateCanvas(generateCanvasBoard(ctx(), { level }));
      expect(checked.ok, `${level}: ${JSON.stringify(checked.issues[0])}`).toBe(true);
    }
    const dense = generateCanvasBoard(ctx(), { level: 'dense' });
    const notes = dense.shapes.flatMap((shape) => ('children' in shape ? shape.children : []));
    expect(notes).toHaveLength(1500);
  });

  it('is deterministic per seed and blank when the scenario is empty', () => {
    expect(generateCanvasBoard(ctx(4))).toEqual(generateCanvasBoard(ctx(4)));
    expect(generateCanvasBoard(ctx(4))).not.toEqual(generateCanvasBoard(ctx(5)));
    const empty = generateCanvasBoard(ctx(1, 'empty'));
    expect([empty.shapes, empty.connectors]).toEqual([[], []]);
  });
});

describe('CanvasView (Texuli canvas host adapter)', () => {
  it('paints the board as an accessible application: frames, named notes and a shape tree', async () => {
    mount(generateCanvasBoard(ctx()));
    await tick();
    expect(screen.getByRole('application', { name: /Launch plan/ })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Interview three pilot teams' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Doing' })).toBeTruthy();
    expect(screen.getAllByRole('img').length).toBeGreaterThan(12);
    expect(screen.getByRole('tree', { name: 'Shapes' })).toBeTruthy();
  });

  it('saves a keyboard move through the service, and keeps undo when the save comes back', async () => {
    const doc = generateCanvasBoard(ctx());
    const before = find(doc as unknown as CanvasDocument, 'ideas-1');
    const calls: CanvasDocument[] = [];
    const view = mount(doc, {
      onChange: (canvas: CanvasDocument) => {
        calls.push(canvas);
        return true;
      },
    });
    await tick();
    const first = (doc.shapes[1] as { children: { id: string; text: string }[] }).children[0];
    await moveRight(String(first?.text));
    expect(calls).toHaveLength(1);
    const moved = find(calls[0] as CanvasDocument, 'ideas-1');
    expect(moved?.x).toBeGreaterThan(before?.x ?? 0);
    // The stored copy comes back through the query: the editor keeps its history.
    await view.rerender({
      query: { current: structuredClone(calls[0]), loading: false, error: undefined },
    });
    await tick();
    const surface = screen.getByRole('application');
    await fireEvent.keyDown(screen.getByRole('img', { name: String(first?.text) }), {
      key: 'z',
      ctrlKey: true,
    });
    await fireEvent.keyDown(surface, { key: 'z', ctrlKey: true });
    await waitFor(() => expect(calls.length).toBeGreaterThan(1));
    expect(find(calls.at(-1) as CanvasDocument, 'ideas-1')).toEqual(before);
  });

  it('puts the stored canvas back when the service refuses the edit', async () => {
    const doc = generateCanvasBoard(ctx());
    const view = mount(doc, { onChange: () => false });
    await tick();
    const first = (doc.shapes[1] as { children: { id: string; text: string }[] }).children[0];
    const x = () =>
      view.container.querySelector(`[data-tx-shape="${first?.id}"] rect`)?.getAttribute('x');
    const before = x();
    await moveRight(String(first?.text));
    await waitFor(() => expect(x()).toBe(before));
  });

  it('is read-only without a service: no import, and keys move nothing', async () => {
    const doc = generateCanvasBoard(ctx());
    const view = mount(doc);
    await tick();
    expect(screen.queryByRole('button', { name: 'Import JSON' })).toBeNull();
    const first = (doc.shapes[1] as { children: { id: string; text: string }[] }).children[0];
    const x = () =>
      view.container.querySelector(`[data-tx-shape="${first?.id}"] rect`)?.getAttribute('x');
    const before = x();
    await moveRight(String(first?.text));
    expect(x()).toBe(before);
  });

  it('refuses a stored canvas that is not valid at the untrusted tier', async () => {
    const bad = generateCanvasBoard(ctx()) as unknown as Record<string, unknown>;
    (bad.shapes as Record<string, unknown>[]).push({
      id: 'x1',
      type: 'sticky',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      text: 'bad',
      color: 'url(javascript:alert(1))',
    });
    const { container } = mount(bad);
    await tick();
    expect(screen.getByRole('alert').textContent).toMatch(/could not be opened/);
    expect(container.querySelector('[role="application"]')).toBeNull();
  });

  it('downloads an SVG whose text is escaped, never markup', async () => {
    let blob: Blob | undefined;
    const create = vi.spyOn(URL, 'createObjectURL').mockImplementation((value) => {
      blob = value as Blob;
      return 'blob:canvas';
    });
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const doc: CanvasBoardData = {
      ...generateCanvasBoard(ctx(1, 'empty')),
      shapes: [
        {
          id: 'n1',
          type: 'sticky',
          x: 0,
          y: 0,
          width: 160,
          height: 160,
          text: '<script>alert(1)</script>',
          color: 'yellow',
        },
      ],
    };
    mount(doc);
    await tick();
    await fireEvent.click(screen.getByRole('button', { name: 'Download SVG' }));
    const svg = await (blob as Blob).text();
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).not.toContain('<script');
    create.mockRestore();
    revoke.mockRestore();
    click.mockRestore();
  });

  it('imports a canvas JSON file through the untrusted loader, refusing an invalid one', async () => {
    const calls: CanvasDocument[] = [];
    const { container } = mount(generateCanvasBoard(ctx()), {
      onChange: (canvas: CanvasDocument) => {
        calls.push(canvas);
        return true;
      },
    });
    await tick();
    await fireEvent.click(screen.getByRole('button', { name: 'Import JSON' }));
    const input = () =>
      container.querySelector<HTMLInputElement>('input[type="file"]') as HTMLInputElement;
    await fireEvent.change(input(), {
      target: {
        files: [new File(['{"format":"nope"}'], 'bad.json', { type: 'application/json' })],
      },
    });
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(calls).toHaveLength(0);
    const next = generateCanvasBoard(ctx(), { level: 'edge' });
    await fireEvent.change(input(), {
      target: {
        files: [new File([JSON.stringify(next)], 'edge.json', { type: 'application/json' })],
      },
    });
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(find(calls[0] as CanvasDocument, 'parked-1')).toBeTruthy();
  });
});
