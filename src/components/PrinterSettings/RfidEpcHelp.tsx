import { useT } from "../../hooks/useT";
import type { EpcScheme } from "@zplab/core/lib/epcEncode";

type LocRfid = ReturnType<typeof useT>["printerSettings"]["rfid"];

/** TDS filter values per scheme (GS1 EPC Tag Data Standard, tables 10-1 / 10-3). */
const FILTER_MEANING: Record<EpcScheme, readonly (keyof LocRfid)[]> = {
  sgtin96: [
    "filterOthers", "filterPos", "filterFullCase", "filterReserved",
    "filterInnerPack", "filterReserved", "filterUnitLoad", "filterComponent",
  ],
  sscc96: [
    "filterOthers", "filterReserved", "filterFullCase", "filterReserved",
    "filterReserved", "filterReserved", "filterUnitLoad", "filterReserved",
  ],
};

/** Partition rows: prefix digits 12..6; the remaining reference digits differ
 *  per scheme (SGTIN item reference incl. indicator, SSCC serial reference
 *  incl. extension digit). */
const PARTITIONS = [0, 1, 2, 3, 4, 5, 6].map((p) => ({
  p,
  prefix: 12 - p,
  sgtin96: 1 + p,
  sscc96: 5 + p,
}));

const cell = "px-1.5 py-0.5 border-b border-border/50";

/** Student-facing explanation of the three EPC parameters, with the current
 *  partition and filter highlighted. */
export function RfidEpcHelp({
  scheme,
  filter,
  prefixDigits,
}: {
  scheme: EpcScheme;
  filter?: number;
  prefixDigits?: number;
}) {
  const loc = useT().printerSettings.rfid;
  const hl = (on: boolean) => (on ? "bg-accent-dim text-text" : "");
  return (
    <details className="rounded border border-border px-2 py-1.5 text-xs text-muted">
      <summary className="cursor-pointer text-text">{loc.helpToggle}</summary>
      <div className="mt-2 flex flex-col gap-2 leading-relaxed">
        <p>{loc.helpPrefix}</p>
        <p>{loc.helpPartition}</p>
        <table className="w-full font-mono text-[10px]">
          <thead>
            <tr className="text-left text-text">
              <th className={cell}>{loc.helpColPartition}</th>
              <th className={cell}>{loc.helpColPrefix}</th>
              <th className={cell}>{scheme === "sgtin96" ? loc.helpColItemRef : loc.helpColSerialRef}</th>
            </tr>
          </thead>
          <tbody>
            {PARTITIONS.map((r) => (
              <tr key={r.p} className={hl(r.prefix === prefixDigits)}>
                <td className={cell}>{r.p}</td>
                <td className={cell}>{r.prefix}</td>
                <td className={cell}>{r[scheme]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>{loc.helpFilter}</p>
        <table className="w-full font-mono text-[10px]">
          <thead>
            <tr className="text-left text-text">
              <th className={cell}>{loc.helpColValue}</th>
              <th className={cell}>{loc.helpColMeaning}</th>
            </tr>
          </thead>
          <tbody>
            {FILTER_MEANING[scheme].map((key, value) => (
              <tr key={value} className={hl(value === filter)}>
                <td className={cell}>{value}</td>
                <td className={cell}>{loc[key]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>{loc.helpVariable}</p>
      </div>
    </details>
  );
}
