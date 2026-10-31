import type { BlueprintEntity, BlueprintScreen } from '@protoyard/blueprint';
import type { Row } from '@protoyard/core';

export type CanvasScreenSpec = Extract<BlueprintScreen, { type: 'canvas' }>;

/** A record's choice in the screen's picker: its id and title. */
export interface CanvasRecordOption {
  value: string;
  label: string;
}

/** The records a canvas screen offers, titled by the entity's title field, in list order. */
export function canvasRecordOptions(
  rows: readonly Row[],
  entity: Pick<BlueprintEntity, 'titleField'>
): CanvasRecordOption[] {
  return rows.map((row) => ({
    value: String(row.id),
    label: String(row[entity.titleField] ?? '').trim() || 'Untitled',
  }));
}

/** A blank canvas titled after its record (what an empty field opens as). */
export function blankCanvas(title: string) {
  return {
    format: 'texuli-canvas' as const,
    formatVersion: 1 as const,
    meta: { title: title.slice(0, 200) },
    shapes: [],
    connectors: [],
  };
}

/** The value a record's canvas field paints: the stored canvas, or a blank one when empty. */
export function storedCanvas(
  row: Row | undefined,
  screen: CanvasScreenSpec,
  title: string
): unknown {
  const value = row?.[screen.field];
  return value === null || value === undefined || value === '' ? blankCanvas(title) : value;
}
