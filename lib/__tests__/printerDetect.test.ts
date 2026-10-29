import { describe, expect, it } from "vitest";
import { buildOptions, nameForNew, nothingDetected, pickInitial, suitsKind, type Detected } from "../printerDetect";
import { emptyBook, makeDefault, savePrinter } from "../savedPrinters";
import { usbLabel, usbLooksLikePrinter } from "../directPrint";

const found = (p: Partial<Detected>): Detected => ({ ...nothingDetected(), ...p });

describe("printer detection list", () => {
  it("with nothing saved and nothing found, the page offers the print window", () => {
    const o = buildOptions(emptyBook(), "label", nothingDetected());
    expect(o.map((x) => x.key)).toEqual(["window"]);
    expect(pickInitial(o, "label")?.key).toBe("window");
  });

  it("a USB label printer plugged in and allowed before is offered and chosen by itself", () => {
    const d = found({ usb: [{ deviceId: "usb:1fc9:2016", name: "Helett H30C" }] });
    const o = buildOptions(emptyBook(), "label", d);
    expect(o[0]).toMatchObject({ key: "usb:1fc9:2016", source: "usb", mode: "direct", ready: true });
    expect(pickInitial(o, "label")?.key).toBe("usb:1fc9:2016");
  });

  it("puts the printer that suits the page first: the label printer on label pages, the receipt printer on slip pages", () => {
    const d = found({ usb: [{ deviceId: "usb:1:1", name: "Posiflow PF-80 receipt" }, { deviceId: "usb:2:2", name: "Helett H30C" }] });
    expect(pickInitial(buildOptions(emptyBook(), "label", d), "label")?.name).toBe("Helett H30C");
    expect(pickInitial(buildOptions(emptyBook(), "slip", d), "slip")?.name).toBe("Posiflow PF-80 receipt");
  });

  it("a saved printer is not listed twice when it is also found, and shows whether it is plugged in", () => {
    const b = savePrinter(emptyBook(), { name: "Counter labels", for: "label", mode: "direct", via: "usb", deviceId: "usb:1fc9:2016" }).book;
    const here = buildOptions(b, "label", found({ usb: [{ deviceId: "usb:1fc9:2016", name: "Helett H30C" }] }));
    expect(here.filter((x) => x.deviceId === "usb:1fc9:2016")).toHaveLength(1);
    expect(here[0]).toMatchObject({ source: "saved", name: "Counter labels", ready: true, isDefault: true });
    const gone = buildOptions(b, "label", nothingDetected());
    expect(gone[0]).toMatchObject({ ready: false, detail: "USB · not plugged in" });
  });

  it("starts on the printer used last, else the default", () => {
    let b = savePrinter(emptyBook(), { name: "A", for: "label", mode: "window" }).book;
    const second = savePrinter(b, { name: "B", for: "label", mode: "queue" });
    b = second.book;
    const o = buildOptions(b, "label", nothingDetected());
    expect(pickInitial(o, "label")?.name).toBe("A");
    expect(pickInitial(o, "label", `saved:${second.saved.id}`)?.name).toBe("B");
    expect(pickInitial(o, "label", "saved:gone")?.name).toBe("A");
    b = makeDefault(b, second.saved.id);
    expect(pickInitial(buildOptions(b, "label", nothingDetected()), "label")?.name).toBe("B");
  });

  it("only shows the slip printers on slip pages", () => {
    const b = savePrinter(emptyBook(), { name: "Helett", for: "label", mode: "window" }).book;
    expect(buildOptions(b, "slip", nothingDetected()).map((x) => x.key)).toEqual(["window"]);
  });

  it("lists the print helper's printers and the shop PC printer, and the share option on a phone", () => {
    const d = found({ helper: { running: true, printers: ["Helett H30C", "Microsoft Print to PDF"] }, queue: { online: true, labelPrinter: "Helett H30C", slipPrinter: "POS-80" } });
    const o = buildOptions(emptyBook(), "slip", d, { share: true });
    expect(o.map((x) => x.key)).toEqual(["queue", "helper:Helett H30C", "helper:Microsoft Print to PDF", "share", "window"]);
    expect(o[0].name).toBe("Shop PC: POS-80");
  });

  it("a helper that is not running marks its saved printer as not ready", () => {
    const b = savePrinter(emptyBook(), { name: "PC label printer", for: "label", mode: "helper", helper: "Helett H30C" }).book;
    expect(buildOptions(b, "label", found({ helper: { running: false, printers: [] } }))[0]).toMatchObject({ ready: false, detail: "PC helper · not running" });
    expect(buildOptions(b, "label", found({ helper: { running: true, printers: ["Helett H30C"] } }))[0]).toMatchObject({ ready: true });
  });

  it("names a new printer without clashing with a saved one", () => {
    const b = savePrinter(emptyBook(), { name: "Helett H30C", for: "label", mode: "window" }).book;
    const o = { key: "usb:x", source: "usb" as const, name: "Helett H30C", detail: "", mode: "direct" as const, ready: true };
    expect(nameForNew(o, b, "label")).toBe("Helett H30C 2");
    expect(nameForNew(o, b, "slip")).toBe("Helett H30C");
  });

  it("guesses label and receipt printers from their names", () => {
    expect(suitsKind("Helett H30C", "label")).toBe(true);
    expect(suitsKind("POSIFLOW PF-58", "slip")).toBe(true);
    expect(suitsKind("Helett H30C", "slip")).toBe(false);
  });

  it("names USB devices and keeps only printer-like ones", () => {
    expect(usbLabel({ manufacturerName: "Helett", productName: "H30C", vendorId: 1, productId: 2 })).toBe("Helett H30C");
    expect(usbLabel({ vendorId: 0x1fc9, productId: 0x2016 })).toBe("USB 1fc9:2016");
    expect(usbLooksLikePrinter({ configuration: { interfaces: [{ alternates: [{ interfaceClass: 7 }] }] } })).toBe(true);
    expect(usbLooksLikePrinter({ configuration: { interfaces: [{ alternates: [{ interfaceClass: 3 }] }] } })).toBe(false);
    expect(usbLooksLikePrinter({ configuration: null })).toBe(true);
  });
});
