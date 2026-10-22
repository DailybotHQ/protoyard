// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  addedChunkClosure,
  FAMILIES,
  gateFamilies,
  THRESHOLDS,
} from '../../scripts/bench-blocks.ts';

describe('bench-blocks family thresholds', () => {
  it('defines a ceiling for the root and every lazy family', () => {
    expect(FAMILIES).toEqual([
      'root',
      'text',
      'media',
      'data',
      'structure',
      'code',
      'diagram',
      'interactive',
      'map',
      'embed',
    ]);
    expect(THRESHOLDS).toMatchObject({
      root: 3000,
      text: 6000,
      media: 4000,
      data: 5000,
      structure: 8000,
      code: 6000,
      diagram: 6000,
      interactive: 10_000,
      map: 4000,
      embed: 2000,
    });
  });

  it('counts only chunks a family adds beyond chunks already loaded by the shell', () => {
    const chunks = [
      { fileName: 'app.js', imports: ['shell.js', 'runtime.js'], code: 'app' },
      { fileName: 'shell.js', imports: [], code: 'shell' },
      { fileName: 'runtime.js', imports: [], code: 'svelte' },
      { fileName: 'data.js', imports: ['runtime.js', 'schema.js'], code: 'data' },
      { fileName: 'schema.js', imports: [], code: 'schema' },
      { fileName: 'other-family.js', imports: [], code: 'other' },
    ];
    expect(
      addedChunkClosure(chunks, 'data.js', new Set(['app.js', 'shell.js', 'runtime.js']))
    ).toEqual([chunks[3], chunks[4]]);
  });

  it('passes a family exactly at its byte ceiling and fails above it', () => {
    const atLimit = gateFamilies({
      root: 3000,
      text: 6000,
      media: 4000,
      data: 5000,
      structure: 8000,
      code: 6000,
      diagram: 6000,
      interactive: 10_000,
      map: 4000,
      embed: 2000,
    });
    expect(atLimit.every((gate) => gate.ok)).toBe(true);

    const over = gateFamilies({
      root: 3001,
      text: 6000,
      media: 4000,
      data: 5000,
      structure: 8000,
      code: 6000,
      diagram: 6000,
      interactive: 10_000,
      map: 4000,
      embed: 2000,
    });
    expect(over.find((gate) => gate.family === 'root')).toMatchObject({
      bytes: 3001,
      limitBytes: 3000,
      ok: false,
    });
  });

  it('fails when a required family measurement is missing', () => {
    expect(gateFamilies({ text: 1 }).find((gate) => gate.family === 'root')).toMatchObject({
      ok: false,
    });
  });
});
