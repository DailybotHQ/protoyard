import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ImageInput from '../src/components/image-input/ImageInput.svelte';
import {
  buildImagePreviews,
  DEFAULT_IMAGE_ACCEPT,
  isPreviewableImage,
  revokeImagePreviews,
} from '../src/components/image-input/preview.ts';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function makeFile(name: string, type: string, content = 'x'): File {
  return new File([content], name, { type });
}

async function pickFiles(input: HTMLInputElement, files: File[]): Promise<void> {
  Object.defineProperty(input, 'files', { configurable: true, value: files });
  await fireEvent.change(input);
}

describe('isPreviewableImage / buildImagePreviews', () => {
  it('allows common raster types and refuses SVG and HTML', () => {
    expect(isPreviewableImage(makeFile('a.jpg', 'image/jpeg'))).toBe(true);
    expect(isPreviewableImage(makeFile('a.png', 'image/png'))).toBe(true);
    expect(isPreviewableImage(makeFile('a.webp', 'image/webp'))).toBe(true);
    expect(isPreviewableImage(makeFile('a.svg', 'image/svg+xml'))).toBe(false);
    expect(isPreviewableImage(makeFile('a.html', 'text/html'))).toBe(false);
    expect(isPreviewableImage(makeFile('a.txt', 'text/plain'))).toBe(false);
    expect(isPreviewableImage(makeFile('photo.JPG', ''))).toBe(true);
    expect(isPreviewableImage(makeFile('vector.SVG', ''))).toBe(false);
  });

  it('builds object-URL previews only for safe files', () => {
    const createObjectURL = vi.fn((file: Blob) => `blob:${(file as File).name}`);
    const files = [
      makeFile('ok.png', 'image/png'),
      makeFile('bad.svg', 'image/svg+xml'),
      makeFile('page.html', 'text/html'),
    ];
    const previews = buildImagePreviews(files, createObjectURL);
    expect(previews).toHaveLength(1);
    expect(previews[0]?.file.name).toBe('ok.png');
    expect(previews[0]?.url).toBe('blob:ok.png');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('revokes every preview URL', () => {
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', {
      createObjectURL: (file: Blob) => `blob:${(file as File).name}`,
      revokeObjectURL,
    });
    const previews = buildImagePreviews([
      makeFile('a.png', 'image/png'),
      makeFile('b.jpg', 'image/jpeg'),
    ]);
    revokeImagePreviews(previews);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:a.png');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:b.jpg');
  });

  it('exports a raster-only default accept list', () => {
    expect(DEFAULT_IMAGE_ACCEPT).toContain('image/jpeg');
    expect(DEFAULT_IMAGE_ACCEPT).not.toContain('svg');
  });
});

describe('ImageInput', () => {
  const fileInput = (name: string) =>
    screen.getByLabelText(name, { selector: 'input' }) as HTMLInputElement;

  it('exposes an accessible labelled file control on Texuli FileUpload', () => {
    render(ImageInput, { label: 'Evidence photos', hint: 'JPEG or PNG' });
    const input = fileInput('Evidence photos');
    expect(input.type).toBe('file');
    expect(input.getAttribute('accept')).toBe(DEFAULT_IMAGE_ACCEPT);
    expect(input.hasAttribute('data-image-input-control')).toBe(true);
    expect(input.closest('[data-tx-file-upload]')).not.toBeNull();
    expect(screen.getByText('JPEG or PNG')).toBeTruthy();
    expect(screen.getAllByText('Add images').length).toBeGreaterThan(0);
  });

  it('previews selected images and notifies the caller with File objects', async () => {
    const createObjectURL = vi.fn((file: File) => `blob:${file.name}`);
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const onFilesSelected = vi.fn();

    render(ImageInput, { label: 'Photos', onFilesSelected });
    const first = makeFile('evidence-one.jpg', 'image/jpeg');
    await pickFiles(fileInput('Photos'), [first]);

    expect(onFilesSelected).toHaveBeenCalledWith([first]);
    expect(createObjectURL).toHaveBeenCalledWith(first);
    expect(screen.getByAltText('evidence-one.jpg').tagName).toBe('IMG');
    expect(document.querySelector('iframe')).toBeNull();
    expect(document.querySelector('object')).toBeNull();
    expect(document.querySelector('embed')).toBeNull();
  });

  it('adds later picks to the selection, removes one file, and revokes URLs', async () => {
    const createObjectURL = vi.fn((file: File) => `blob:${file.name}`);
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const onFilesSelected = vi.fn();

    const { unmount } = render(ImageInput, { label: 'Photos', onFilesSelected });
    const first = makeFile('evidence-one.jpg', 'image/jpeg');
    const second = makeFile('evidence-two.jpg', 'image/jpeg');
    await pickFiles(fileInput('Photos'), [first]);
    await pickFiles(fileInput('Photos'), [second]);
    expect(onFilesSelected).toHaveBeenLastCalledWith([first, second]);
    expect(screen.getByAltText('evidence-one.jpg')).toBeTruthy();
    expect(screen.getByAltText('evidence-two.jpg')).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: /Remove evidence-one\.jpg/ }));
    expect(onFilesSelected).toHaveBeenLastCalledWith([second]);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:evidence-one.jpg');
    expect(screen.queryByAltText('evidence-one.jpg')).toBeNull();

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:evidence-two.jpg');
  });

  it('clears previews and revokes URLs from the remove control', async () => {
    const createObjectURL = vi.fn((file: File) => `blob:${file.name}`);
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const onFilesSelected = vi.fn();

    render(ImageInput, { label: 'Photos', onFilesSelected });
    await pickFiles(fileInput('Photos'), [makeFile('shot.png', 'image/png')]);

    await fireEvent.click(screen.getByRole('button', { name: 'Remove images' }));

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:shot.png');
    expect(screen.queryByAltText('shot.png')).toBeNull();
    expect(onFilesSelected).toHaveBeenLastCalledWith([]);
    expect(screen.queryByRole('button', { name: 'Remove images' })).toBeNull();
  });

  it('does not preview SVG or HTML selections as markup', async () => {
    const createObjectURL = vi.fn((file: File) => `blob:${file.name}`);
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() });
    const onFilesSelected = vi.fn();

    render(ImageInput, { label: 'Photos', onFilesSelected, accept: 'image/*,text/html' });
    const svg = makeFile('icon.svg', 'image/svg+xml', '<svg onload="alert(1)"></svg>');
    const html = makeFile('page.html', 'text/html', '<script>alert(1)</script>');
    await pickFiles(fileInput('Photos'), [svg, html]);

    expect(onFilesSelected).toHaveBeenCalledWith([svg, html]);
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(document.body.innerHTML).not.toContain('<script>');
    expect(document.querySelectorAll('[data-image-input-preview]')).toHaveLength(0);
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('iframe')).toBeNull();
    expect(document.querySelector('object')).toBeNull();
    expect(document.querySelector('embed')).toBeNull();
  });

  it('marks the required badge when required is set', () => {
    render(ImageInput, { label: 'Cover', required: true });
    expect(screen.getByText('Required')).toBeTruthy();
    expect(fileInput('Cover').required).toBe(true);
  });
});
