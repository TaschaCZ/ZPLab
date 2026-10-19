import { describe, expect, it } from "vitest";
import { decodeEpc96, encodeSgtin96, encodeSscc96, gs1CheckDigit } from "./epcEncode";

describe("gs1CheckDigit", () => {
  it("matches known GS1 keys", () => {
    expect(gs1CheckDigit("0858601130085")).toBe(5);
    expect(gs1CheckDigit("38586011261000042")).toBe(3);
    expect(gs1CheckDigit("859123456789")).toBe(3);
  });
});

describe("encodeSgtin96", () => {
  it("encodes GTIN 08586011300855, serial 100001, filter 1, 7-digit prefix", () => {
    expect(encodeSgtin96("08586011300855", "100001", 1, 7)).toEqual({
      ok: true,
      hex: "30360C0C6C1D6140000186A1",
    });
  });
  it("pads a GTIN-13", () => {
    expect(encodeSgtin96("8586011300855", "100001", 1, 7)).toEqual({
      ok: true,
      hex: "30360C0C6C1D6140000186A1",
    });
  });
  it("rejects a wrong check digit, leading-zero serials and out-of-range input", () => {
    expect(encodeSgtin96("08586011300856", "1", 1, 7)).toEqual({ ok: false, error: "gtinCheckDigit" });
    expect(encodeSgtin96("08586011300855", "000123", 1, 7)).toEqual({ ok: false, error: "serialFormat" });
    expect(encodeSgtin96("08586011300855", "274877906944", 1, 7)).toEqual({ ok: false, error: "serialRange" });
    expect(encodeSgtin96("08586011300855", "1", 8, 7)).toEqual({ ok: false, error: "filter" });
    expect(encodeSgtin96("08586011300855", "1", 1, 5)).toEqual({ ok: false, error: "prefixLength" });
  });
});

describe("encodeSscc96", () => {
  it("encodes SSCC 385860112610000423, filter 6, 7-digit prefix", () => {
    expect(encodeSscc96("385860112610000423", 6, 7)).toEqual({
      ok: true,
      hex: "31D60C0C6CC25EE96A000000",
    });
  });
  it("rejects a wrong check digit", () => {
    expect(encodeSscc96("385860112610000424", 6, 7)).toEqual({ ok: false, error: "ssccCheckDigit" });
  });
});

describe("decodeEpc96", () => {
  it("round-trips SGTIN-96", () => {
    expect(decodeEpc96("30360C0C6C1D6140000186A1")).toMatchObject({
      scheme: "sgtin96",
      filter: 1,
      partition: 5,
      companyPrefix: "8586011",
      reference: "030085",
      serial: "100001",
      gs1Key: "08586011300855",
      uri: "urn:epc:id:sgtin:8586011.030085.100001",
    });
  });
  it("round-trips SSCC-96", () => {
    expect(decodeEpc96("31D60C0C6CC25EE96A000000")).toMatchObject({
      scheme: "sscc96",
      filter: 6,
      gs1Key: "385860112610000423",
      uri: "urn:epc:id:sscc:8586011.3261000042",
    });
  });
  it("returns null for other headers and lengths", () => {
    expect(decodeEpc96("E2801160600002054E5C1B21")).toBeNull();
    expect(decodeEpc96("3036")).toBeNull();
  });
});
