import { useState } from "react";
import { useT } from "../../hooks/useT";
import { useLabelStore } from "../../store/labelStore";
import {
  RFID_EPC96_HEX_LENGTH,
  RFID_WRITE_DATA_RE,
  type RfidWriteBank,
} from "@zplab/core/types/LabelConfig";
import {
  COMPANY_PREFIX_DIGITS,
  FILTER_RANGE,
  decodeEpc96,
  encodeSgtin96,
  encodeSscc96,
  type EpcError,
  type EpcScheme,
} from "@zplab/core/lib/epcEncode";
import {
  BoundedIntControl,
  SafeStringInput,
  ZplCommandLabel,
  ZplEnumSegmented,
  ZplField,
  ZplFieldHint,
  ZplSubField,
} from "./zplFieldPrimitives";
import { builderButtonCls, fieldGridCell, fieldGridCols, labelCls, sectionHeadingCls } from "../ui/formStyles";
import { RegionFocus } from "./printerIllustration";
import { SegmentedControl } from "../ui/SegmentedControl";

type LocRfid = ReturnType<typeof useT>["printerSettings"]["rfid"];

const hexOnly = (raw: string): string => raw.toUpperCase().replace(/[^0-9A-F]/g, "");
const digitsOnly = (raw: string): string => raw.replace(/\D/g, "");

const ERROR_KEYS = {
  gtinFormat: "errGtinFormat",
  gtinCheckDigit: "errGtinCheckDigit",
  ssccFormat: "errSsccFormat",
  ssccCheckDigit: "errSsccCheckDigit",
  prefixLength: "errPrefixLength",
  filter: "errFilter",
  serialFormat: "errSerialFormat",
  serialRange: "errSerialRange",
} as const satisfies Record<EpcError, keyof LocRfid>;

/** The EPC bank takes exactly the 96-bit EPC the ^RF default writes; user
 *  memory takes any whole number of bytes. */
function isValidFor(bank: RfidWriteBank, hex: string): boolean {
  return RFID_WRITE_DATA_RE.test(hex) && (bank === "user" || hex.length === RFID_EPC96_HEX_LENGTH);
}

/** ^RF: what every printed label writes to its tag, with a builder that turns
 *  a GS1 key into SGTIN-96 / SSCC-96 so nobody has to hand-assemble bits. */
