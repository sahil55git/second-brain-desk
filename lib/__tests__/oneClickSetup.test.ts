import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HELPER_FILE_PATH, helperSetupBat, newPairingCode, pairingCodeOk } from "../printHelper";
import { bookWithHelper } from "../printerDetect";
import { emptyBook, savePrinter } from "../savedPrinters";

describe("one-click printing set-up", () => {
  it("makes pairing codes the helper accepts", () => {
    const c = newPairingCode(() => new Uint8Array([0x3f, 0xa9, 0x0c, 0x1b, 0x77, 0xde, 0x92, 0xa4]));
    expect(c).toBe("3FA9-0C1B-77DE-92A4");
    expect(pairingCodeOk(newPairingCode())).toBe(true);
  });

  it("the set-up file fetches the helper from the app, writes the code and starts it with Windows", () => {
    const bat = helperSetupBat("https://mahadev.vercel.app/", "3FA9-0C1B-77DE-92A4");
    expect(bat).toContain(`https://mahadev.vercel.app${HELPER_FILE_PATH}`);
    expect(bat).toContain('> "%CDIR%\\pairing_code.txt" echo 3FA9-0C1B-77DE-92A4');
    expect(bat).toContain("Startup");
    expect(bat).toContain("\r\n");
    // a ")" inside a ( ... ) block would end the block early in cmd
    expect(bat).not.toMatch(/^ +echo [^\r\n]*[^^]\)/m);
  });

  it("refuses odd codes and addresses (they are written into a file that runs)", () => {
    expect(() => helperSetupBat("https://x.app", "nope")).toThrow();
    expect(() => helperSetupBat("https://x.app/' & del *", "3FA9-0C1B-77DE-92A4")).toThrow();
  });

  it("the copy the app serves is the same as tools/print_helper.py", () => {
    const root = join(__dirname, "..", "..");
    expect(readFileSync(join(root, "public", HELPER_FILE_PATH), "utf8")).toBe(readFileSync(join(root, "tools", "print_helper.py"), "utf8"));
  });

  it("saves the label printer and the receipt printer found by the helper as the defaults", () => {
    const { book, picks } = bookWithHelper(emptyBook(), ["Microsoft Print to PDF", "H30C Thermal Printer", "POSIFLOW 80B", "OneNote"]);
    expect(picks.label).toMatchObject({ mode: "helper", helper: "H30C Thermal Printer", for: "label" });
    expect(picks.slip).toMatchObject({ mode: "helper", helper: "POSIFLOW 80B", for: "slip" });
    expect(book.defaults.label).toBe(picks.label!.id);
    expect(book.defaults.slip).toBe(picks.slip!.id);
  });

  it("with only a label printer, no slip printer is made up; a saved print-window entry of the same name becomes one-click", () => {
    const b0 = savePrinter(emptyBook(), { name: "H30C Thermal Printer", for: "label", mode: "window" }).book;
    const { book, picks } = bookWithHelper(b0, ["H30C Thermal Printer"]);
    expect(picks.slip).toBeUndefined();
    expect(book.printers.filter((p) => p.for === "label")).toHaveLength(1);
    expect(book.printers[0]).toMatchObject({ mode: "helper", helper: "H30C Thermal Printer" });
  });
});
