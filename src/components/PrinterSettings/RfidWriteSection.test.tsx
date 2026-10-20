// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent, act } from "@testing-library/react";
import { RfidWriteSection } from "./RfidWriteSection";
import { useLabelStore } from "../../store/labelStore";

afterEach(() => {
  cleanup();
  act(() => {
    useLabelStore.getState().setLabelConfig({
      rfidWriteData: undefined,
      rfidWriteBank: undefined,
      rfidWriteFrom: undefined,
      rfidKeyVariable: undefined,
      rfidSerialVariable: undefined,
      rfidWritePc: undefined,
    });
    useLabelStore.getState().setVariables([]);
  });
});

describe("RfidWriteSection", () => {
  it("builds SGTIN-96 from GTIN and serial and stores it as the tag write", () => {
    const { getByLabelText, getByRole, getByText } = render(<RfidWriteSection />);
    fireEvent.change(getByLabelText("GTIN"), { target: { value: "08586011300855" } });
    fireEvent.change(getByLabelText("Serial number"), { target: { value: "100001" } });
    fireEvent.click(getByRole("button", { name: "Compute and use" }));
    expect(useLabelStore.getState().label.rfidWriteData).toBe("30360C0C6C1D6140000186A1");
    expect(getByText("urn:epc:id:sgtin:8586011.030085.100001")).toBeTruthy();
  });

  it("builds SSCC-96 and reports a wrong check digit instead of storing", () => {
    const { getByLabelText, getByRole, getByText } = render(<RfidWriteSection />);
    fireEvent.click(getByRole("button", { name: "SSCC-96 (SSCC)" }));
    fireEvent.change(getByLabelText("SSCC"), { target: { value: "385860112610000424" } });
    fireEvent.click(getByRole("button", { name: "Compute and use" }));
    expect(useLabelStore.getState().label.rfidWriteData).toBeUndefined();
    expect(getByText("The SSCC check digit does not match.")).toBeTruthy();
    fireEvent.change(getByLabelText("SSCC"), { target: { value: "385860112610000423" } });
    fireEvent.click(getByRole("button", { name: "Compute and use" }));
    expect(useLabelStore.getState().label.rfidWriteData).toBe("31D60C0C6CC25EE96A000000");
  });

  it("keeps a typed EPC that is not 24 hex digits out of the design", () => {
    const { getByPlaceholderText, getByText } = render(<RfidWriteSection />);
    fireEvent.change(getByPlaceholderText("e.g. 30360C0C6C1D6140000186A1"), { target: { value: "3036" } });
    expect(useLabelStore.getState().label.rfidWriteData).toBeUndefined();
    expect(getByText("The EPC needs exactly 24 hex digits.")).toBeTruthy();
  });

  it("accepts any whole bytes in user memory", () => {
    act(() => useLabelStore.getState().setLabelConfig({ rfidWriteBank: "user" }));
    const { getByPlaceholderText } = render(<RfidWriteSection />);
    fireEvent.change(getByPlaceholderText("e.g. 32363130"), { target: { value: "32363130" } });
    expect(useLabelStore.getState().label.rfidWriteData).toBe("32363130");
  });

  it("computes the EPC from the chosen variables and shows what the current row writes", () => {
    act(() => {
      useLabelStore.getState().setVariables([
        { id: "g", name: "GTIN_cislo", fnNumber: 7, defaultValue: "08581001010011" },
        { id: "s", name: "Seriove", fnNumber: 9, defaultValue: "100001" },
      ]);
    });
    const { getByRole, getByText } = render(<RfidWriteSection />);
    fireEvent.click(getByRole("button", { name: "From data: SGTIN-96" }));
    expect(useLabelStore.getState().label.rfidWriteFrom).toBe("sgtin96");
    expect(getByText("Choose the variable with the key.")).toBeTruthy();
    act(() => {
      useLabelStore.getState().setLabelConfig({ rfidKeyVariable: "g", rfidSerialVariable: "s" });
    });
    expect(getByText("30360BBE2400FA40000186A1")).toBeTruthy();
    expect(getByText("urn:epc:id:sgtin:8581001.001001.100001")).toBeTruthy();
  });
});
