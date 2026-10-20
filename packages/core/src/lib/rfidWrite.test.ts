import { describe, expect, it } from "vitest";
import { resolveRfidWrite } from "./rfidWrite";
import type { Variable } from "../types/Variable";

const v = (id: string, defaultValue: string): Variable => ({ id, name: id, fnNumber: 1, defaultValue });
const vars = [
  v("g", "08581001010011"), v("s", "100001"), v("f", "1"), v("p", "8581001"), v("part", "5"),
  v("bad", "858100X"), v("sscc", "385810012610100015"), v("f6", "6"),
];
const base = { rfidWriteFrom: "sgtin96", rfidKeyVariable: "g", rfidSerialVariable: "s" } as const;
const S01 = { ok: true, hex: "30360BBE2400FA40000186A1" };

describe("resolveRfidWrite: filter and prefix from data or fixed", () => {
  it("takes the fixed defaults (filter 1, 7 digits = partition 5)", () => {
    expect(resolveRfidWrite(base, vars)).toEqual(S01);
  });
  it("takes the prefix length from a company-prefix column", () => {
    expect(resolveRfidWrite({ ...base, rfidEpcPrefixDigits: 6, rfidPrefixVariable: "p", rfidFilterVariable: "f" }, vars)).toEqual(S01);
  });
  it("takes a one-digit column as the partition", () => {
    expect(resolveRfidWrite({ ...base, rfidEpcPrefixDigits: 6, rfidPrefixVariable: "part" }, vars)).toEqual(S01);
  });
  it("flags a prefix the key does not start with, and a non-numeric prefix", () => {
    expect(resolveRfidWrite({ ...base, rfidPrefixVariable: "s" }, vars)).toEqual({ ok: false, error: "prefixMismatch" });
    expect(resolveRfidWrite({ ...base, rfidPrefixVariable: "bad" }, vars)).toEqual({ ok: false, error: "prefixLength" });
  });
  it("reads the filter from a column, rejecting a value outside 0-7", () => {
    expect(resolveRfidWrite({ ...base, rfidFilterVariable: "s" }, vars)).toEqual({ ok: false, error: "filter" });
    expect(resolveRfidWrite({ rfidWriteFrom: "sscc96", rfidKeyVariable: "sscc", rfidFilterVariable: "f6", rfidPrefixVariable: "p" }, vars))
      .toMatchObject({ ok: true });
  });
});
