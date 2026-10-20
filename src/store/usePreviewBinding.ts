import { useLabelStore, selectRenderVariables, selectRenderDesignLabel, selectRenderColumnMapping, selectRenderDataset } from "./labelStore";
import {
  activeCellValue,
  buildActiveRow,
  clockCtxFromLabel,
  resolveContentPreview,
  type ActiveRow,
  type ClockResolveCtx,
} from "@zplab/core/lib/variableBinding";
import type { Variable } from "@zplab/core/types/Variable";

export interface PreviewBinding {
  variables: readonly Variable[];
  /** Active dataset row, or null without a dataset/mapping. */
  active: ActiveRow | null;
  /** Label-level ^SO2/^SO3 clock offsets. */
  clock: ClockResolveCtx;
  /** Content string -> its builder-preview substitution: variable DEFAULTS +
   *  label clock, explicitly NO dataset row (the builders' validation semantics).
   *  Named to keep it from being mistaken for an `active`-aware resolver. */
  resolveDefaults: (content: string, opts?: { resolveCtrl?: boolean }) => string;
  /** Like resolveDefaults, but a variable bound to a non-empty cell of the
   *  active dataset row resolves to that cell. Builders that validate fixed
   *  widths (GS1) use it so loaded data passes without hand-typed defaults. */
  resolveActive: (content: string, opts?: { resolveCtrl?: boolean }) => string;
}

/** Variables whose default is replaced by the active row's non-empty bound cell. */
export function variablesWithActiveRow(
  variables: readonly Variable[],
  active: ActiveRow | null,
): readonly Variable[] {
  if (!active) return variables;
  let changed = false;
  const out = variables.map((v) => {
    const cell = activeCellValue(v, active);
    if (cell === undefined || cell === "" || cell === v.defaultValue) return v;
    changed = true;
    return { ...v, defaultValue: cell };
  });
  return changed ? out : variables;
}

/** The one seam for "what would this print": every preview consumer (builders,
 *  canvas, preflight) derives the same binding context from the store here
 *  instead of assembling variables/dataset/clock ad hoc per call site. */
export function usePreviewBinding(): PreviewBinding {
  const variables = useLabelStore(selectRenderVariables);
  const dataset = useLabelStore(selectRenderDataset);
  const columnMapping = useLabelStore(selectRenderColumnMapping);
  const label = useLabelStore(selectRenderDesignLabel);
  const active = buildActiveRow(dataset, columnMapping);
  const clock = clockCtxFromLabel(label);
  return {
    variables,
    active,
    clock,
    resolveDefaults: (content, opts) => resolveContentPreview(content, variables, clock, opts),
    resolveActive: (content, opts) =>
      resolveContentPreview(content, variablesWithActiveRow(variables, active), clock, opts),
  };
}
