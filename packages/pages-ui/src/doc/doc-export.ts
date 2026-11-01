import { type DocDocument, docToTexuliDocument } from '@protoyard/pages';
import { downloadBlob, type ExportFormat, exportDocument } from '@texuli/pages/export';

/**
 * Downloads a doc as DOCX, PDF or Markdown with Texuli's owned writers
 * (`@texuli/pages/export` over `@texuli/document/docx`, `pdf` and
 * `markdown`). This module and each writer load on first use, so a doc that
 * is never exported never pays for them.
 */
export type DocExportFormat = ExportFormat;

export const DOC_EXPORT_LABELS: Readonly<Record<DocExportFormat, string>> = Object.freeze({
  docx: 'Word (.docx)',
  pdf: 'PDF',
  markdown: 'Markdown',
});

export interface DocExportOutcome {
  format: DocExportFormat;
  filename: string;
  /** Bytes of the written file. */
  size: number;
  /** PDF only. */
  pageCount?: number;
  /** What the writer printed as text or left out, in plain words (deduplicated). */
  notes: string[];
}

export interface ExportDocOptions {
  /** Save the file through a `blob:` URL (default true). Tests read the blob instead. */
  download?: boolean;
  /** The document that owns the download link (default the global one). */
  owner?: Document;
  /** Receives the written file before it is saved. */
  onBlob?: (blob: Blob) => void;
}

function noteFor(code: string): string {
  switch (code) {
    case 'embed-as-text':
    case 'block-as-text':
      return 'Interactive blocks (charts without data, forms, embedded apps) are written as their titles.';
    case 'image-unresolved':
    case 'image-unsupported':
      return 'Images are written as their descriptions.';
    case 'link-refused':
      return 'Links that are not absolute https or mailto addresses are written as plain text.';
    case 'glyph-missing':
    case 'font-unsupported':
      return 'Some characters are outside the PDF standard fonts and were replaced.';
    case 'truncated':
      return 'Part of the document was too long for the file and was shortened.';
    default:
      return 'Part of the document could not be written exactly.';
  }
}

/** Writes the doc in one format and, by default, saves it as a download. */
export async function exportDoc(
  doc: DocDocument,
  format: DocExportFormat,
  options: ExportDocOptions = {}
): Promise<DocExportOutcome> {
  // Tables are wrapped @texuli/blocks tables in every format: DOCX and PDF print
  // them as tables, Markdown as GFM tables (G112).
  const { document } = docToTexuliDocument(doc, { mode: 'export', tables: 'block' });
  const result = await exportDocument(document, format, {
    markdown: { title: false, embeds: 'title' },
  });
  options.onBlob?.(result.blob);
  if (options.download !== false) downloadBlob(result.blob, result.filename, options.owner);
  return {
    format,
    filename: result.filename,
    size: result.blob.size,
    ...(result.pageCount !== undefined ? { pageCount: result.pageCount } : {}),
    notes: [...new Set(result.diagnostics.map((diagnostic) => noteFor(diagnostic.code)))],
  };
}
