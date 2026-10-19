/** GS1 EPC Tag Data Standard encoders for the two schemes a label printer
 *  most often writes: SGTIN-96 (trade item + serial) and SSCC-96 (logistic
 *  unit). Pure functions, no state: the RFID tab builds the hex the ^RF
 *  field writes, and the decoder explains a hex the design already carries. */

export type EpcScheme = "sgtin96" | "sscc96";

export const SGTIN96_HEADER = 0x30;
export const SSCC96_HEADER = 0x31;

/** Partition table, TDS §14: index = partition value, entries = company
 *  prefix bits/digits and the remainder's bits/digits. */
const SGTIN_PARTITIONS = [
  [40, 12, 4, 1],
  [37, 11, 7, 2],
  [34, 10, 10, 3],
  [30, 9, 14, 4],
  [27, 8, 17, 5],
  [24, 7, 20, 6],
  [20, 6, 24, 7],
] as const;
const SSCC_PARTITIONS = [
  [40, 12, 18, 5],
  [37, 11, 21, 6],
  [34, 10, 24, 7],
  [30, 9, 28, 8],
  [27, 8, 31, 9],
  [24, 7, 34, 10],
  [20, 6, 38, 11],
] as const;

export const COMPANY_PREFIX_DIGITS = { min: 6, max: 12 } as const;
export const FILTER_RANGE = { min: 0, max: 7 } as const;
/** SGTIN-96 keeps the serial as a 38-bit integer without leading zeros. */
const SGTIN96_SERIAL_MAX = 2n ** 38n - 1n;

export type EpcResult = { ok: true; hex: string } | { ok: false; error: EpcError };
export type EpcError =
  | "gtinFormat"
  | "gtinCheckDigit"
  | "ssccFormat"
  | "ssccCheckDigit"
  | "prefixLength"
  | "filter"
  | "serialFormat"
  | "serialRange";

/** GS1 mod-10 check digit over the digits that precede it. */
export function gs1CheckDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const d = body.charCodeAt(body.length - 1 - i) - 48;
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return (10 - (sum % 10)) % 10;
}

function bits(value: bigint, width: number): string {
  return value.toString(2).padStart(width, "0");
}

function toHex(bitString: string): string {
  let hex = "";
  for (let i = 0; i < bitString.length; i += 4) {
    hex += parseInt(bitString.slice(i, i + 4), 2).toString(16).toUpperCase();
  }
  return hex;
}

function checkCommon(filter: number, prefixDigits: number): EpcError | null {
  if (!Number.isInteger(filter) || filter < FILTER_RANGE.min || filter > FILTER_RANGE.max) return "filter";
  if (
    !Number.isInteger(prefixDigits) ||
    prefixDigits < COMPANY_PREFIX_DIGITS.min ||
    prefixDigits > COMPANY_PREFIX_DIGITS.max
  )
    return "prefixLength";
  return null;
}

/** SGTIN-96 from a GTIN (8, 12, 13 or 14 digits, padded to 14) and a numeric
 *  serial. The GTIN check digit is verified, then dropped: EPC does not carry it. */
export function encodeSgtin96(
  gtin: string,
  serial: string,
  filter: number,
  prefixDigits: number,
): EpcResult {
  const common = checkCommon(filter, prefixDigits);
  if (common) return { ok: false, error: common };
  if (!/^\d{8}$|^\d{12,14}$/.test(gtin)) return { ok: false, error: "gtinFormat" };
  const g = gtin.padStart(14, "0");
  if (gs1CheckDigit(g.slice(0, 13)) !== Number(g[13])) return { ok: false, error: "gtinCheckDigit" };
  if (!/^(0|[1-9]\d*)$/.test(serial)) return { ok: false, error: "serialFormat" };
  const serialValue = BigInt(serial);
  if (serialValue > SGTIN96_SERIAL_MAX) return { ok: false, error: "serialRange" };
  const partition = 12 - prefixDigits;
  const row = SGTIN_PARTITIONS[partition];
  if (!row) return { ok: false, error: "prefixLength" };
  const [cpBits, , itemBits] = row;
  const companyPrefix = BigInt(g.slice(1, 1 + prefixDigits));
  // Item reference = indicator digit + the digits between prefix and check digit.
  const itemRef = BigInt(g[0] + g.slice(1 + prefixDigits, 13));
  const b =
    bits(BigInt(SGTIN96_HEADER), 8) +
    bits(BigInt(filter), 3) +
    bits(BigInt(partition), 3) +
    bits(companyPrefix, cpBits) +
    bits(itemRef, itemBits) +
    bits(serialValue, 38);
  return { ok: true, hex: toHex(b) };
}