export function RfidWriteSection() {
  const t = useT();
  const loc = t.printerSettings.rfid;
  const label = useLabelStore((s) => s.label);
  const setLabelConfig = useLabelStore((s) => s.setLabelConfig);
  const bank: RfidWriteBank = label.rfidWriteBank ?? "epc";
  const stored = label.rfidWriteData ?? "";

  // What the field shows: the stored value, or a typed one not yet valid.
  const [typed, setTyped] = useState(stored);
  const [lastStored, setLastStored] = useState(stored);
  if (lastStored !== stored) {
    setLastStored(stored);
    setTyped(stored);
  }
  const typedInvalid = typed !== "" && !isValidFor(bank, typed);

  const [scheme, setScheme] = useState<EpcScheme>("sgtin96");
  const [key, setKey] = useState("");
  const [serial, setSerial] = useState("");
  const [filter, setFilter] = useState<number | undefined>(1);
  const [prefixDigits, setPrefixDigits] = useState<number | undefined>(7);
  const [builderError, setBuilderError] = useState<EpcError | null>(null);

  const decoded = bank === "epc" && stored ? decodeEpc96(stored) : null;

  const commitData = (hex: string) => {
    setTyped(hex);
    if (hex === "") setLabelConfig({ rfidWriteData: undefined });
    else if (isValidFor(bank, hex)) setLabelConfig({ rfidWriteData: hex });
  };

  const build = () => {
    const f = filter ?? 0;
    const p = prefixDigits ?? 7;
    const result = scheme === "sgtin96" ? encodeSgtin96(key, serial, f, p) : encodeSscc96(key, f, p);
    if (!result.ok) {
      setBuilderError(result.error);
      return;
    }
    setBuilderError(null);
    setLabelConfig({ rfidWriteData: result.hex, rfidWriteBank: undefined });
  };

  return (
    <section className="flex flex-col gap-4 border-t border-border pt-4">
      <h3 className={sectionHeadingCls}>{loc.writeHeading}</h3>
      <p className="text-xs text-muted">{loc.writeHint}</p>

      <RegionFocus region="antenna">
        <ZplEnumSegmented<RfidWriteBank>
          label={loc.writeBank}
          command="^RF"
          values={["user"]}
          value={label.rfidWriteBank}
          defaultLabel={loc.writeBankEpc}
          optionLabel={() => loc.writeBankUser}
          onChange={(next) => {
            const nextBank: RfidWriteBank = next ?? "epc";
            // Data the new bank cannot take would encode wrong: drop it.
            const keep = stored !== "" && isValidFor(nextBank, stored);
            setLabelConfig({ rfidWriteBank: next, ...(keep ? {} : { rfidWriteData: undefined }) });
          }}
        />
      </RegionFocus>

      <RegionFocus region="antenna">
        <ZplField>
          <ZplCommandLabel text={loc.writeData} command="^RF" />
          <SafeStringInput
            value={typed}
            sanitize={hexOnly}
            onChange={commitData}
            placeholder={bank === "epc" ? "30360C0C6C1D6140000186A1" : "32363130"}
            aria-invalid={typedInvalid}
            spellCheck={false}
          />
          {typedInvalid && (
            <ZplFieldHint>
              <span className="text-error">
                {bank === "epc" ? loc.writeDataInvalidEpc : loc.writeDataInvalid}
              </span>
            </ZplFieldHint>
          )}
          {decoded && (
            <div className="rounded border border-border bg-surface-2 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-muted">
              <div className="text-text">{decoded.uri}</div>
              <div>
                {decoded.scheme === "sgtin96" ? loc.builderGtin : loc.builderSsccKey} {decoded.gs1Key}
                {decoded.serial !== undefined ? ` · ${loc.builderSerial} ${decoded.serial}` : ""}
                {` · ${loc.builderFilter} ${decoded.filter}`}
              </div>
            </div>
          )}
        </ZplField>
      </RegionFocus>

      <ZplField>
        <span className={labelCls}>{loc.builderHeading}</span>
        <SegmentedControl<EpcScheme>
          aria-label={loc.builderScheme}
          value={scheme}
          options={[
            { value: "sgtin96", label: loc.builderSgtin },
            { value: "sscc96", label: loc.builderSscc },
          ]}
          onChange={(next) => {
            const s = next ?? "sgtin96";
            setScheme(s);
            setFilter(s === "sgtin96" ? 1 : 6);
            setBuilderError(null);
          }}
        />
        <div className={`grid grid-cols-2 ${fieldGridCols}`}>
          <ZplSubField label={scheme === "sgtin96" ? loc.builderGtin : loc.builderSsccKey} className={fieldGridCell}>
            {(id) => (
              <SafeStringInput
                id={id}
                value={key}
                sanitize={digitsOnly}
                onChange={setKey}
                placeholder={scheme === "sgtin96" ? "08586011300855" : "385860112610000423"}
              />
            )}
          </ZplSubField>
          {scheme === "sgtin96" ? (
            <ZplSubField label={loc.builderSerial} className={fieldGridCell}>
              {(id) => (
                <SafeStringInput id={id} value={serial} sanitize={digitsOnly} onChange={setSerial} placeholder="100001" />
              )}
            </ZplSubField>
          ) : (
            // Keeps the filter and prefix on their own row of the subgrid.
            <div className={fieldGridCell} aria-hidden />
          )}
          <ZplSubField label={loc.builderFilter} className={fieldGridCell}>
            {(id) => (
              <BoundedIntControl
                id={id}
                min={FILTER_RANGE.min}
                max={FILTER_RANGE.max}
                value={filter}
                onChange={setFilter}
              />
            )}
          </ZplSubField>
          <ZplSubField label={loc.builderPrefix} className={fieldGridCell}>
            {(id) => (
              <BoundedIntControl
                id={id}
                min={COMPANY_PREFIX_DIGITS.min}
                max={COMPANY_PREFIX_DIGITS.max}
                value={prefixDigits}
                onChange={setPrefixDigits}
              />
            )}
          </ZplSubField>
        </div>
        <ZplFieldHint>{loc.builderFilterHint}</ZplFieldHint>
        <button type="button" onClick={build} className={builderButtonCls}>
          {loc.builderApply}
        </button>
        {builderError && (
          <ZplFieldHint>
            <span className="text-error">{loc[ERROR_KEYS[builderError]]}</span>
          </ZplFieldHint>
        )}
      </ZplField>
    </section>
  );
}
