import { generateBatchZpl, generateMultiPageZPL, generateZPL } from "@zplab/core/lib/zplGenerator";
import { zplForExport } from "@zplab/core/lib/zplLabelMeta";
import { applyBindingToTree, clockCtxFromLabel, type ActiveRow } from "@zplab/core/lib/variableBinding";
import { ctrlParityFor } from "@zplab/core/registry";
import { withoutStoredFormat, type LabelObject, type Page } from "@zplab/core/types/Group";
import type { LabelConfig, PageLabel } from "@zplab/core/types/LabelConfig";
import type { ColumnMapping, Variable } from "@zplab/core/types/Variable";
import {
  currentObjects,
  currentPageLabel,
  selectBatchInputs,
  selectKeepExportMetadata,
  type LabelState,
} from "../store/labelStore";

/** The variables as one row prints them: a bound, present column replaces the default. */
export function variablesForRow(
  variables: readonly Variable[],
  active: ActiveRow,
): Variable[] {
  return variables.map((v) => {
    const header = active.mapping.bindings[v.id];
    if (header === undefined) return v;
    const idx = active.headers.indexOf(header);
    if (idx === -1) return v;
    return { ...v, defaultValue: active.row[idx] ?? "" };
  });
}

/** One complete label per row, every value already in place: no stored format,
 *  no ^XF recall and no ^FE embedding, so printers without field embedding
 *  print exactly what the preview shows. The row's variables also feed the
 *  computed RFID write, so each tag matches its own printed label. */
export function generateExpandedBatchZpl(
  label: PageLabel,
  objects: LabelObject[],
  variables: readonly Variable[],
  dataset: { headers: readonly string[]; rows: readonly (readonly string[])[] },
  mapping: ColumnMapping,
): string {
  const flatLabel = withoutStoredFormat(label);
  const clock = clockCtxFromLabel(label);
  return dataset.rows
    .map((row) => {
      const active: ActiveRow = { headers: dataset.headers, row, mapping };
      const substituted = applyBindingToTree(objects, variables, active, "preview", clock, ctrlParityFor);
      return generateZPL(flatLabel, substituted, variablesForRow(variables, active)).trimEnd();
    })
    .join("\n");
}

/** Pages with every variable marker replaced by its default. The source
 *  overlay is dropped: its replayed bytes would bring the markers back. */
export function flattenPages(pages: readonly Page[], variables: readonly Variable[], label: LabelConfig): Page[] {
  const clock = clockCtxFromLabel(label);
  return pages.map((p) => ({
    objects: applyBindingToTree(p.objects, variables, null, "preview", clock, ctrlParityFor),
    ...(p.jmDensity !== undefined ? { jmDensity: p.jmDensity } : {}),
  }));
}

/** The design's own emit (no data job). Expanding: the variables' defaults go
 *  straight into the fields, so no ^FE embedding reaches a printer that can't
 *  resolve it. Shared by the send and the "Export ZPL" download. */
export function documentZpl(s: Pick<LabelState, "label" | "pages" | "variables">): string {
  const pages = expandsRows(s.label) ? flattenPages(s.pages, s.variables, s.label) : s.pages;
  return generateMultiPageZPL(s.label, pages, s.variables);
}

/** A data job expands per row when the design asks for it, or when the tag
 *  write is computed per row (a stored format cannot compute an EPC). */
export function expandsRows(label: { batchExpandRows?: boolean; rfidWriteFrom?: string }): boolean {
  return label.batchExpandRows === true || label.rfidWriteFrom !== undefined;
}

/** The bytes a label send carries: batch form while a dataset is mapped, the document emit otherwise.
 *  The send and the notices above its button read this one derivation, so they cannot name different jobs.
 *  `sampleRows` caps the recall blocks for a caller that reads the commands and not the data. */
export function sendZpl(s: LabelState, sampleRows?: number): string {
  const batch = selectBatchInputs(s);
  if (!batch) return zplForExport(documentZpl(s), selectKeepExportMetadata(s));
  const dataset =
    sampleRows === undefined ? batch.dataset : { ...batch.dataset, rows: batch.dataset.rows.slice(0, sampleRows) };
  const pageLabel = currentPageLabel(s);
  const zpl = expandsRows(pageLabel)
    ? generateExpandedBatchZpl(pageLabel, currentObjects(s), s.variables, dataset, batch.mapping)
    : generateBatchZpl(pageLabel, currentObjects(s), s.variables, dataset, batch.mapping);
  return zplForExport(zpl, selectKeepExportMetadata(s));
}
