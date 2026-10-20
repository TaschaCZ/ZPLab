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

/** `value` stepped up by `by`: a number keeps its width (000123 -> 000124), a
 *  value ending in digits steps those (LOT-0099 -> LOT-0100); anything else
 *  stays as is. */
export function stepCounterValue(value: string, by: number): string {
  if (by === 0) return value;
  const m = /^(.*?)(\d+)$/.exec(value);
  if (!m) return value;
  const [, head, digits] = m as unknown as [string, string, string];
  const next = (BigInt(digits) + BigInt(by)).toString();
  return head + next.padStart(digits.length, "0");
}

interface CounterLabel { counterVariable?: string; counterCount?: number; counterStep?: number }

/** The variable sets one row prints: one per counter copy, the counter
 *  variable stepped on each. A row without a counter prints once. */
export function counterCopies(variables: readonly Variable[], label: CounterLabel): Variable[][] {
  const count = label.counterVariable ? label.counterCount ?? 1 : 1;
  const step = label.counterStep ?? 1;
  return Array.from({ length: count }, (_, i) =>
    i === 0
      ? [...variables]
      : variables.map((v) =>
          v.id === label.counterVariable ? { ...v, defaultValue: stepCounterValue(v.defaultValue, i * step) } : v,
        ),
  );
}

/** One complete label per row (and per counter copy), every value already in
 *  place: no stored format, no ^XF recall and no ^FE embedding, so printers
 *  without field embedding print exactly what the preview shows. The copy's
 *  variables also feed the computed RFID write, so each tag matches its label. */
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
    .flatMap((row) => counterCopies(variablesForRow(variables, { headers: dataset.headers, row, mapping }), label))
    .map((copy) => {
      const substituted = applyBindingToTree(objects, copy, null, "preview", clock, ctrlParityFor);
      return generateZPL(flatLabel, substituted, copy).trimEnd();
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
  if (!expandsRows(s.label)) return generateMultiPageZPL(s.label, s.pages, s.variables);
  return counterCopies(s.variables, s.label)
    .map((copy) => generateMultiPageZPL(s.label, flattenPages(s.pages, copy, s.label), copy).trimEnd())
    .join("\n");
}

/** A data job expands per row when the design asks for it, when the tag write
 *  is computed per row, or when a counter steps a value (a stored format can
 *  do neither). */
export function expandsRows(label: { batchExpandRows?: boolean; rfidWriteFrom?: string } & CounterLabel): boolean {
  return label.batchExpandRows === true || label.rfidWriteFrom !== undefined || counterActive(label);
}

/** The counter prints more than one label per row. */
export const counterActive = (label: CounterLabel): boolean =>
  label.counterVariable !== undefined && (label.counterCount ?? 1) > 1;

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
