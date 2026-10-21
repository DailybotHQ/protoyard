import { PAGES_PACKAGE_VERSION } from '@protoyard/pages';
import { describe, expect, it } from 'vitest';
import { DOC_UI_SUBPATH } from '../src/doc/index.ts';
import { FORM_UI_SUBPATH } from '../src/form/index.ts';
import {
  PAGE_UI_FAMILIES,
  PAGES_PACKAGE,
  PAGES_UI_PACKAGE_NAME,
  PAGES_UI_PACKAGE_VERSION,
} from '../src/index.ts';
import { PAGE_UI_SUBPATH } from '../src/page/index.ts';
import { PRINT_UI_SUBPATH } from '../src/print/index.ts';

describe('@protoyard/pages-ui scaffold', () => {
  it('exports package identity and the four lazy family ids', () => {
    expect(PAGES_UI_PACKAGE_NAME).toBe('@protoyard/pages-ui');
    expect(PAGES_UI_PACKAGE_VERSION).toBe('1.0.0');
    expect(PAGE_UI_FAMILIES).toEqual(['page', 'doc', 'form', 'print']);
  });

  it('re-exports the engine package identity without pulling family modules', () => {
    expect(PAGES_PACKAGE.name).toBe('@protoyard/pages');
    expect(PAGES_PACKAGE_VERSION).toBe('1.0.0');
  });

  it('exposes a stable subpath marker per family', async () => {
    expect(PAGE_UI_SUBPATH).toBe('page');
    expect(DOC_UI_SUBPATH).toBe('doc');
    expect(FORM_UI_SUBPATH).toBe('form');
    expect(PRINT_UI_SUBPATH).toBe('print');
    const page = await import('@protoyard/pages-ui/page');
    const doc = await import('@protoyard/pages-ui/doc');
    const form = await import('@protoyard/pages-ui/form');
    const print = await import('@protoyard/pages-ui/print');
    expect(page.PAGE_UI_SUBPATH).toBe('page');
    expect(doc.DOC_UI_SUBPATH).toBe('doc');
    expect(form.FORM_UI_SUBPATH).toBe('form');
    expect(print.PRINT_UI_SUBPATH).toBe('print');
  });
});