/** SSCC-96 from an 18-digit SSCC: extension digit + serial reference join
 *  after the company prefix; the check digit is verified, then dropped. */
export function encodeSscc96(sscc: string, filter: number, prefixDigits: number): EpcResult {
  const common = checkCommon(filter, prefixDigits);
  if (common) return { ok: false, error: common };
  if (!/^\d{18}$/.test(sscc)) return { ok: false, error: "ssccFormat" };
  if (gs1CheckDigit(sscc.slice(0, 17)) !== Number(sscc[17])) return { ok: false, error: "ssccCheckDigit" };
  const partition = 12 - prefixDigits;
  const row = SSCC_PARTITIONS[partition];
  if (!row) return { ok: false, error: "prefixLength" };
  const [cpBits, , refBits] = row;
  const companyPrefix = BigInt(sscc.slice(1, 1 + prefixDigits));
  const serialRef = BigInt(sscc[0] + sscc.slice(1 + prefixDigits, 17));
  const b =
    bits(BigInt(SSCC96_HEADER), 8) +
    bits(BigInt(filter), 3) +
    bits(BigInt(partition), 3) +
    bits(companyPrefix, cpBits) +
    bits(serialRef, refBits) +
    bits(0n, 24);
  return { ok: true, hex: toHex(b) };
}

export interface DecodedEpc {
  scheme: EpcScheme;
  filter: number;
  partition: number;
  companyPrefix: string;
  /** SGTIN: indicator + item reference; SSCC: extension + serial reference. */
  reference: string;
  /** SGTIN only. */
  serial?: string;
  /** The GS1 key rebuilt with its check digit: GTIN-14 or SSCC. */
  gs1Key: string;
  /** Pure-identity URI, e.g. urn:epc:id:sgtin:8586011.030085.100001. */
  uri: string;
}

/** Decodes a 96-bit SGTIN or SSCC hex; null for anything else. */
export function decodeEpc96(hex: string): DecodedEpc | null {
  if (!/^[0-9A-Fa-f]{24}$/.test(hex)) return null;
  const b = BigInt(`0x${hex}`).toString(2).padStart(96, "0");
  const take = (from: number, width: number) => BigInt(`0b${b.slice(from, from + width) || "0"}`);
  const header = Number(take(0, 8));
  const filter = Number(take(8, 3));
  const partition = Number(take(11, 3));
  if (header === SGTIN96_HEADER) {
    const row = SGTIN_PARTITIONS[partition];
    if (!row) return null;
    const [cpBits, cpDigits, itemBits, itemDigits] = row;
    const cp = take(14, cpBits).toString().padStart(cpDigits, "0");
    const item = take(14 + cpBits, itemBits).toString().padStart(itemDigits, "0");
    const serial = take(58, 38).toString();
    const body = item[0] + cp + item.slice(1);
    return {
      scheme: "sgtin96",
      filter,
      partition,
      companyPrefix: cp,
      reference: item,
      serial,
      gs1Key: body + gs1CheckDigit(body),
      uri: `urn:epc:id:sgtin:${cp}.${item}.${serial}`,
    };
  }
  if (header === SSCC96_HEADER) {
    const row = SSCC_PARTITIONS[partition];
    if (!row) return null;
    const [cpBits, cpDigits, refBits, refDigits] = row;
    const cp = take(14, cpBits).toString().padStart(cpDigits, "0");
    const ref = take(14 + cpBits, refBits).toString().padStart(refDigits, "0");
    const body = ref[0] + cp + ref.slice(1);
    return {
      scheme: "sscc96",
      filter,
      partition,
      companyPrefix: cp,
      reference: ref,
      gs1Key: body + gs1CheckDigit(body),
      uri: `urn:epc:id:sscc:${cp}.${ref}`,
    };
  }
  return null;
}
