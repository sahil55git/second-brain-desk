import { describe, expect, it } from "vitest";
import { SlipPrintError, explainSlipError, guessPaper, isLabelPrinterName, slipCandidates, slipId } from "../slipPrinter";

describe("slip printer choice", () => {
  it("knows 2-inch and 3-inch printers by name", () => {
    expect(guessPaper("MPT-III_34AB")).toBe(80);
    expect(guessPaper("MPT-II")).toBe(58);
    expect(guessPaper("POSIFLOW 80B")).toBe(80);
    expect(guessPaper("BT-58 printer")).toBe(58);
    expect(guessPaper("Printer001")).toBe(80);
  });
  it("never picks a label printer for slips", () => {
    expect(isLabelPrinterName("Helett H30C")).toBe(true);
    expect(isLabelPrinterName("MPT-III_34AB")).toBe(false);
    const list = slipCandidates([
      { id: "nbt:AA", name: "Helett H30C", kind: "bluetooth", printer: true },
      { id: "nbt:BB", name: "iScale BT-0203", kind: "bluetooth", printer: false },
      { id: "nbt:CC", name: "MPT-III_34AB", kind: "bluetooth", printer: true },
      { id: "nusb:1:2", name: "USB printer", kind: "usb", printer: true },
    ]);
    // a USB cable printer is a normal choice now (best first: printers, then other devices)
    expect(list.map((p) => p.id)).toEqual(["nbt:CC", "nusb:1:2", "nbt:BB"]);
  });
});

describe("messages", () => {
  it("says what to do for each failure", () => {
    expect(explainSlipError(new SlipPrintError("BT_OFF", "x")).fix).toBe("bt-on");
    expect(explainSlipError(new SlipPrintError("PAPER_OUT", "x")).en).toMatch(/paper/i);
    expect(explainSlipError({ code: "NOT_PAIRED" }).fix).toBe("pair");
    expect(explainSlipError({ code: "USB_UNPLUGGED" }).en).toMatch(/USB/);
    expect(explainSlipError({ code: "USB_DENIED" }).en).toMatch(/allow/i);
    expect(explainSlipError(new Error("socket closed")).en).toMatch(/not answering/i);
  });
  it("the same slip keeps the same id (a retry replaces it)", () => {
    const d = { title: "RECEIPT", no: "12", when: "now", rows: [{ name: "a" }] };
    expect(slipId(d)).toBe(slipId({ ...d }));
    expect(slipId(d)).not.toBe(slipId({ ...d, no: "13" }));
  });
});
