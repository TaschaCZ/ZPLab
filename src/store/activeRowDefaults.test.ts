import { describe, expect, it } from "vitest";
import { variablesWithActiveRow } from "./usePreviewBinding";
import { fillEmptyDefaultsFromRow } from "./slices/dataSlice";
import type { Variable } from "@zplab/core/types/Variable";

const vars: Variable[] = [
  { id: "g", name: "GTIN_cislo", fnNumber: 1, defaultValue: "" },
  { id: "s", name: "Serial", fnNumber: 2, defaultValue: "1" },
  { id: "u", name: "Unbound", fnNumber: 3, defaultValue: "" },
];
const mapping = { bindings: { g: "GTIN", s: "SER" }, headerSnapshot: ["GTIN", "SER"] };
const headers = ["GTIN", "SER"];

describe("variablesWithActiveRow", () => {
  it("lets a bound, non-empty cell stand in for the default", () => {
    const out = variablesWithActiveRow(vars, { headers, row: ["08581001010011", ""], mapping });
    expect(out.map((v) => v.defaultValue)).toEqual(["08581001010011", "1", ""]);
  });
  it("returns the same array without an active row", () => {
    expect(variablesWithActiveRow(vars, null)).toBe(vars);
  });
});

describe("fillEmptyDefaultsFromRow", () => {
  it("seeds only empty defaults of bound variables", () => {
    const out = fillEmptyDefaultsFromRow(vars, headers, ["08581001010011", "100001"], mapping);
    expect(out.map((v) => v.defaultValue)).toEqual(["08581001010011", "1", ""]);
    expect(out[1]).toBe(vars[1]);
    expect(out[2]).toBe(vars[2]);
  });
  it("keeps everything without a row", () => {
    expect(fillEmptyDefaultsFromRow(vars, headers, undefined, mapping)).toEqual(vars);
  });
});
