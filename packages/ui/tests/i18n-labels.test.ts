import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import {
  Dialog,
  Drawer,
  FileDropzone,
  NumberStepper,
  Pagination,
  SimulatedTag,
  StarRating,
} from '../src/index.ts';
import LabelsHarness from './fixtures/LabelsHarness.svelte';

afterEach(() => cleanup());

const srcDir = join(import.meta.dirname, '../src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(svelte|ts)$/.test(name) ? [path] : [];
  });
}

describe('ui labels follow the Texuli dictionary (UG-01)', () => {
  it('Dialog with no closeLabel takes texuli.dialog.close-label from the dictionary', async () => {
    render(LabelsHarness, {
      component: Dialog,
      innerProps: { open: true, title: 'Confirmar' },
      labels: { 'texuli.dialog.close-label': 'Cerrar' },
    });
    expect(await screen.findByRole('button', { name: 'Cerrar' })).toBeTruthy();
  });

  it('a closeLabel prop still wins over the dictionary', async () => {
    render(LabelsHarness, {
      component: Dialog,
      innerProps: { open: true, title: 'Confirmar', closeLabel: 'Salir' },
      labels: { 'texuli.dialog.close-label': 'Cerrar' },
    });
    expect(await screen.findByRole('button', { name: 'Salir' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cerrar' })).toBeNull();
  });

  it('Dialog with no dictionary stays English', async () => {
    render(Dialog, { props: { open: true, title: 'Confirm' } });
    expect(await screen.findByRole('button', { name: 'Close' })).toBeTruthy();
  });

  it('a Protoyard-only string reads its protoyard.ui id (SimulatedTag)', () => {
    render(LabelsHarness, {
      component: SimulatedTag,
      labels: {
        'protoyard.ui.simulated-tag.label': 'Simulado',
        'protoyard.ui.simulated-tag.title': 'Este paso es simulado.',
      },
    });
    const tag = document.querySelector('[data-py-tag="simulated"]') as HTMLElement;
    expect(tag.textContent?.trim()).toBe('Simulado');
    expect(tag.getAttribute('title')).toBe('Este paso es simulado.');
  });

  it('SimulatedTag keeps its English words and its label prop', () => {
    render(SimulatedTag, { props: {} });
    expect(document.querySelector('[data-py-tag="simulated"]')?.textContent?.trim()).toBe(
      'Simulated'
    );
    cleanup();
    render(LabelsHarness, {
      component: SimulatedTag,
      innerProps: { label: 'Demo' },
      labels: { 'protoyard.ui.simulated-tag.label': 'Simulado' },
    });
    expect(document.querySelector('[data-py-tag="simulated"]')?.textContent?.trim()).toBe('Demo');
  });

  it('Drawer close control reads protoyard.ui.drawer.close-label', async () => {
    render(LabelsHarness, {
      component: Drawer,
      innerProps: { open: true, title: 'Filtros' },
      labels: { 'protoyard.ui.drawer.close-label': 'Cerrar panel' },
    });
    expect(await screen.findByRole('button', { name: 'Cerrar panel' })).toBeTruthy();
  });

  it('Pagination words and NumberStepper button names take placeholders', () => {
    render(LabelsHarness, {
      component: Pagination,
      innerProps: { page: 2, pageCount: 5, compact: true },
      labels: {
        'protoyard.ui.pagination.status': 'Página {page} de {count}',
        'protoyard.ui.pagination.previous': 'Anterior',
      },
    });
    expect(screen.getByText('Página 2 de 5')).toBeTruthy();
    expect(screen.getByText('Anterior')).toBeTruthy();
    cleanup();
    render(LabelsHarness, {
      component: NumberStepper,
      innerProps: { label: 'Huéspedes', value: 2 },
      labels: { 'protoyard.ui.number-stepper.increment': 'Aumentar {label}' },
    });
    expect(screen.getByRole('button', { name: 'Aumentar Huéspedes' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Decrease Huéspedes' })).toBeTruthy();
  });

  it('StarRating and FileDropzone no longer pass English over Texuli ids', () => {
    render(LabelsHarness, {
      component: StarRating,
      labels: { 'texuli.rating.label': 'Calificación' },
    });
    expect(screen.getByText('Calificación')).toBeTruthy();
    cleanup();
    render(LabelsHarness, {
      component: FileDropzone,
      labels: { 'texuli.file-upload.label': 'Subir archivos' },
    });
    // The visible label and the file input's name both follow texuli.file-upload.label.
    const named = screen.getAllByLabelText('Subir archivos');
    expect(named.some((node) => node instanceof HTMLInputElement && node.type === 'file')).toBe(
      true
    );
    expect(screen.queryAllByLabelText('Upload files')).toHaveLength(0);
  });

  it('every protoyard.ui id in the source is listed in docs/TEXULI.md', () => {
    const docs = readFileSync(join(import.meta.dirname, '../../../docs/TEXULI.md'), 'utf8');
    const ids = new Set<string>();
    for (const file of sourceFiles(srcDir)) {
      for (const match of readFileSync(file, 'utf8').matchAll(/'(protoyard\.ui\.[a-z0-9.-]+)'/g)) {
        ids.add(match[1] as string);
      }
    }
    expect(ids.size).toBeGreaterThan(50);
    const missing = [...ids].filter((id) => !docs.includes(`\`${id}\``));
    expect(missing).toEqual([]);
  });
});
