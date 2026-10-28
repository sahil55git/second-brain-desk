import { describe, expect, it } from "vitest";
import { MAX_PRINTERS, defaultPrinter, emptyBook, makeDefault, patchPrinter, printersFor, readBook, removePrinter, savePrinter } from "../savedPrinters";
import { pickKnownDevice, usbDeviceId, usbMatches } from "../directPrint";

const helett = { name: "Helett H30C", for: "label" as const, mode: "direct" as const, via: "bluetooth" as const, deviceId: "abc", cfg: { lang: "tspl" as const, density: 8 } };

describe("saved printers", () => {
  it("the first printer saved for a kind becomes its default, the next one does not", () => {
    let b = emptyBook();
    const a = savePrinter(b, helett);
    b = a.book;
    expect(defaultPrinter(b, "label")?.id).toBe(a.saved.id);
    expect(defaultPrinter(b, "slip")).toBeNull();
    const c = savePrinter(b, { ...helett, name: "Old label printer" });
    expect(defaultPrinter(c.book, "label")?.id).toBe(a.saved.id);
    expect(printersFor(c.book, "label")).toHaveLength(2);
    expect(printersFor(c.book, "slip")).toHaveLength(0);
  });
  it("saving the same name again updates it instead of adding a copy", () => {
    const a = savePrinter(emptyBook(), helett);
    const b = savePrinter(a.book, { ...helett, name: " helett  h30c ", deviceId: "new-id" });
    expect(b.book.printers).toHaveLength(1);
    expect(b.saved.id).toBe(a.saved.id);
    expect(b.book.printers[0].deviceId).toBe("new-id");
  });
  it("needs a name and stops at the limit", () => {
    expect(() => savePrinter(emptyBook(), { ...helett, name: "   " })).toThrow(/name/);
    let b = emptyBook();
    for (let i = 0; i < MAX_PRINTERS; i++) b = savePrinter(b, { ...helett, name: `P${i}` }).book;
    expect(() => savePrinter(b, { ...helett, name: "one more" })).toThrow(/up to/);
  });
  it("deleting the default moves the default to another of the same kind, or clears it", () => {
    let b = emptyBook();
    const a = savePrinter(b, helett);
    const c = savePrinter(a.book, { ...helett, name: "Second" });
    b = removePrinter(c.book, a.saved.id);
    expect(defaultPrinter(b, "label")?.id).toBe(c.saved.id);
    b = removePrinter(b, c.saved.id);
    expect(defaultPrinter(b, "label")).toBeNull();
    expect(b.printers).toHaveLength(0);
  });
  it("can make another printer the default for its own kind only", () => {
    const a = savePrinter(emptyBook(), helett);
    const s = savePrinter(a.book, { name: "POSIFLOW", for: "slip", mode: "helper", helper: "POSIFLOW 80B" });
    const c = savePrinter(s.book, { ...helett, name: "Spare" });
    const b = makeDefault(c.book, c.saved.id);
    expect(defaultPrinter(b, "label")?.name).toBe("Spare");
    expect(defaultPrinter(b, "slip")?.name).toBe("POSIFLOW");
  });
  it("patching settings keeps the rest of the saved settings", () => {
    const a = savePrinter(emptyBook(), helett);
    const b = patchPrinter(a.book, a.saved.id, { cfg: { density: 12 } });
    expect(b.printers[0].cfg).toEqual({ lang: "tspl", density: 12 });
  });
  it("reading damaged storage never throws and drops what it cannot trust", () => {
    expect(readBook(null)).toEqual(emptyBook());
    expect(readBook("x")).toEqual(emptyBook());
    const b = readBook({ printers: [null, { id: "1", name: "ok", for: "label", mode: "nonsense" }, { id: "2", name: "", for: "label" }, { id: "3", name: "bad kind", for: "poster" }], defaults: { label: "1", slip: "zzz" } });
    expect(b.printers.map((p) => p.id)).toEqual(["1"]);
    expect(b.printers[0].mode).toBe("window"); // unknown mode falls back
    expect(b.defaults).toEqual({ label: "1" });
  });
});

describe("finding the same device again", () => {
  it("matches a Bluetooth printer by its saved id and a USB printer by vendor and product", () => {
    expect(pickKnownDevice([{ id: "a" }, { id: "b" }], "b")).toEqual({ id: "b" });
    expect(pickKnownDevice([{ id: "a" }], "zzz")).toBeNull();
    expect(usbDeviceId(0x0483, 0x5740)).toBe("usb:483:5740");
    expect(usbMatches({ vendorId: 0x0483, productId: 0x5740 }, "usb:483:5740")).toBe(true);
    expect(usbMatches({ vendorId: 1, productId: 2 }, "usb:483:5740")).toBe(false);
  });
});
