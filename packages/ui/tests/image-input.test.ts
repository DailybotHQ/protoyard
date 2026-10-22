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
  it('exposes an accessible labelled file control', () => {
    render(ImageInput, { label: 'Evidence photos', inputId: 'evidence', hint: 'JPEG or PNG' });
    const input = screen.getByLabelText('Evidence photos');
    expect(input).toBeInstanceOf(HTMLInputElement);
    expect((input as HTMLInputElement).type).toBe('file');
    expect((input as HTMLInputElement).id).toBe('evidence');
    expect((input as HTMLInputElement).getAttribute('accept')).toBe(DEFAULT_IMAGE_ACCEPT);
    expect(screen.getByText('JPEG or PNG')).toBeTruthy();
    expect(document.querySelector('[data-image-input-add]')?.getAttribute('aria-label')).toBe(
      'Add images'
    );
  });

  it('previews selected images and notifies the caller with File objects', async () => {
    const createObjectURL = vi.fn((file: File) => `blob:${file.name}`);
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const onFilesSelected = vi.fn();

    render(ImageInput, {
      label: 'Photos',
      inputId: 'photos',
      onFilesSelected,
    });
    const input = screen.getByLabelText('Photos') as HTMLInputElement;
    const first = makeFile('evidence-one.jpg', 'image/jpeg');
    await pickFiles(input, [first]);

    expect(onFilesSelected).toHaveBeenCalledWith([first]);
    expect(createObjectURL).toHaveBeenCalledWith(first);
    expect(screen.getByAltText('evidence-one.jpg')).toBeTruthy();
    expect(screen.getByAltText('evidence-one.jpg').tagName).toBe('IMG');
    expect(document.querySelector('iframe')).toBeNull();
    expect(document.querySelector('object')).toBeNull();
    expect(document.querySelector('embed')).toBeNull();
  });

  it('revokes object URLs when the selection is replaced and on unmount', async () => {
    const createObjectURL = vi.fn((file: File) => `blob:${file.name}`);
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

    const { unmount } = render(ImageInput, { label: 'Photos', inputId: 'photos' });
    const input = screen.getByLabelText('Photos') as HTMLInputElement;

    const first = makeFile('evidence-one.jpg', 'image/jpeg');
    await pickFiles(input, [first]);
    expect(screen.getByAltText('evidence-one.jpg')).toBeTruthy();

    const second = makeFile('evidence-two.jpg', 'image/jpeg');
    await pickFiles(input, [second]);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:evidence-one.jpg');
    expect(screen.queryByAltText('evidence-one.jpg')).toBeNull();
    expect(screen.getByAltText('evidence-two.jpg')).toBeTruthy();

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:evidence-two.jpg');
  });

  it('clears previews and revokes URLs from the remove control', async () => {
    const createObjectURL = vi.fn((file: File) => `blob:${file.name}`);
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const onFilesSelected = vi.fn();

    render(ImageInput, { label: 'Photos', inputId: 'photos', onFilesSelected });
    const input = screen.getByLabelText('Photos') as HTMLInputElement;
    await pickFiles(input, [makeFile('shot.png', 'image/png')]);

    const clear = screen.getByRole('button', { name: 'Remove images' });
    await fireEvent.click(clear);

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:shot.png');
    expect(screen.queryByAltText('shot.png')).toBeNull();
    expect(onFilesSelected).toHaveBeenLastCalledWith([]);
  });

  it('does not preview SVG or HTML selections as markup', async () => {
    const createObjectURL = vi.fn((file: File) => `blob:${file.name}`);
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() });
    const onFilesSelected = vi.fn();

    render(ImageInput, { label: 'Photos', inputId: 'photos', onFilesSelected, accept: 'image/*' });
    const input = screen.getByLabelText('Photos') as HTMLInputElement;
    const svg = makeFile('icon.svg', 'image/svg+xml', '<svg onload="alert(1)"></svg>');
    const html = makeFile('page.html', 'text/html', '<script>alert(1)</script>');
    await pickFiles(input, [svg, html]);

    expect(onFilesSelected).toHaveBeenCalledWith([svg, html]);
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(screen.queryByAltText('icon.svg')).toBeNull();
    expect(screen.queryByAltText('page.html')).toBeNull();
    expect(document.body.innerHTML).not.toContain('<script>');
    // Only the Lucide chrome icon may be an <svg>; no user-file SVG/HTML markup.
    expect(document.querySelectorAll('[data-image-input-preview]')).toHaveLength(0);
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('iframe')).toBeNull();
    expect(document.querySelector('object')).toBeNull();
    expect(document.querySelector('embed')).toBeNull();
  });

  it('marks the required badge when required is set', () => {
    render(ImageInput, { label: 'Cover', required: true });
    expect(screen.getByText('Required')).toBeTruthy();
    expect((screen.getByLabelText('Cover') as HTMLInputElement).required).toBe(true);
  });
});
