/**
 * Map Protoyard data blocks to shapes `@texuli/blocks/data` accepts.
 * Table columns are label-only arrays of cells; Texuli wants id+label columns
 * and object rows keyed by id.
 */
import type { StatBlock, TableBlock } from '@protoyard/blocks';

export function toTexuliStatBlock(block: StatBlock): unknown {
  return {
    type: 'stat',
    id: block.id,
    tone: block.tone,
    items: (block.items ?? []).map((item) => ({
      label: item.label,
      value: String(item.value ?? ''),
      hint: 'context' in item ? item.context : undefined,
      delta:
        item.delta === undefined || item.delta === null
          ? undefined
          : typeof item.delta === 'number'
            ? `${item.delta > 0 ? '+' : ''}${item.delta}`
            : String(item.delta),
      tone: item.deltaTone,
    })),
  };
}

export function toTexuliTableBlock(block: TableBlock): unknown {
  const columns = (block.columns ?? []).map((col, i) => {
    const id = `c${i}`;
    const label = typeof col === 'string' ? col : (col.label ?? id);
    return { id, label };
  });
  const rows = (block.rows ?? []).map((row) => {
    const out: Record<string, string | number | null> = {};
    if (Array.isArray(row)) {
      columns.forEach((col, i) => {
        const cell = row[i];
        out[col.id] =
          cell === undefined || cell === null
            ? null
            : typeof cell === 'number'
              ? cell
              : String(cell);
      });
      return out;
    }
    return row as Record<string, string | number | null>;
  });
  return {
    type: 'table',
    id: block.id,
    tone: block.tone,
    caption: block.caption,
    columns,
    rows,
  };
}
