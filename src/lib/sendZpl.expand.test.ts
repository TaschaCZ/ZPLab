import { describe, expect, it } from "vitest";
import type { LabelObject } from "@zplab/core/types/Group";
import type { PageLabel } from "@zplab/core/types/LabelConfig";
import type { Variable } from "@zplab/core/types/Variable";
import { generateBatchZpl, generateZPL } from "@zplab/core/lib/zplGenerator";
import { documentZpl, expandsRows, flattenPages, generateExpandedBatchZpl } from "./sendZpl";
import { generateMultiPageZPL } from "@zplab/core/lib/zplGenerator";

const LABEL = { widthMm: 100, heightMm: 200, dpmm: 8 } as PageLabel;

// The NiceLabel exercise sheet: one row per student, GTIN as 14-digit text.
const vars: Variable[] = [
  { id: "g", name: "GTIN_cislo", fnNumber: 7, defaultValue: "" },
  { id: "s", name: "Seriove", fnNumber: 9, defaultValue: "" },
];
const dataset = {
  headers: ["GTIN", "Pocatecni_seriove_cislo"],
  rows: [
    ["08581001010011", "100001"],
    ["08581002020019", "100002"],
  ],
};
const mapping = { bindings: { g: "GTIN", s: "Pocatecni_seriove_cislo" }, headerSnapshot: ["GTIN", "Pocatecni_seriove_cislo"] };

const gs1 = {
  id: "c",
  type: "code128",
  x: 32,
  y: 224,
  rotation: 0,
  props: {
    content: "01«GTIN_cislo»21«Seriove»",
    gs1: true,
    height: 226,
    moduleWidth: 4,
    printInterpretation: true,
    printInterpretationAbove: false,
    checkDigit: false,
    rotation: "N",
  },
} as unknown as LabelObject;

describe("generateExpandedBatchZpl", () => {
  it("prints each row as a full label with the GS1 data in place (no ^FE / ^XF)", () => {
    const zpl = generateExpandedBatchZpl(LABEL, [gs1], vars, dataset, mapping);
    expect(zpl).not.toContain("^FE");
    expect(zpl).not.toContain("^XF");
    expect(zpl).not.toContain("^DF");
    expect(zpl.match(/\^XA/g)).toHaveLength(2);
    expect(zpl).toContain("^FD(01)08581001010011(21)100001^FS");
    expect(zpl).toContain("^FD(01)08581002020019(21)100002^FS");
  });

  it("matches the single-label emit of the same literal content", () => {
    const literal = { ...gs1, props: { ...(gs1 as { props: object }).props, content: "010858100101001121100001" } } as LabelObject;
    const one = generateZPL(LABEL, [literal], []).trimEnd();
    const expanded = generateExpandedBatchZpl(LABEL, [gs1], vars, { ...dataset, rows: [dataset.rows[0]!] }, mapping);
    expect(expanded).toBe(one);
  });

  it("writes each row's own SGTIN-96 to its tag", () => {
    const label = {
      ...LABEL,
      rfidWriteFrom: "sgtin96",
      rfidKeyVariable: "g",
      rfidSerialVariable: "s",
      rfidEpcFilter: 1,
      rfidEpcPrefixDigits: 7,
    } as PageLabel;
    const zpl = generateExpandedBatchZpl(label, [gs1], vars, dataset, mapping);
    const writes = [...zpl.matchAll(/\^RFW,H\^FD([0-9A-F]+)\^FS/g)].map((m) => m[1]);
    expect(writes).toEqual(["30360BBE2400FA40000186A1", "30360BBE2801F440000186A2"]);
  });

  it("writes the PC word with the EPC when asked", () => {
    const label = {
      ...LABEL,
      rfidWriteFrom: "sgtin96",
      rfidKeyVariable: "g",
      rfidSerialVariable: "s",
      rfidWritePc: true,
    } as PageLabel;
    const zpl = generateExpandedBatchZpl(label, [gs1], vars, { ...dataset, rows: [dataset.rows[0]!] }, mapping);
    expect(zpl).toContain("^RFW,H,1,14,1^FD300030360BBE2400FA40000186A1^FS");
  });

  it("skips the tag write for a row whose EPC cannot be built", () => {
    const label = { ...LABEL, rfidWriteFrom: "sgtin96", rfidKeyVariable: "g", rfidSerialVariable: "s" } as PageLabel;
    const zpl = generateExpandedBatchZpl(label, [gs1], vars, { ...dataset, rows: [["123", "1"]] }, mapping);
    expect(zpl).not.toContain("^RFW");
  });

  it("keeps the stored-format batch unless the design asks to expand", () => {
    expect(expandsRows({})).toBe(false);
    expect(expandsRows({ batchExpandRows: true })).toBe(true);
    expect(expandsRows({ rfidWriteFrom: "sscc96" })).toBe(true);
    expect(generateBatchZpl(LABEL, [gs1], vars, dataset, mapping)).toContain("^XF");
  });

  it("flattens defaults into the fields for a print without data", () => {
    const withDefaults = vars.map((v) => ({ ...v, defaultValue: v.id === "g" ? "08581001010011" : "100001" }));
    const pages = flattenPages([{ objects: [gs1] }], withDefaults, LABEL);
    const zpl = generateMultiPageZPL(LABEL, pages, withDefaults);
    expect(zpl).not.toContain("^FE");
    expect(zpl).toContain("^FD(01)08581001010011(21)100001^FS");
  });

  it("flattens the document export too once the tag is computed from data", () => {
    const withDefaults = vars.map((v) => ({ ...v, defaultValue: v.id === "g" ? "08581001010011" : "100001" }));
    const label = { ...LABEL, rfidWriteFrom: "sgtin96", rfidKeyVariable: "g", rfidSerialVariable: "s", rfidWritePc: true } as PageLabel;
    const zpl = documentZpl({ label, pages: [{ objects: [gs1] }], variables: withDefaults });
    expect(zpl).not.toContain("^FE");
    expect(zpl).toContain("^FD(01)08581001010011(21)100001^FS");
    expect(zpl).toContain("^RFW,H,1,14,1^FD300030360BBE2400FA40000186A1^FS");
  });
});
