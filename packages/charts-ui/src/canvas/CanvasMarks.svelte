<script lang="ts">
import { untrack } from 'svelte';
import { getChartFrameContext } from '../frame/context.ts';
import {
  type CanvasDots,
  type CanvasLine,
  type PixelPoint,
  reduceForPixels,
  resolveColor,
} from './model.ts';

type Props = {
  width: number;
  height: number;
  lines?: readonly CanvasLine[];
  dots?: readonly CanvasDots[];
};

let { width, height, lines = [], dots = [] }: Props = $props();

let canvas = $state<HTMLCanvasElement | null>(null);
let frame: number | ReturnType<typeof setTimeout> | undefined;
const chart = getChartFrameContext();

const schedule = (fn: () => void) =>
  typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(fn, 0);
const cancel = (id: typeof frame) => {
  if (id === undefined) return;
  if (typeof cancelAnimationFrame === 'function' && typeof id === 'number')
    cancelAnimationFrame(id);
  else clearTimeout(id as ReturnType<typeof setTimeout>);
};

function draw() {
  const el = canvas;
  const ctx = el?.getContext('2d');
  if (!el || !ctx) return;
  const dpr = typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1;
  el.width = Math.round(width * dpr);
  el.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const style = getComputedStyle(el);
  const color = (c: string) => resolveColor(c, (name) => style.getPropertyValue(name));

  for (const source of lines) {
    // Thin to what each pixel column can show (lazy with this component, off the chart's own chunk).
    const reduced = reduceForPixels(source.points, width);
    const line = {
      ...source,
      points: reduced,
      area: source.fill ? reduced.map((p) => p.y0 ?? height) : undefined,
    };
    const stroke = color(line.color);
    if (line.area) {
      // Each defined run is its own filled shape down to its baseline.
      ctx.globalAlpha = line.dashed ? 0.06 : 0.18;
      ctx.fillStyle = stroke;
      let run: number[] = [];
      const fill = () => {
        if (run.length === 0) return;
        ctx.beginPath();
        run.forEach((i, k) => {
          const p = line.points[i] as PixelPoint;
          if (k === 0) ctx.moveTo(p.x, p.y as number);
          else ctx.lineTo(p.x, p.y as number);
        });
        for (let k = run.length - 1; k >= 0; k--) {
          const i = run[k] as number;
          ctx.lineTo((line.points[i] as PixelPoint).x, line.area?.[i] as number);
        }
        ctx.closePath();
        ctx.fill();
        run = [];
      };
      line.points.forEach((p, i) => {
        if (p.y === null || !Number.isFinite(p.y)) fill();
        else run.push(i);
      });
      fill();
    }
    ctx.globalAlpha = line.dashed ? 0.75 : 1;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.setLineDash(line.dashed ? [5, 4] : []);
    ctx.beginPath();
    let pen = false;
    for (const p of line.points) {
      if (p.y === null || !Number.isFinite(p.y)) {
        pen = false;
        continue;
      }
      if (pen) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
      pen = true;
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const set of dots) {
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = color(set.color);
    ctx.beginPath();
    for (const p of set.points) {
      if (p.y === null) continue;
      ctx.moveTo(p.x + p.r, p.y);
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Redraw once per frame, only when data, size or the theme (palette, mode) change.
$effect(() => {
  void [lines, dots, width, height, canvas, chart?.palette, chart?.mode];
  untrack(() => {
    cancel(frame);
    frame = schedule(draw);
  });
  return () => cancel(frame);
});
</script>

<canvas
  bind:this={canvas}
  aria-hidden="true"
  data-chart-canvas=""
  class="pointer-events-none absolute top-0 left-0"
  style:width="{width}px"
  style:height="{height}px"
></canvas>
