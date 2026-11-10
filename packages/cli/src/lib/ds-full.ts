import { checkDesignSystemFull, type DsFullFinding } from '@texuli/tools/ds-check';
import { dsCheckInputs } from './ds-catalog.ts';

/**
 * Texuli's full design-system validator (`checkDesignSystemFull` in
 * `@texuli/tools/ds-check`) over the catalog Protoyard locks against: the
 * installed Texuli catalog with Protoyard's catalog extensions merged
 * (`protoyard:*`, the same merge `dsCatalog` runs). One report: structure,
 * `extends`, the allow section against the merged catalog, the approval and
 * its content hash, contrast, the data-viz palette and token completeness.
 *
 * `ds validate` and `ds import` print it as `full`; neither changes its exit
 * code on it unless asked (`ds validate --strict`), so a document that
 * passed before still passes.
 */

/** The part of Texuli's report the CLI prints (the embedded `ds check` report is left out). */
export interface FullValidation {
  format: string;
  version: number;
  ok: boolean;
  codes: string[];
  summary: { errors: number; warnings: number; info: number };
  findings: DsFullFinding[];
}

export async function validateFull(document: unknown, file?: string): Promise<FullValidation> {
  const inputs = dsCheckInputs();
  const report = await checkDesignSystemFull(document, {
    catalog: inputs.catalog,
    extensions: inputs.extensions,
    trust: 'untrusted',
    ...(file ? { file } : {}),
  });
  return {
    format: report.format,
    version: report.version,
    ok: report.ok,
    codes: [...report.codes],
    summary: { ...report.summary },
    findings: [...report.findings],
  };
}

/** One line per finding, errors first (Texuli's order). */
export function formatFinding(finding: DsFullFinding): string {
  return `${finding.severity} ${finding.code} at ${finding.path}: ${finding.message}`;
}
