/** The tag write a label carries: the fixed rfidWriteData, or an EPC computed
 *  from the label's variables (each printed row substitutes its own values
 *  into the variables, so the tag always matches the printed fields). */
import type { LabelConfig } from "../types/LabelConfig";
import type { Variable } from "../types/Variable";
import { encodeSgtin96, encodeSscc96, type EpcError } from "./epcEncode";

export type RfidWriteLabel = Pick<
  LabelConfig,
  | "rfidWriteData"
  | "rfidWriteBank"
  | "rfidWriteFrom"
  | "rfidKeyVariable"
  | "rfidSerialVariable"
  | "rfidEpcFilter"
  | "rfidFilterVariable"
  | "rfidPrefixVariable"
  | "rfidEpcPrefixDigits"
  | "rfidWritePc"
>;

export const RFID_DEFAULT_PREFIX_DIGITS = 7;
export const rfidDefaultFilter = (from: "sgtin96" | "sscc96"): number => (from === "sgtin96" ? 1 : 6);

export type RfidWriteResult =
  | { ok: true; hex: string }
  | { ok: false; error: EpcError | "keyVariable" | "serialVariable" | "prefixMismatch" }
  | null;

/** Hex the tag receives, an error naming why the EPC can't be built, or null
 *  when the design writes nothing. */
export function resolveRfidWrite(label: RfidWriteLabel, variables: readonly Variable[]): RfidWriteResult {
  const from = label.rfidWriteFrom;
  if (!from) return label.rfidWriteData ? { ok: true, hex: label.rfidWriteData } : null;
  const byId = (id: string | undefined) => (id === undefined ? undefined : variables.find((v) => v.id === id));
  const key = byId(label.rfidKeyVariable);
  if (!key) return { ok: false, error: "keyVariable" };
  const filterVar = byId(label.rfidFilterVariable);
  const filter = filterVar
    ? /^\d+$/.test(filterVar.defaultValue.trim()) ? Number(filterVar.defaultValue.trim()) : NaN
    : label.rfidEpcFilter ?? rfidDefaultFilter(from);
  // The prefix column may hold the company prefix itself (6-12 digits: its
  // length sets the partition) or the partition value (one digit, 0-6).
  const prefixVar = byId(label.rfidPrefixVariable);
  const prefixCell = prefixVar?.defaultValue.trim();
  if (prefixCell !== undefined && !/^\d+$/.test(prefixCell)) return { ok: false, error: "prefixLength" };
  const isPartition = prefixCell !== undefined && prefixCell.length === 1;
  const prefix = isPartition ? undefined : prefixCell;
  const digits = isPartition
    ? 12 - Number(prefixCell)
    : prefix !== undefined ? prefix.length : label.rfidEpcPrefixDigits ?? RFID_DEFAULT_PREFIX_DIGITS;
  const keyValue = key.defaultValue.trim();
  // The prefix follows the GTIN-14 indicator / SSCC extension digit.
  const keyBody = from === "sgtin96" ? keyValue.padStart(14, "0") : keyValue;
  if (prefix !== undefined && /^\d+$/.test(keyValue) && keyBody.slice(1, 1 + prefix.length) !== prefix) {
    return { ok: false, error: "prefixMismatch" };
  }
  if (from === "sscc96") return encodeSscc96(keyValue, filter, digits);
  const serial = byId(label.rfidSerialVariable);
  if (!serial) return { ok: false, error: "serialVariable" };
  return encodeSgtin96(keyValue, serial.defaultValue.trim(), filter, digits);
}

/** PC word for an EPC of `hexLength` digits: length in 16-bit words in bits
 *  15..11, UMI/XI/NSI left 0 (Gen2 §6.3.2.1.2.2). */
export function pcWordFor(hexLength: number): string {
  return ((hexLength / 4) << 11).toString(16).toUpperCase().padStart(4, "0");
}

/** ^RF field for the label's tag write, or null when it writes nothing (or the
 *  EPC can't be computed from the current values). */
export function rfidWriteCommand(label: RfidWriteLabel, variables: readonly Variable[] = []): string | null {
  const result = resolveRfidWrite(label, variables);
  if (!result || !result.ok) return null;
  const data = result.hex;
  if (label.rfidWriteBank === "user" && !label.rfidWriteFrom) {
    return `^RFW,H,0,${data.length / 2},3^FD${data}^FS`;
  }
  if (label.rfidWritePc) {
    // Word 1 of the EPC bank is the PC: write it and the EPC in one go.
    return `^RFW,H,1,${data.length / 2 + 2},1^FD${pcWordFor(data.length)}${data}^FS`;
  }
  return `^RFW,H^FD${data}^FS`;
}

/** GS1 TDS partition value for a company prefix of `digits` digits (12 - digits). */
export const partitionFor = (digits: number): number => 12 - digits;
