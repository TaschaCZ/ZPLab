import { describe, expect, it } from "vitest";
import { variablesFromColumns } from "./useMappingDraft";

describe("variablesFromColumns", () => {
  it("names each unbound column's variable after the column, with the sample as default", () => {
    const out = variablesFromColumns(
      [{ id: "a", name: "GTIN", fnNumber: 1, defaultValue: "" }],
      ["GTIN", "Sarze", "", "GTIN "],
      {},
      ["08581001010011", "2601", "x", "y"],
    );
    expect(out.map((c) => [c.header, c.variable.name, c.variable.fnNumber, c.variable.defaultValue])).toEqual([
      ["GTIN", "GTIN_2", 2, "08581001010011"],
      ["Sarze", "Sarze", 3, "2601"],
      ["GTIN ", "GTIN_3", 4, "y"],
    ]);
  });
  it("skips columns another variable already binds", () => {
    const out = variablesFromColumns([{ id: "a", name: "v", fnNumber: 1, defaultValue: "" }], ["GTIN", "SSCC"], { a: "GTIN" }, undefined);
    expect(out.map((c) => c.header)).toEqual(["SSCC"]);
  });
});
