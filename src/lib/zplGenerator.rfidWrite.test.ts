import { describe, it, expect } from "vitest";
import { generateZPL } from "@zplab/core/lib/zplGenerator";
import { parseZPL } from "@zplab/core/lib/zplParser";
import type { LabelConfig } from "@zplab/core/types/LabelConfig";

const base: LabelConfig = { widthMm: 100, heightMm: 150, dpmm: 8 };
const EPC = "30360C0C6C1D6140000186A1";

describe("^RF tag write", () => {
  it("emits nothing when the design writes no tag", () => {
    expect(generateZPL(base, [])).not.toContain("^RF");
  });

  it("writes the 96-bit EPC with the ^RF defaults and round-trips it", () => {
    const zpl = generateZPL({ ...base, rfidTagType: 8, rfidWriteData: EPC }, []);
    expect(zpl).toContain(`^RFW,H^FD${EPC}^FS`);
    expect(zpl.indexOf("^RS8")).toBeLessThan(zpl.indexOf("^RFW"));
    const back = parseZPL(zpl, 8);
    expect(back.labelConfig.rfidWriteData).toBe(EPC);
    expect(back.labelConfig.rfidWriteBank).toBeUndefined();
    // The data writes the tag; it must not turn into a printed text object.
    expect(back.pages.flatMap((p) => p.objects)).toHaveLength(0);
  });

  it("writes user memory from block 0 with the byte count and round-trips it", () => {
    const zpl = generateZPL({ ...base, rfidWriteData: "32363130", rfidWriteBank: "user" }, []);
    expect(zpl).toContain("^RFW,H,0,4,3^FD32363130^FS");
    const back = parseZPL(zpl, 8).labelConfig;
    expect(back.rfidWriteData).toBe("32363130");
    expect(back.rfidWriteBank).toBe("user");
  });

  it("imports a lowercase hex write and keeps unmodelled ^RF forms off the label", () => {
    const parsed = parseZPL(`^XA^RS8^RFW,H^FD${EPC.toLowerCase()}^FS^RFR,H^FN1^FS^XZ`, 8);
    expect(parsed.labelConfig.rfidWriteData).toBe(EPC);
    expect(parsed.pages.flatMap((p) => p.objects)).toHaveLength(0);
  });
});
