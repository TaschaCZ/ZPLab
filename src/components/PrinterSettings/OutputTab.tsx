import { InformationCircleIcon } from "@heroicons/react/24/outline";
import { useT } from "../../hooks/useT";
import { useLabelStore } from "../../store/labelStore";
import { UnitNumberInput } from "../Properties/UnitNumberInput";
import { Tooltip } from "../ui/Tooltip";
import { labelCls, fieldGridCols, fieldGridCell } from "../ui/formStyles";
import { RegionFocus } from "./printerIllustration";
import { ZplBoundedIntInput, ZplCheckbox, ZplEnumCustomSelect, ZplFieldHint } from "./zplFieldPrimitives";
import { usePreviewBinding, variablesWithActiveRow } from "../../store/usePreviewBinding";
import { stepCounterValue } from "../../lib/sendZpl";
import { COUNTER_COUNT_RANGE, COUNTER_STEP_RANGE, LABEL_HOME_RANGE, LABEL_SHIFT_RANGE, LABEL_TOP_RANGE } from "@zplab/core/types/LabelConfig";

/** Print-time output settings (offsets, shift, quantities). These are
 *  per-label ZPL (^LH/^LT/^LS/^PQ) and stay in labelConfig; they live here
 *  rather than in the label panel because they position the print on the
 *  DEVICE, which the printer illustration visualizes per focused field. */
export function OutputTab() {
  const t = useT();
  const label = useLabelStore((s) => s.label);
  const setLabelConfig = useLabelStore((s) => s.setLabelConfig);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className={labelCls}>
          {t.label.offsetsHeading}
          <Tooltip content={t.label.offsetsHint}>
            <InformationCircleIcon className="w-3.5 h-3.5 ml-1 inline-block align-text-bottom text-muted cursor-help" />
          </Tooltip>
        </span>
        <div className={`grid grid-cols-3 ${fieldGridCols}`}>
          <RegionFocus region="originX" className={fieldGridCell}>
            <UnitNumberInput
              label={t.label.labelHomeX}
              valueDots={label.labelHomeX}
              minDots={LABEL_HOME_RANGE.min}
              maxDots={LABEL_HOME_RANGE.max}
              allowUnset
              onChangeDots={(labelHomeX) => setLabelConfig({ labelHomeX })}
              scope="design"
              zplCmd="^LH"
              className="contents"
            />
          </RegionFocus>
          <RegionFocus region="originY" className={fieldGridCell}>
            <UnitNumberInput
              label={t.label.labelHomeY}
              valueDots={label.labelHomeY}
              minDots={LABEL_HOME_RANGE.min}
              maxDots={LABEL_HOME_RANGE.max}
              allowUnset
              onChangeDots={(labelHomeY) => setLabelConfig({ labelHomeY })}
              scope="design"
              zplCmd="^LH"
              className="contents"
            />
          </RegionFocus>
          <RegionFocus region="top" className={fieldGridCell}>
            <UnitNumberInput
              label={t.label.labelTop}
              valueDots={label.labelTop}
              minDots={LABEL_TOP_RANGE.min}
              maxDots={LABEL_TOP_RANGE.max}
              allowUnset
              onChangeDots={(labelTop) => setLabelConfig({ labelTop })}
              scope="design"
              zplCmd="^LT"
              className="contents"
            />
          </RegionFocus>
        </div>
      </div>

      <RegionFocus region="shift">
        <UnitNumberInput
          label={t.label.labelShift}
          valueDots={label.labelShift}
          // ^LS shifts content left; the canvas viewport frames a non-negative
          // shift. Negatives round-trip from import but aren't authored here
          // (spec: "if print position is less than 0, set ^LS to 0").
          minDots={0}
          maxDots={LABEL_SHIFT_RANGE.max}
          allowUnset
          onChangeDots={(labelShift) => setLabelConfig({ labelShift })}
          scope="design"
          zplCmd="^LS"
        />
      </RegionFocus>

      <RegionFocus region="stack" className="flex flex-col gap-4">
        <ZplBoundedIntInput
          label={t.label.printQuantity}
          command="^PQ"
          min={1}
          max={99999999}
          value={label.printQuantity ?? 1}
          onChange={(v) =>
            setLabelConfig({ printQuantity: v !== undefined && v > 1 ? v : undefined })
          }
        />
        <ZplBoundedIntInput
          label={t.label.pauseCount}
          command="^PQ"
          min={0}
          max={99999999}
          value={label.pauseCount}
          onChange={(pauseCount) => setLabelConfig({ pauseCount })}
        />
        <ZplCheckbox
          text={t.label.programmablePause}
          command="^PP"
          checked={label.programmablePause === true}
          onChange={(v) => setLabelConfig({ programmablePause: v || undefined })}
        />
        <ZplBoundedIntInput
          label={t.label.replicates}
          command="^PQ"
          min={0}
          max={99999999}
          value={label.replicates}
          onChange={(replicates) => setLabelConfig({ replicates })}
        />
        <ZplCheckbox
          text={t.label.overridePauseCount}
          command="^PQ"
          checked={label.overridePauseCount === "Y"}
          onChange={(checked) =>
            setLabelConfig({ overridePauseCount: checked ? "Y" : undefined })
          }
          hint={t.label.overridePauseCountHint}
        />
      </RegionFocus>
      <ZplCheckbox
        text={t.label.expandRows}
        command="^XF"
        checked={label.batchExpandRows === true}
        onChange={(v) => setLabelConfig({ batchExpandRows: v || undefined })}
        hint={t.label.expandRowsHint}
      />
      <CounterSection />
    </div>
  );
}

/** Counter: one data row (or the defaults) prints a run of labels with one
 *  variable stepped per label, e.g. serials 100001..100005. */
function CounterSection() {
  const t = useT();
  const label = useLabelStore((s) => s.label);
  const setLabelConfig = useLabelStore((s) => s.setLabelConfig);
  const { variables, active } = usePreviewBinding();
  const count = label.counterCount ?? 1;
  const step = label.counterStep ?? 1;
  const current = variablesWithActiveRow(variables, active).find((v) => v.id === label.counterVariable)?.defaultValue;
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <ZplEnumCustomSelect<string>
        label={t.label.counterVariable}
        command="^XA"
        values={variables.map((v) => v.id)}
        value={label.counterVariable}
        defaultLabel={t.label.counterOff}
        optionLabel={(id) => variables.find((v) => v.id === id)?.name ?? id}
        optionBadge={() => ""}
        onChange={(counterVariable) => setLabelConfig({ counterVariable })}
      />
      {label.counterVariable && (
        <>
          <ZplBoundedIntInput
            label={t.label.counterCount}
            command="^XA"
            min={COUNTER_COUNT_RANGE.min}
            max={COUNTER_COUNT_RANGE.max}
            value={label.counterCount}
            onChange={(counterCount) => setLabelConfig({ counterCount })}
          />
          <ZplBoundedIntInput
            label={t.label.counterStep}
            command="^XA"
            min={COUNTER_STEP_RANGE.min}
            max={COUNTER_STEP_RANGE.max}
            value={label.counterStep}
            onChange={(counterStep) => setLabelConfig({ counterStep })}
          />
          {current !== undefined && current !== "" && (
            <ZplFieldHint>
              {t.label.counterPreviewFmt
                .replace("{n}", String(count))
                .replace("{from}", current)
                .replace("{to}", stepCounterValue(current, (count - 1) * step))}
            </ZplFieldHint>
          )}
        </>
      )}
      <ZplFieldHint>{t.label.counterHint}</ZplFieldHint>
    </div>
  );
}
